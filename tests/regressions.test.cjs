const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");

const templates = loadTypeScript("src/renderer/produceTemplate.ts");

test("unknown dynamic fields return validation issues in each payload field", () => {
  const issues = templates.validateProduceTemplateDraft({
    key: "${unknown}", headers: "${OTHER:option}", value: "${missing}"
  });
  assert.deepEqual(issues.map(({ field }) => field), ["key", "headers", "value"]);
  assert.equal(issues[0].message, "Unknown dynamic field: unknown.");
  assert.equal(issues[1].message, "Unknown dynamic field: other.");
});

test("supported and escaped fields remain valid, malformed ranges return issues", () => {
  assert.deepEqual(templates.validateProduceTemplateDraft({
    key: "${uuid}", headers: "\\${unknown}", value: "${seq:1..10|pad=3} ${timestamp|offset=+1h}"
  }), []);
  assert.equal(templates.validateProduceTemplateDraft({key: "", headers: "", value: "${random:bad}"}).length, 1);
  assert.equal(templates.renderProduceTemplateText("${seq:1..10|pad=3} \\${unknown}", 1), "001 ${unknown}");
});

test("date offsets are applied to timestamp rendering", () => {
  const start = Date.now();
  const rendered = Number(templates.renderProduceTemplateText("${timestamp|offset=+1h}", 1));
  assert.ok(rendered >= start + 3_600_000 && rendered <= Date.now() + 3_600_000);
});

test("split pane forwards topic activation through the hook for another topic", () => {
  const calls = [];
  const { useSplitPaneCallbacks } = loadTypeScript("src/renderer/hooks/callbacks/useSplitPaneCallbacks.ts", {
    react: { useMemo: (factory) => factory() }
  });
  const callbacks = useSplitPaneCallbacks({
    pane: { serverId: "server", topic: "source" },
    consumeState: {},
    activateSplitTopic: async (...args) => calls.push(["activate", ...args]),
    openTopicInWorkspace: async (...args) => calls.push(["open", ...args]),
    sendMessageToProduce: (...args) => calls.push(["draft", ...args])
  });
  const message = { value: "payload" };
  callbacks.sendToProduce(message, "target");
  assert.deepEqual(calls, [
    ["draft", "server", "target", message, "split", { navigate: false, payload: undefined }],
    ["activate", "target", "produce"]
  ]);
  calls.length = 0;
  callbacks.sendToProduce(message);
  assert.deepEqual(calls, [["draft", "server", "source", message, "split", { payload: undefined }]]);
  calls.length = 0;
  callbacks.sendToProduce(message, "target", "other-server");
  assert.equal(calls[0][4], "primary");
  assert.deepEqual(calls[1], ["open", { pane: "primary", serverId: "other-server", topic: "target" }, "target", "produce"]);
});

function resetFixture(describeGroups) {
  const writes = [];
  let offsetReads = 0;
  const admin = {
    describeGroups,
    fetchTopicOffsets: async () => { offsetReads += 1; return [{ partition: 0, low: "3", high: "20" }]; },
    fetchTopicOffsetsByTimestamp: async () => [{ partition: 0, offset: "12" }],
    setOffsets: async (request) => writes.push(request)
  };
  const { resetConsumerGroupOffsets } = loadTypeScript("src/main/ipc/consumerGroupQueries.ts", {
    "../kafkaClient.js": { withAdmin: async (_server, action) => action(admin) },
    "../logger.js": { writeAppLog: async () => {} },
    "./consumerGroupSummaries.js": {},
    "./consumerGroupLag.js": {}
  });
  return {
    writes,
    get offsetReads() { return offsetReads; },
    reset: (patch = {}) => resetConsumerGroupOffsets({
      serverId: "server", groupId: "group", topic: "topic", partitions: [0], mode: "latest", ...patch
    })
  };
}

test("reset propagates group lookup errors without reading or changing offsets", async () => {
  const error = new Error("permission denied");
  const fixture = resetFixture(async () => { throw error; });
  await assert.rejects(fixture.reset(), (caught) => caught === error);
  assert.equal(fixture.offsetReads, 0);
  assert.deepEqual(fixture.writes, []);
});

for (const groups of [[], [{ groupId: "different", state: "Empty", members: [] }], [{ groupId: "group", state: "", members: [] }]]) {
  test(`reset blocks unverifiable group information: ${JSON.stringify(groups)}`, async () => {
    const fixture = resetFixture(async () => ({ groups }));
    await assert.rejects(fixture.reset(), /Unable to verify consumer group state/);
    assert.equal(fixture.offsetReads, 0);
    assert.deepEqual(fixture.writes, []);
  });
}

for (const group of [{ state: "Stable", members: [] }, { state: "PreparingRebalance", members: [{}] }]) {
  test(`reset still blocks active groups: ${group.state}`, async () => {
    const fixture = resetFixture(async () => ({ groups: [{ groupId: "group", ...group }] }));
    await assert.rejects(fixture.reset(), /Consumer group is active/);
    assert.equal(fixture.offsetReads, 0);
    assert.deepEqual(fixture.writes, []);
  });
}

for (const [mode, offset] of [["earliest", "3"], ["latest", "20"], ["specific", "8"], ["timestamp", "12"]]) {
  test(`inactive group reset preserves ${mode} targets`, async () => {
    const fixture = resetFixture(async () => ({ groups: [{ groupId: "group", state: "Empty", members: [] }] }));
    const result = await fixture.reset({ mode, offset: "8", timestamp: 1000, partitions: [0, 0] });
    assert.deepEqual(result.partitions, [{ partition: 0, offset }]);
    assert.deepEqual(fixture.writes, [{ groupId: "group", topic: "topic", partitions: [{ partition: 0, offset }] }]);
  });
}
