const assert = require("node:assert/strict");
const test = require("node:test");
const load = require("./load-typescript.cjs");
const createHarness = require("./hook-harness.cjs");
const consume = "src/renderer/components/workspace/consume/";
const produce = "src/renderer/components/workspace/produce/";
const { prepareReplayDrafts } = load(consume + "prepareReplayDrafts.ts");
const { createReplayDraft, getReplayOrderedMessages, createReplayOverrideTree, getReplayOverrideLeafPaths } = load(consume + "replayDrafts.ts");
const { createValueColumnTree, getValueColumnLeafPaths } = load(consume + "valueColumnTree.ts");
const { createProduceIntervalPlan, getIntervalConfigurationIssue } = load(produce + "producePanelValidation.ts");
const message = (offset, value = '{"speed":10}', extra = {}) => ({ topic: "vehicles", partition: 0, offset: String(offset), timestamp: "2026-09-08T00:00:00Z", key: "vehicle", headers: { source: "test" }, value, ...extra });
const config = { mode: "interval", stopMode: "count", intervalMs: 100, totalCount: 2, durationText: "1m30s" };
const replay = patch => prepareReplayDrafts({ messages: [message(1), message(2)], order: "original", payload: { key: true, headers: true, value: true }, editedDraft: { key: "edited", headers: "{}", value: "edited" }, applyDynamicFields: false, fieldOverrides: [], language: "en", ...patch });

test("replay preserves grid order or sorts copies by partition/offset and timestamp", () => {
  const messages = [message(12), message(2), message(1, "x", { partition: 1 }), message(9, "x", { timestamp: "2026-09-07T00:00:00Z" })];
  assert.deepEqual(getReplayOrderedMessages(messages, "grid"), messages);
  assert.notEqual(getReplayOrderedMessages(messages, "grid"), messages);
  assert.deepEqual(getReplayOrderedMessages(messages, "original").map(m => m.offset), ["2", "9", "12", "1"]);
  assert.deepEqual(getReplayOrderedMessages(messages, "timestamp").map(m => m.offset), ["9", "2", "12", "1"]);
  assert.deepEqual(messages.map(m => m.offset), ["12", "2", "1", "9"]);
});

test("single replay renders the edited draft and excludes disabled payload fields", () => {
  const result = replay({ messages: [message(1)], payload: { key: false, headers: false, value: true }, editedDraft: { key: "${unknown}", headers: "invalid", value: '{"seq":${seq:1..9}}' } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.drafts, [{ key: "", headers: "{}", value: '{"seq":1}' }]);
  assert.deepEqual(createReplayDraft(message(1, "binary", { decoded: { value: { speed: 42 } } }), { key: true, headers: false, value: true }), { key: "vehicle", headers: "{}", value: '{\n  "speed": 42\n}' });
});

test("batch replay keeps literal tokens until dynamic fields are enabled", () => {
  const messages = [message(2, '{"seq":"${seq:1..9}"}'), message(1, '{"seq":"${seq:1..9}"}')];
  const literal = replay({ messages });
  assert.equal(literal.ok, true);
  assert.equal(JSON.parse(literal.drafts[0].value).seq, "${seq:1..9}");
  const rendered = replay({ messages, applyDynamicFields: true, fieldOverrides: [{ id: "1", path: " value.speed ", value: "${seq:10..20}" }] });
  assert.equal(rendered.ok, true);
  assert.deepEqual(rendered.drafts.map(d => JSON.parse(d.value)), [{ seq: "1", speed: 10 }, { seq: "2", speed: 11 }]);
  assert.equal(messages[0].value, '{"seq":"${seq:1..9}"}');
});

test("replay rejects an entire batch when a later JSON payload or headers are invalid", () => {
  const invalidJson = replay({ messages: [message(1), message(2, '{"broken":')] });
  assert.equal(invalidJson.ok, false);
  assert.equal("drafts" in invalidJson, false);
  const invalidHeaders = replay({ messages: [message(1)], editedDraft: { key: "", headers: "not-json", value: "hello" } });
  assert.equal(invalidHeaders.ok, false);
  const invalidToken = replay({ applyDynamicFields: true, fieldOverrides: [{ id: "1", path: "value.speed", value: "${unknown}" }] });
  assert.equal(invalidToken.ok, false);
  assert.match(invalidToken.error, /Unknown dynamic field/);
  assert.equal(replay({ messages: [message(1, "plain"), message(2)], applyDynamicFields: true, fieldOverrides: [{ id: "1", path: "value.speed", value: "1" }] }).ok, false);
});

test("field trees preserve different parent-selection rules for columns and overrides", () => {
  const paths = ["value.position", "value.position.lat", "value.position.lon", "value.speed", "value.speed"];
  assert.deepEqual(getValueColumnLeafPaths(createValueColumnTree(paths)), paths.slice(0, 4));
  assert.deepEqual(getReplayOverrideLeafPaths(createReplayOverrideTree(paths)), paths.slice(1, 4));
});

test("interval planning clamps limits and validates in the original error order", () => {
  assert.deepEqual(createProduceIntervalPlan({ ...config, intervalMs: 99.5, totalCount: 100001 }), { count: 100000, delay: 100, durationMs: 90000, estimatedMax: 100000 });
  assert.equal(createProduceIntervalPlan({ ...config, stopMode: "duration", intervalMs: 400 }).estimatedMax, 225);
  assert.match(getIntervalConfigurationIssue({ ...config, intervalMs: 1, totalCount: 0 }, [], "en"), /Every/);
  for (const totalCount of [0, 100001, NaN, Infinity]) assert.match(getIntervalConfigurationIssue({ ...config, totalCount }, [], "en"), /Count/);
  assert.match(getIntervalConfigurationIssue({ ...config, stopMode: "duration", durationText: "bad" }, [], "en"), /Duration/);
  assert.equal(getIntervalConfigurationIssue(config, [], "en"), null);
});

test("message selection stays independent per pane, survives filtering, and prunes removed records", () => {
  const make = () => {
    const harness = createHarness();
    const { useConsumeMessageSelection } = load(consume + "useConsumeMessageSelection.ts", { react: harness.react, "./MessageGrid": { getMessageRowKey: m => `${m.topic}:${m.partition}:${m.offset}` } });
    return { render: messages => harness.render(useConsumeMessageSelection, { messages }) };
  };
  const left = make(), right = make();
  const messages = [message(1), message(2), message(3)];
  left.render(messages).toggleMessageChecked(messages[0]);
  left.render(messages).toggleVisibleChecked([messages[1]], true);
  left.render(messages).toggleVisibleChecked([messages[1]], false);
  assert.deepEqual(left.render(messages).checkedMessages, [messages[0]]);
  assert.deepEqual(right.render(messages).checkedMessages, []);
  assert.deepEqual(left.render(messages.slice(1)).checkedMessages, []);
  assert.equal(left.render(messages).checkedMessageKeys.size, 0);
});

test("live map batches records, deduplicates repeats, focuses selection, and cancels pending sends on unmount", t => {
  const previous = global.window;
  const timers = new Map(), sent = [];
  let id = 0;
  global.window = { setTimeout: (fn, delay) => { assert.equal(delay, 250); timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key), kafkaApi: { sendLiveMapPoints: points => sent.push(points) } };
  t.after(() => { global.window = previous; });
  const harness = createHarness();
  const { useConsumeMapPoints } = load(consume + "useConsumeMapPoints.ts", { react: harness.react, "../../../mapPreview": { createLiveMapPoint: m => ({ id: m.offset }) } });
  const render = (m, selectedMessage = null) => harness.render(useConsumeMapPoints, { mode: "live", messages: [m], selectedMessage, mapFieldMapping: null }, null);
  render(message(1));
  render(message(1));
  render(message(2));
  assert.equal(timers.size, 1);
  const flush = [...timers.values()][0];
  timers.clear(); flush();
  assert.deepEqual(sent, [[{ id: "1" }, { id: "2" }]]);
  render(message(2), message(1));
  render(message(2), message(1));
  assert.deepEqual(sent[1], [{ id: "1", focus: true }]);
  assert.equal(sent.length, 2);
  render(message(3));
  harness.unmount();
  assert.equal(timers.size, 0);
});

test("produce controller requires confirmation, rejects invalid drafts, and resets confirmation on topic changes", async () => {
  const harness = createHarness(), sends = [], intervals = [];
  const { useProducePanelController } = load(produce + "useProducePanelController.ts", { react: harness.react, "../../../hooks/state/useAppLanguage": { useAppLanguage: () => "en" } });
  let props = { topic: "vehicles", keyText: "id-${seq:1..9}", headers: "{}", value: '{"seq":${seq:1..9}}', intervalConfig: config, onProduceDraft: async d => sends.push(d), onStartInterval: async d => intervals.push(d) };
  const render = () => harness.render(useProducePanelController, props);
  await render().sendSingleProduce();
  assert.deepEqual(sends, [{ key: "id-1", headers: "{}", value: '{"seq":1}' }]);
  render().requestIntervalStart();
  assert.equal(render().isConfirmingInterval, true);
  assert.equal(intervals.length, 0);
  props = { ...props, topic: "other" };
  assert.equal(render().isConfirmingInterval, false);
  render().requestIntervalStart();
  await render().startIntervalProduce();
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].draft.value, props.value);
  props = { ...props, value: "${unknown}" };
  await render().sendSingleProduce();
  render().requestIntervalStart();
  assert.match(render().intervalError, /Unknown dynamic field/);
  assert.equal(render().isConfirmingInterval, false);
  assert.equal(sends.length, 1);
});

test("replay controller preserves target routing and starts no job for an invalid batch", async t => {
  const previous = global.window;
  global.window = { addEventListener() {}, removeEventListener() {} };
  t.after(() => { global.window = previous; });
  const harness = createHarness(), jobs = [];
  const { useInspectorReplay } = load(consume + "useInspectorReplay.ts", {
    react: harness.react,
    "../../../hooks/state/useAppLanguage": { useAppLanguage: () => "en" },
    "../../../replayJobs": { startReplayJob: job => jobs.push(job) }
  });
  const send = async () => {};
  let props = { serverId: "source", serverName: "Source", selectedMessage: message(1), replayTargets: [{ id: "target", name: "Target", connected: true, topics: [{ name: "output" }] }], selectedReplayMessages: [message(2), message(1)], filteredReplayMessages: [], allReplayMessages: [], onReplayMessage: send };
  const render = () => harness.render(useInspectorReplay, props);
  render().openReplayDialog();
  assert.equal(render().replaySourceKind, "selected");
  await render().submitReplay();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].targetServerId, "target");
  assert.equal(jobs[0].targetTopic, "output");
  assert.equal(jobs[0].send, send);
  assert.deepEqual(jobs[0].messageLabels, ["vehicles[0]@1", "vehicles[0]@2"]);
  assert.equal(render().isReplayOpen, false);
  props = { ...props, selectedReplayMessages: [message(1), message(2, "{broken")] };
  render().openReplayDialog();
  await render().submitReplay();
  assert.equal(jobs.length, 1);
  assert.equal(render().isReplayOpen, true);
  assert.ok(render().replayNotice);
  harness.unmount();
});

test("template updates retain identity and deletion requires a second action", t => {
  const previous = global.window;
  const timers = new Map();
  let id = 0;
  global.window = { setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) };
  t.after(() => { global.window = previous; });
  const harness = createHarness(), applied = [];
  const { useProduceTemplates } = load(produce + "useProduceTemplates.ts", { react: harness.react, "../../../hooks/state/useAppLanguage": { useAppLanguage: () => "en" } });
  const draft = { key: "key", headers: "{}", value: "new" };
  let templates = [{ id: "existing", name: "Daily", draft: { ...draft, value: "old" }, intervalConfig: config, updatedAt: 1 }];
  const render = () => harness.render(useProduceTemplates, {
    topic: "vehicles", templates, intervalConfig: config,
    onTemplates: next => { templates = next; },
    onKey: v => applied.push(v), onHeaders: v => applied.push(v), onValue: v => applied.push(v), onIntervalConfig: v => applied.push(v)
  }, draft);
  render().applyTemplate("existing");
  assert.deepEqual(applied, ["key", "{}", "old", config]);
  render().setTemplateName("Daily updated");
  render().saveCurrentTemplate();
  assert.equal(templates.length, 1);
  assert.equal(templates[0].id, "existing");
  assert.equal(templates[0].draft.value, "new");
  render().deleteSelectedTemplate();
  assert.equal(templates.length, 1);
  assert.equal(render().pendingDeleteTemplateId, "existing");
  render().deleteSelectedTemplate();
  assert.equal(templates.length, 0);
  assert.equal(render().selectedTemplateId, "");
  harness.unmount();
  assert.equal(timers.size, 0);
});
