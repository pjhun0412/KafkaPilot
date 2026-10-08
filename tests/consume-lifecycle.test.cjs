const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

function runnerFixture(kind, { decode, failAt, startup } = {}) {
  const error = new Error(`${failAt || "decode"} failed`);
  const calls = { stop: 0, disconnect: 0, seek: 0 };
  const handlers = new Set();
  const pending = new Set();
  let eachMessage;
  const consumer = {
    events: { CRASH: "crash" },
    on: (_event, handler) => { handlers.add(handler); return () => handlers.delete(handler); },
    connect: async () => { if (failAt === "connect") throw error; },
    subscribe: async () => { if (failAt === "subscribe") throw error; },
    run: async params => { eachMessage = params.eachMessage; if (failAt === "run") throw error; if (startup) await startup; },
    seek: () => { calls.seek += 1; if (failAt === "seek") throw error; },
    // KafkaJS stop waits for eachMessage, so the fixture catches self-deadlocks.
    stop: async () => { calls.stop += 1; await Promise.all([...pending]); },
    disconnect: async () => { calls.disconnect += 1; }
  };
  const makeMessage = (offset, partition = 0) => ({
    topic: "topic", partition, message: { offset: String(offset), timestamp: "1000", value: Buffer.from("value") }
  });
  const module = loadTypeScript(`src/main/ipc/${kind === "offset" ? "offset" : "timeRange"}ConsumerRunner.ts`, {
    "../messageMapper.js": {
      toConsumedMessage: async (_profile, topic, partition, message) => {
        if (decode) await decode(message, error);
        return { topic, partition, offset: message.offset, timestamp: new Date(Number(message.timestamp)).toISOString(), value: "value" };
      }
    }
  });
  const start = (limit = 2) => (kind === "offset" ? module.runOffsetConsumer : module.runTimeRangeConsumer)({
    consumer, profile: {}, request: { topic: "topic", partition: 0, startTimestamp: 0, endTimestamp: 2000 },
    limit, offsetWindow: { seekOffset: "0", endExclusive: BigInt(limit), expectedMessageCount: limit },
    seekablePartitions: [0], startOffsets: new Map([[0, "0"]])
  });
  return {
    calls, error, start,
    get listenerCount() { return handlers.size; },
    crash: () => { for (const handler of handlers) handler({ payload: { error } }); },
    deliver(offset, partition = 0) {
      const operation = eachMessage(makeMessage(offset, partition));
      pending.add(operation);
      void operation.finally(() => pending.delete(operation));
      return operation;
    }
  };
}

for (const kind of ["offset", "time"]) {
  for (const failAt of ["connect", "subscribe", "run"]) {
    test(`${kind}: ${failAt} failure disconnects and cancels delayed seek`, async t => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const fixture = runnerFixture(kind, { failAt });
      await assert.rejects(fixture.start(), error => error === fixture.error);
      t.mock.timers.tick(20000);
      assert.deepEqual(fixture.calls, { stop: 1, disconnect: 1, seek: 0 });
      assert.equal(fixture.listenerCount, 0);
    });
  }

  test(`${kind}: a received record survives decoding past the idle timeout`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const decoding = deferred();
    const fixture = runnerFixture(kind, { decode: message => message.offset === "1" ? decoding.promise : undefined });
    let finished = false;
    const result = fixture.start().then(value => { finished = true; return value; });
    await flush();
    t.mock.timers.tick(0);
    await fixture.deliver(0);
    const active = fixture.deliver(1);
    t.mock.timers.tick(2000);
    await flush();
    assert.equal(finished, false);
    assert.equal(fixture.calls.stop, 0);
    decoding.resolve();
    await active;
    const records = await result;
    assert.deepEqual((records.messages || records).map(message => message.offset), ["0", "1"]);
    assert.deepEqual(fixture.calls, { stop: 1, disconnect: 1, seek: 1 });
    assert.equal(fixture.listenerCount, 0);
  });

  test(`${kind}: deadline drains an accepted decode and ignores later messages`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const decoding = deferred();
    const fixture = runnerFixture(kind, { decode: message => message.offset === "1" ? decoding.promise : undefined });
    const result = fixture.start(20);
    await flush();
    t.mock.timers.tick(0);
    await fixture.deliver(0);
    const active = fixture.deliver(1);
    t.mock.timers.tick(20000);
    await fixture.deliver(2);
    assert.equal(fixture.calls.stop, 0);
    decoding.resolve();
    await active;
    const records = await result;
    assert.deepEqual((records.messages || records).map(message => message.offset), ["0", "1"]);
    assert.equal(fixture.calls.disconnect, 1);
  });

  for (const failure of ["decode", "seek", "crash"]) {
    test(`${kind}: ${failure} failure is propagated after cleanup`, async t => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const fixture = runnerFixture(kind, {
        failAt: failure === "seek" ? "seek" : undefined,
        decode: failure === "decode" ? (_message, error) => { throw error; } : undefined
      });
      const result = fixture.start();
      const rejected = assert.rejects(result, error => error === fixture.error);
      await flush();
      t.mock.timers.tick(0);
      if (failure === "decode") await fixture.deliver(0);
      if (failure === "crash") fixture.crash();
      await rejected;
      assert.equal(fixture.calls.stop, 1);
      assert.equal(fixture.calls.disconnect, 1);
      assert.equal(fixture.listenerCount, 0);
    });
  }

  test(`${kind}: empty idle completion releases the consumer and listener`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const fixture = runnerFixture(kind);
    const result = fixture.start();
    await flush();
    t.mock.timers.tick(0);
    t.mock.timers.tick(4000);
    const records = await result;
    assert.deepEqual(records.messages || records, []);
    assert.equal(fixture.calls.disconnect, 1);
    assert.equal(fixture.listenerCount, 0);
  });

  test(`${kind}: a slow group join does not consume the message idle timeout`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const startup = deferred();
    const fixture = runnerFixture(kind, { startup: startup.promise });
    const result = fixture.start(1);
    await flush();
    t.mock.timers.tick(5000);
    startup.resolve();
    await flush();
    await fixture.deliver(0);
    const records = await result;
    assert.deepEqual((records.messages || records).map(message => message.offset), ["0"]);
    assert.equal(fixture.calls.disconnect, 1);
  });

  test(`${kind}: delayed startup completes before shutdown after a timeout`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const startup = deferred();
    const fixture = runnerFixture(kind, { startup: startup.promise });
    const result = fixture.start();
    await flush();
    t.mock.timers.tick(0);
    t.mock.timers.tick(20000);
    await flush();
    assert.equal(fixture.calls.disconnect, 0);
    startup.resolve();
    await result;
    assert.equal(fixture.calls.disconnect, 1);
    assert.equal(fixture.listenerCount, 0);
  });
}

for (const kind of ["offset", "time"]) {
  test(`${kind}: overlapping requests own distinct groups and clean up only their own group`, async () => {
    const groups = [];
    const deleted = [];
    const running = [];
    const hold = deferred();
    const admin = {
      connect: async () => {}, disconnect: async () => {},
      fetchTopicOffsets: async () => [{ partition: 0, low: "0", high: "10" }]
    };
    const module = loadTypeScript(`src/main/ipc/${kind === "offset" ? "consumeOffset" : "consumeTimeRange"}.ts`, {
      "../kafkaClient.js": { createKafka: () => ({
        admin: () => admin,
        consumer: ({ groupId }) => { groups.push(groupId); return { groupId }; }
      }) },
      "../storage.js": { getProfile: async () => ({}), readPreferences: async () => ({}) },
      "./consumerGroupCleanup.js": { deleteKafkaToolConsumerGroup: async (_server, groupId) => deleted.push(groupId) },
      "./offsetConsumerRunner.js": { runOffsetConsumer: async ({ consumer }) => { running.push(consumer.groupId); await hold.promise; return { messages: [] }; } },
      "./timeRangeConsumerRunner.js": { runTimeRangeConsumer: async ({ consumer }) => { running.push(consumer.groupId); await hold.promise; return []; } },
      "./timeRangeOffsets.js": { resolveTimeRangeSeekTargets: async () => ({ seekablePartitions: [0], startOffsets: new Map([[0, "0"]]) }) }
    });
    const consume = module.consumeOffsetBatch || module.consumeTimeRange;
    const request = { serverId: "server", topic: "topic", partition: 0, offset: "0", limit: 2 };
    const operations = [consume(request), consume(request), consume(request)];
    await flush();
    assert.equal(new Set(groups).size, 3);
    assert.deepEqual(running, groups);
    assert.deepEqual(deleted, []);
    hold.resolve();
    await Promise.all(operations);
    assert.deepEqual(deleted, groups);
  });
}

test("live consumer group identity remains stable", () => {
  const { kafkaToolConsumerGroupId } = loadTypeScript("src/main/ipc/consumeUtils.ts");
  assert.equal(kafkaToolConsumerGroupId("live", ["server", "topic", "pane"]), kafkaToolConsumerGroupId("live", ["server", "topic", "pane"]));
});

for (const low of [0, 19]) {
  test(`descending export stops at low offset ${low} without wrapping to latest`, async () => {
    const chunks = [];
    const requests = [];
    const { resolveOffsetWindow } = loadTypeScript("src/main/ipc/offsetWindow.ts");
    const { nextOffset } = loadTypeScript("src/main/ipc/consumeUtils.ts");
    const { writeOffsetMessageExport } = loadTypeScript("src/main/ipc/offsetMessageExport.ts", {
      "node:fs": { createWriteStream: () => ({
        write: (chunk, done) => { chunks.push(chunk); done(); }, end: done => done()
      }) }
    });
    await writeOffsetMessageExport({
      filePath: "unused.json", nextOffset,
      request: { serverId: "server", topic: "topic", partition: 0, offset: "0", order: "desc", limit: 10000, format: "json" },
      consumeOffsetBatch: async request => {
        requests.push(request);
        const window = resolveOffsetWindow(request, request.limit, { low: String(low), high: String(low + 5000) });
        return {
          endOffsetExclusive: window.endExclusive.toString(),
          messages: Array.from({ length: window.expectedMessageCount }, (_, index) => ({
            topic: "topic", partition: 0, offset: String(Number(window.seekOffset) + index), timestamp: new Date(1000).toISOString(), key: "", headers: {}, value: "value"
          }))
        };
      }
    });
    const exported = JSON.parse(chunks.join(""));
    assert.equal(exported.count, 5000);
    assert.equal(new Set(exported.messages.map(message => message.offset)).size, 5000);
    assert.equal(exported.messages[0].offset, String(low + 4999));
    assert.equal(exported.messages.at(-1).offset, String(low));
    assert.equal(requests.length, 2);
    assert.equal(requests[1].endOffsetExclusive, String(low));
  });
}
