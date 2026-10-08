const assert = require("node:assert/strict");
const test = require("node:test");
const { Kafka, ConfigResourceTypes, logLevel } = require("kafkajs");
const Encoder = require("kafkajs/src/protocol/encoder");
const Decoder = require("kafkajs/src/protocol/decoder");
const createRequest = require("kafkajs/src/protocol/request");
const loadTypeScript = require("./load-typescript.cjs");

const { alterConfigsIncrementally } = loadTypeScript("src/main/incrementalConfigs.ts");
const topicResource = (entries = [{ name: "retention.ms", value: "60000" }]) => ({
  type: ConfigResourceTypes.TOPIC, name: "topic", configEntries: entries
});

function responseBuffer(resources, throttle = 0) {
  return new Encoder().writeInt32(throttle).writeArray(resources.map((resource) =>
    new Encoder().writeInt16(resource.errorCode ?? 0).writeString(resource.errorMessage ?? null)
      .writeInt8(resource.type).writeString(resource.name)
  )).buffer;
}

function decodeRequest(buffer) {
  const decoder = new Decoder(buffer);
  const resources = decoder.readArray((entry) => ({
    type: entry.readInt8(),
    name: entry.readString(),
    configs: entry.readArray((config) => ({
      name: config.readString(), operation: config.readInt8(), value: config.readString()
    }))
  }));
  const validateOnly = decoder.readBoolean();
  assert.equal(decoder.offset, buffer.length);
  return { resources, validateOnly };
}

function fixture(options = {}) {
  const writes = [];
  const calls = [];
  let configState = { "cleanup.policy": "compact", "retention.ms": "100", "ssl.keystore.password": "hidden-existing-value" };
  const broker = {
    apiVersions: async () => { calls.push("apiVersions"); return options.versions ?? { 44: { minVersion: 0, maxVersion: 1 } }; },
    connectionPool: {
      send: async (protocol) => {
        assert.equal(protocol.request.apiKey, 44);
        assert.equal(protocol.request.apiVersion, 0);
        assert.equal(protocol.logResponseError, false);
        const encoded = await protocol.request.encode();
        const request = decodeRequest(encoded.buffer);
        writes.push({ protocol, encoded, request });
        if (options.sendError) throw options.sendError;
        if (options.beforeWrite) options.beforeWrite(configState);
        for (const resource of request.resources) {
          for (const config of resource.configs) {
            assert.equal(config.operation, 0);
            if (!request.validateOnly && !options.errorCode) configState[config.name] = config.value;
          }
        }
        const raw = options.rawResponse ?? responseBuffer(request.resources.map((resource) => ({
          ...resource, errorCode: options.errorCode, errorMessage: options.errorMessage
        })), 50);
        const decoded = await protocol.response.decode(raw);
        assert.equal(decoded.clientSideThrottleTime, 50);
        await protocol.response.parse(decoded);
      }
    }
  };
  const cluster = {
    connect: async () => { calls.push("connect"); if (options.connectError) throw options.connectError; },
    disconnect: async () => { calls.push("disconnect"); },
    refreshMetadata: async () => { calls.push("metadata"); },
    findControllerBroker: async () => { calls.push("controller"); return broker; },
    findBroker: async ({ nodeId }) => { calls.push(["broker", nodeId]); return broker; }
  };
  const kafka = {
    [Symbol("private:Kafka:createCluster")]: (settings) => {
      calls.push("factory");
      assert.equal(settings.allowAutoTopicCreation, false);
      return cluster;
    }
  };
  return { kafka, cluster, broker, writes, calls, get state() { return configState; } };
}

test("incremental config adapter uses the actual KafkaJS 2.2.4 cluster contract without opening sockets", async () => {
  assert.equal(require("kafkajs/package.json").version, "2.2.4");
  const kafka = new Kafka({ brokers: ["127.0.0.1:1"], logLevel: logLevel.NOTHING });
  const symbol = Object.getOwnPropertySymbols(kafka).find((entry) => entry.description === "private:Kafka:createCluster");
  assert.ok(symbol);
  const cluster = kafka[symbol]({ metadataMaxAge: 0, allowAutoTopicCreation: false });
  for (const method of ["connect", "disconnect", "refreshMetadata", "findBroker", "findControllerBroker"]) {
    assert.equal(typeof cluster[method], "function");
  }
  await cluster.brokerPool.createSeedBroker();
  const seedBroker = cluster.brokerPool.seedBroker;
  assert.equal(typeof seedBroker.apiVersions, "function");
  assert.equal(typeof seedBroker.connectionPool.send, "function");
  assert.equal(seedBroker.isConnected(), false);
});

test("SET request uses API 44 v0 wire layout and works with KafkaJS request framing", async () => {
  const f = fixture();
  await alterConfigsIncrementally(f.kafka, topicResource());
  const { encoded, protocol } = f.writes[0];
  // One topic, one config, operation SET (00), and validate_only false (00).
  assert.equal(encoded.buffer.toString("hex"), "00000001020005746f70696300000001000c726574656e74696f6e2e6d73000005363030303000");
  const frame = await createRequest({ request: protocol.request, correlationId: 7, clientId: "test" });
  const decoder = new Decoder(frame.buffer);
  assert.equal(decoder.readInt32(), frame.buffer.length - 4);
  assert.equal(decoder.readInt16(), 44);
  assert.equal(decoder.readInt16(), 0);
  assert.equal(decoder.readInt32(), 7);
  assert.equal(decoder.readString(), "test");
  assert.equal(frame.buffer.subarray(decoder.offset).toString("hex"), encoded.buffer.toString("hex"));
  assert.deepEqual(f.calls, ["factory", "connect", "metadata", "controller", "apiVersions", "disconnect"]);
});

test("unrelated concurrent and sensitive overrides survive a single config update", async () => {
  const f = fixture({ beforeWrite: (state) => { state["cleanup.policy"] = "compact,delete"; } });
  await alterConfigsIncrementally(f.kafka, topicResource());
  assert.deepEqual(f.state, {
    "cleanup.policy": "compact,delete", "retention.ms": "60000", "ssl.keystore.password": "hidden-existing-value"
  });
  assert.deepEqual(f.writes[0].request.resources[0].configs, [{ name: "retention.ms", operation: 0, value: "60000" }]);
});

test("parallel changes send only their own entries", async () => {
  const f = fixture();
  await Promise.all([
    alterConfigsIncrementally(f.kafka, topicResource()),
    alterConfigsIncrementally(f.kafka, topicResource([{ name: "cleanup.policy", value: "compact,delete" }]))
  ]);
  assert.equal(f.state["cleanup.policy"], "compact,delete");
  assert.equal(f.state["retention.ms"], "60000");
  assert.equal(f.state["ssl.keystore.password"], "hidden-existing-value");
  assert.ok(f.writes.every(({ request }) => request.resources[0].configs.length === 1));
});

test("validateOnly keeps settings and broker updates target the named broker", async () => {
  const f = fixture();
  await alterConfigsIncrementally(f.kafka, {
    type: ConfigResourceTypes.BROKER, name: "7", configEntries: [{ name: "retention.ms", value: "500" }]
  }, true);
  assert.equal(f.writes[0].request.validateOnly, true);
  assert.equal(f.state["retention.ms"], "100");
  assert.deepEqual(f.calls, ["factory", "connect", "metadata", ["broker", 7], "apiVersions", "disconnect"]);
});

for (const versions of [{}, { 44: { minVersion: 1, maxVersion: 1 } }, { 44: { minVersion: 0, maxVersion: -1 } }]) {
  test(`unsupported incremental protocol fails closed: ${JSON.stringify(versions)}`, async () => {
    const f = fixture({ versions });
    await assert.rejects(alterConfigsIncrementally(f.kafka, topicResource()), /does not support safe incremental/);
    assert.equal(f.writes.length, 0);
    assert.equal(f.calls.at(-1), "disconnect");
  });
}

test("unsupported KafkaJS or missing internal contract fails before connecting", async () => {
  const f = fixture();
  const futureAdapter = loadTypeScript("src/main/incrementalConfigs.ts", { "kafkajs/package.json": { version: "2.3.0" } });
  await assert.rejects(futureAdapter.alterConfigsIncrementally(f.kafka, topicResource()), /verified KafkaJS 2.2.4/);
  assert.deepEqual(f.calls, []);
  await assert.rejects(alterConfigsIncrementally({}, topicResource()), /unavailable in this KafkaJS client/);
});

test("resource errors with null or sensitive broker messages are rejected without exposing values", async () => {
  for (const errorMessage of [null, "Invalid ssl.keystore.password: do-not-echo-this-secret"]) {
    const f = fixture({ errorCode: 40, errorMessage });
    await assert.rejects(alterConfigsIncrementally(f.kafka, topicResource()), (error) => {
      assert.equal(error.code, 40);
      assert.doesNotMatch(error.message, /do-not-echo-this-secret/);
      return true;
    });
    assert.equal(f.calls.at(-1), "disconnect");
    assert.equal(f.state["retention.ms"], "100");
  }
});

test("missing or mismatched resource responses cannot report update success", async () => {
  for (const resources of [[], [{ type: 2, name: "other-topic" }], [{ type: 4, name: "topic" }]]) {
    const f = fixture({ rawResponse: responseBuffer(resources, 50) });
    await assert.rejects(alterConfigsIncrementally(f.kafka, topicResource()), /Invalid IncrementalAlterConfigs response/);
    assert.equal(f.calls.at(-1), "disconnect");
  }
});

test("connect and send failures always disconnect without retrying a write", async () => {
  for (const failure of ["connectError", "sendError"]) {
    const error = new Error(failure);
    const f = fixture({ [failure]: error });
    await assert.rejects(alterConfigsIncrementally(f.kafka, topicResource()), (caught) => caught === error);
    assert.equal(f.calls.at(-1), "disconnect");
    assert.equal(f.writes.length, failure === "sendError" ? 1 : 0);
  }
});

test("invalid and duplicate entries fail before connecting without echoing values", async () => {
  for (const entries of [[], [{ name: "", value: "secret" }], [{ name: "x", value: null }], [{ name: "x", value: "a" }, { name: " x ", value: "secret" }]]) {
    const f = fixture();
    await assert.rejects(alterConfigsIncrementally(f.kafka, topicResource(entries)), (error) => {
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
    assert.deepEqual(f.calls, []);
  }
});

test("topic and broker handlers use incremental updates and preserve masked readback", async () => {
  const writes = [];
  let readCalls = 0;
  const admin = {
    alterConfigs: async () => assert.fail("Full replacement AlterConfigs must never be used"),
    describeConfigs: async () => {
      readCalls += 1;
      return { resources: [{ configEntries: [
        { configName: "ssl.keystore.password", configValue: "secret", isSensitive: true, configSynonyms: [{ configName: "ssl.keystore.password", configValue: "secret" }] }
      ] }] };
    }
  };
  const mocks = {
    "../kafkaClient.js": {
      updateKafkaConfigs: async (...args) => writes.push(args),
      withAdmin: async (_server, action) => action(admin)
    },
    "./brokerQueries.js": { loadBrokerSummaries: async () => [{ nodeId: 7 }] }
  };
  const { updateTopicConfigs } = loadTypeScript("src/main/ipc/topicConfigs.ts", mocks);
  const { updateBrokerConfig } = loadTypeScript("src/main/ipc/brokerConfigs.ts", mocks);
  const topic = await updateTopicConfigs({ serverId: "server", topic: "topic", entries: [{ name: " retention.ms ", value: "500" }], validateOnly: true });
  const broker = await updateBrokerConfig({ serverId: "server", brokerId: 7, name: "log.retention.ms", value: "600" });
  assert.deepEqual(writes, [
    ["server", { type: 2, name: "topic", configEntries: [{ name: "retention.ms", value: "500" }] }, true],
    ["server", { type: 4, name: "7", configEntries: [{ name: "log.retention.ms", value: "600" }] }, false]
  ]);
  assert.equal(readCalls, 2);
  assert.equal(topic[0].value, "");
  assert.equal(broker.configs[0].value, "");
  assert.equal(topic[0].synonyms[0].value, "");
});

test("failed config updates do not return a successful readback", async () => {
  let reads = 0;
  const error = new Error("update denied");
  const { updateTopicConfigs } = loadTypeScript("src/main/ipc/topicConfigs.ts", {
    "../kafkaClient.js": {
      updateKafkaConfigs: async () => { throw error; },
      withAdmin: async () => { reads += 1; }
    }
  });
  await assert.rejects(updateTopicConfigs({ serverId: "server", topic: "topic", entries: topicResource().configEntries }), (caught) => caught === error);
  assert.equal(reads, 0);
});
