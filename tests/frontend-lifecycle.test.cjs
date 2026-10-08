const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const stateCell = initial => {
  let value = initial;
  return { get: () => value, set: next => { value = typeof next === "function" ? next(value) : next; } };
};

function intervalHarness(produce = async () => {}) {
  const previous = { React: global.React, window: global.window };
  const timers = [];
  const effects = [];
  const states = [];
  const react = {
    useRef: current => ({ current }),
    useState: initial => { const cell = stateCell(initial); states.push(cell); return [initial, cell.set]; },
    useEffect: effect => effects.push(effect)
  };
  global.React = { createElement: (type, props, ...children) => ({ type, props, children }) };
  global.window = { setTimeout: callback => timers.push(callback) };
  const { WorkspacePaneContent } = loadTypeScript("src/renderer/components/workspace/WorkspacePaneContent.tsx", {
    react,
    "./consume/ConsumePanel": { ConsumePanel: "ConsumePanel" },
    "./groups/ConsumerGroupsPanel": { ConsumerGroupsPanel: "ConsumerGroupsPanel" },
    "./produce/ProducePanel": { ProducePanel: "ProducePanel" },
    "./topics": {}
  });
  const activities = [];
  const tree = WorkspacePaneContent({
    serverId: "s", topic: "t", view: "produce", openedTopicTabs: ["t"], manualAvroSchemas: {},
    onProduceDraft: produce, onProduceIntervalActivity: (topic, running) => activities.push(running)
  });
  const panel = tree.children.find(child => child?.type === "ProducePanel").props;
  const cleanups = effects.map(effect => effect());
  return {
    panel, timers, activities,
    getState: () => states[1].get()["s\u0000t"],
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
    restore: () => Object.assign(global, previous)
  };
}
const intervalRequest = value => ({ draft: { key: "", headers: "", value }, stopMode: "count", intervalMs: 100, count: 2 });

test("Interval Produce stop/restart cannot revive an older timer or overwrite the new run", async () => {
  const sent = [];
  const h = intervalHarness(async draft => sent.push(draft.value));
  try {
    const oldRun = h.panel.onStartInterval(intervalRequest("old"));
    await flush();
    h.panel.onStopInterval();
    const newRun = h.panel.onStartInterval(intervalRequest("new"));
    await flush();
    assert.deepEqual(sent, ["old", "new"]);
    h.timers.shift()();
    await oldRun;
    assert.deepEqual(sent, ["old", "new"]);
    assert.equal(h.getState().isRunning, true);
    assert.equal(h.getState().sentCount, 1);
    h.timers.shift()();
    await newRun;
    assert.deepEqual(sent, ["old", "new", "new"]);
    assert.equal(h.getState().sentCount, 2);
    assert.deepEqual(h.activities, [true, false, true, false]);
  } finally { h.unmount(); h.restore(); }
});

test("a stopped in-flight Produce failure does not stop the replacement run", async () => {
  const oldSend = deferred();
  const sent = [];
  const h = intervalHarness(draft => { sent.push(draft.value); return draft.value === "old" ? oldSend.promise : Promise.resolve(); });
  try {
    const oldRun = h.panel.onStartInterval(intervalRequest("old"));
    h.panel.onStopInterval();
    const newRun = h.panel.onStartInterval(intervalRequest("new"));
    await flush();
    oldSend.reject(new Error("old delivery failed"));
    await oldRun;
    assert.equal(h.getState().error, "");
    assert.equal(h.getState().isRunning, true);
    h.timers.shift()();
    await newRun;
    assert.deepEqual(sent, ["old", "new", "new"]);
  } finally { h.unmount(); h.restore(); }
});

test("unmount cancels an Interval Produce before its next send", async () => {
  const sent = [];
  const h = intervalHarness(async draft => sent.push(draft.value));
  try {
    const run = h.panel.onStartInterval(intervalRequest("old"));
    await flush();
    h.unmount();
    h.timers.shift()();
    await run;
    assert.deepEqual(sent, ["old"]);
  } finally { h.restore(); }
});

function liveHarness({ delayedStart = false, delayedStop = false } = {}) {
  const effects = [];
  const react = { useRef: current => ({ current }), useEffect: effect => effects.push(effect) };
  const streaming = stateCell({});
  const activeTasks = stateCell([]);
  const starts = [], stops = [], updates = [];
  const backend = new Set();
  const { useLiveConsumeRouting } = loadTypeScript("src/renderer/hooks/workspace/useLiveConsumeRouting.ts", { react });
  const routing = useLiveConsumeRouting({ setStreamingTopicsByServer: streaming.set, setActiveConsumeTaskKeys: activeTasks.set });
  const { useWorkspaceTasks } = loadTypeScript("src/renderer/hooks/workspace/useWorkspaceTasks.ts", { react });
  const tasks = useWorkspaceTasks({ setLoading() {}, setStatus() {}, setToast() {}, setPaneToast() {}, setActiveConsumeTaskKeys: activeTasks.set });
  const kafkaApi = {
    startConsume: request => {
      const completion = deferred();
      starts.push({ request, completion });
      const result = completion.promise.then(() => { backend.add(request.consumerId); return { liveRecordPath: request.consumerId + ".jsonl" }; });
      if (!delayedStart) completion.resolve();
      return result;
    },
    stopConsume: request => {
      const completion = deferred();
      stops.push({ request, completion });
      backend.delete(request.consumerId);
      if (!delayedStop) completion.resolve();
      return completion.promise;
    }
  };
  const { useConsumeActions } = loadTypeScript("src/renderer/hooks/actions/useConsumeActions.ts", { react });
  const actions = useConsumeActions({
    kafkaApi, selectedServerId: "s", selectedTopic: "t", consumeStates: {}, selectedDefaultConsumeState: {},
    runWorkspaceTask: tasks.runWorkspaceTask, updateConsumeStateFor: (...args) => updates.push(args),
    setActiveConsumeTaskKeys: activeTasks.set, setStreamingTopicsByServer: streaming.set,
    ...routing, setStatus() {}
  });
  const cleanups = effects.map(effect => effect());
  const state = { mode: "live", partition: "", liveRecordEnabled: true };
  return { routing, actions, starts, stops, backend, streaming, activeTasks, updates, state, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}

test("moving Live primary to split then restarting primary preserves two independent consumers", async () => {
  const h = liveHarness();
  await h.actions.startConsumeFor("s", "t", h.state, "primary");
  const firstId = h.starts[0].request.consumerId;
  h.routing.retargetLiveTopic("s", "t", "primary", "split");
  await h.actions.startConsumeFor("s", "t", h.state, "primary");
  const secondId = h.starts[1].request.consumerId;
  assert.notEqual(firstId, secondId);
  assert.equal(h.backend.size, 2);
  assert.equal(h.routing.getMessageTarget("s", "t", firstId), "split");
  assert.equal(h.routing.getMessageTarget("s", "t", secondId), "primary");
  await h.actions.stopConsume("s", "t", "split");
  assert.deepEqual([...h.backend], [secondId]);
  assert.deepEqual(h.streaming.get().s, ["primary:t"]);
  assert.equal(h.routing.getMessageTarget("s", "t", firstId), undefined);
  h.unmount();
});

test("closing a tab during Live start cancels it even with a stale streaming snapshot", async () => {
  const h = liveHarness({ delayedStart: true });
  const start = h.actions.startConsumeFor("s", "t", h.state, "primary");
  const tabs = stateCell(["t"]);
  const { usePrimaryTopicTabActions } = loadTypeScript("src/renderer/hooks/workspace/usePrimaryTopicTabActions.ts");
  const close = usePrimaryTopicTabActions({
    selectedServerId: "s", selectedTopic: "t", openedTopicTabs: ["t"], previewTopic: "", splitPane: null,
    isTopicStreaming: () => false, stopConsume: h.actions.stopConsume, clearConsumeStateForPane() {},
    setOpenedTopicTabs: tabs.set, setPreviewTopicByServer() {}, setSelectedTopic() {}, setTopicDetail() {}, setViewByServer() {}
  });
  await close.closeTopicTab("t");
  h.starts[0].completion.resolve();
  await start;
  assert.deepEqual(tabs.get(), []);
  assert.equal(h.backend.size, 0);
  assert.deepEqual(h.streaming.get().s, []);
  assert.equal(h.updates.length, 0);
  assert.equal(h.stops.length, 2);
  h.unmount();
});

test("a pending Live start follows pane movement and old completion cannot clear a restarted task", async () => {
  const h = liveHarness({ delayedStart: true });
  const oldRun = h.actions.startConsumeFor("s", "t", h.state, "primary");
  h.routing.retargetLiveTopic("s", "t", "primary", "split");
  const newRun = h.actions.startConsumeFor("s", "t", h.state, "primary");
  assert.deepEqual(h.activeTasks.get().sort(), ["primary:s:t", "split:s:t"]);
  h.starts[0].completion.resolve();
  await oldRun;
  assert.equal(h.updates[0][3], "split");
  assert.equal(h.activeTasks.get().length, 1);
  h.starts[1].completion.resolve();
  await newRun;
  assert.equal(h.backend.size, 2);
  assert.equal(h.updates[1][3], "primary");
  assert.deepEqual(h.activeTasks.get(), []);
  h.unmount();
});

test("moving and canceling a pending Live session releases both panes immediately", async () => {
  const h = liveHarness({ delayedStart: true });
  const start = h.actions.startConsumeFor("s", "t", h.state, "primary");
  h.routing.retargetLiveTopic("s", "t", "primary", "split");
  assert.deepEqual(h.activeTasks.get(), ["split:s:t"]);
  await h.actions.stopConsume("s", "t", "split");
  assert.deepEqual(h.activeTasks.get(), []);
  h.starts[0].completion.resolve();
  await start;
  assert.deepEqual(h.activeTasks.get(), []);
  h.unmount();
});

test("an old Stop completion cannot clear a replacement pending Live start", async () => {
  const h = liveHarness({ delayedStart: true, delayedStop: true });
  const oldStart = h.actions.startConsumeFor("s", "t", h.state, "primary");
  h.starts[0].completion.resolve();
  await oldStart;
  const stopping = h.actions.stopConsume("s", "t", "primary");
  const replacement = h.actions.startConsumeFor("s", "t", h.state, "primary");
  h.stops[0].completion.resolve();
  await stopping;
  assert.deepEqual(h.activeTasks.get(), ["primary:s:t"]);
  h.starts[1].completion.resolve();
  await replacement;
  assert.deepEqual(h.activeTasks.get(), []);
  h.unmount();
});

test("Live toolbar labels match the registered session during start and stop", () => {
  const { ConsumeToolbar } = loadTypeScript("src/renderer/components/workspace/consume/ConsumeToolbar.tsx", {
    "../../../hooks/state/useAppLanguage": { useAppLanguage: () => "en" },
    "../../../i18n": { t: (_language, key) => key },
    "../../ui": { Button: "ActionButton" }
  });
  const findButton = (node) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === "ActionButton") return node;
    return [node.props?.children].flat(Infinity).map(findButton).find(Boolean);
  };
  for (const [isConsuming, isQuerying, label] of [[true, true, "label.consuming"], [true, false, "label.pause"], [false, true, "label.stopping"], [false, false, "Consume"]]) {
    const tree = ConsumeToolbar({ mode: "live", isConsuming, isQuerying, filteredMessages: [] });
    const button = findButton(tree);
    assert.equal(button.props.children[1], label);
    assert.equal(button.props.disabled, isQuerying);
  }
});

test("a late Stop response preserves a replacement Live session", async () => {
  const h = liveHarness({ delayedStop: true });
  await h.actions.startConsumeFor("s", "t", h.state, "primary");
  const stopping = h.actions.stopConsume("s", "t", "primary");
  await h.actions.startConsumeFor("s", "t", h.state, "primary");
  h.stops[0].completion.resolve();
  await stopping;
  const replacementId = h.starts[1].request.consumerId;
  assert.equal(h.routing.getStopConsumerId("s", "t", "primary"), replacementId);
  assert.deepEqual(h.streaming.get().s, ["primary:t"]);
  assert.deepEqual([...h.backend], [replacementId]);
  h.unmount();
});

test("unmount during Live connection prevents a late recorder from becoming an orphan", async () => {
  const h = liveHarness({ delayedStart: true });
  const start = h.actions.startConsumeFor("s", "t", h.state, "primary");
  h.unmount();
  h.starts[0].completion.resolve();
  await start;
  assert.equal(h.backend.size, 0);
  assert.equal(h.updates.length, 0);
});

test("Live events route UUIDs to their pane and ignore a stopped session", () => {
  const effects = [];
  const react = { useRef: current => ({ current }), useEffect: effect => effects.push(effect) };
  const { useLiveConsumeRouting } = loadTypeScript("src/renderer/hooks/workspace/useLiveConsumeRouting.ts", { react });
  const routing = useLiveConsumeRouting({ setStreamingTopicsByServer() {}, setActiveConsumeTaskKeys() {} });
  routing.setStartedConsumer("s", "t", "primary", "session-1");
  routing.retargetLiveTopic("s", "t", "primary", "split");
  let messageHandler;
  const primary = stateCell({}), split = stateCell({});
  const { useKafkaConsumeEvents } = loadTypeScript("src/renderer/hooks/workspace/useKafkaConsumeEvents.ts", { react });
  useKafkaConsumeEvents({
    kafkaApi: { onConsumeMessage: fn => { messageHandler = fn; return () => {}; }, onConsumeError: () => () => {} },
    selectedServerId: "s", consumeDefaultsByServer: {}, getDefaultConsumeState: () => ({ messages: [], maxMessages: 10, liveRecordCount: 0 }),
    getMessageTarget: routing.getMessageTarget,
    mergeConsumeState: (current, serverId, topic, patch) => ({ ...current, [serverId]: { [topic]: patch } }),
    setConsumeStatesByServer: primary.set, setSplitConsumeStatesByServer: split.set, setStatus() {}
  });
  effects[0]();
  const message = { serverId: "s", topic: "t", consumerId: "session-1", offset: "1" };
  messageHandler(message);
  assert.equal(split.get().s.t.messages.length, 1);
  routing.clearStoppedConsumer("s", "t", "split");
  messageHandler({ ...message, offset: "2" });
  assert.equal(split.get().s.t.messages.length, 1);
  assert.deepEqual(primary.get(), {});
});

test("out-of-order primary topic details remain cached without replacing the selected Info view", async () => {
  const detail = stateCell({}), cache = stateCell({}), selection = stateCell({});
  const { useTopicDetailCache } = loadTypeScript("src/renderer/hooks/workspace/useTopicDetailCache.ts");
  const cacheActions = useTopicDetailCache({ topicDetailCacheByServer: {}, setTopicDetailByServer: detail.set, setTopicDetailCacheByServer: cache.set });
  const responses = { A: deferred(), B: deferred() };
  const { useTopicResourceActions } = loadTypeScript("src/renderer/hooks/actions/useTopicResourceActions.ts");
  const actions = useTopicResourceActions({
    kafkaApi: { getTopicDetail: (_server, topic) => responses[topic].promise }, selectedServerId: "s",
    ...cacheActions, setSelectedTopicByServer: selection.set
  });
  const a = actions.loadTopicDetailSilent("A");
  const b = actions.loadTopicDetailSilent("B");
  responses.B.resolve({ name: "B", partitions: [2] });
  await b;
  responses.A.resolve({ name: "A", partitions: [1] });
  await a;
  const { useWorkspaceDerivedState } = loadTypeScript("src/renderer/hooks/app/state/useWorkspaceDerivedState.ts", { "../../state": { emptyProduceDraft: {} } });
  const selected = useWorkspaceDerivedState({
    selectedServerId: "s", selectedTopicByServer: selection.get(), topicDetailByServer: detail.get(), topicDetailCacheByServer: cache.get(),
    previewTopicByServer: {}, viewByServer: {}, openedTopicTabsByServer: {}, consumeStatesByServer: {}, splitPane: null,
    getDefaultConsumeState: () => ({}), getProduceDraft: () => ({})
  });
  assert.equal(selected.selectedTopic, "B");
  assert.equal(selected.topicDetail.name, "B");
  assert.deepEqual(Object.keys(cache.get().s).sort(), ["A", "B"]);
});

test("out-of-order split preview detail cannot navigate back to an older topic", async () => {
  const split = stateCell({ serverId: "s", topic: "initial", topicTabs: [], previewTopic: "" });
  const cache = stateCell({});
  const responses = { A: deferred(), B: deferred() };
  const { useSplitTopicDetailActions } = loadTypeScript("src/renderer/hooks/workspace/useSplitTopicDetailActions.ts");
  const actions = useSplitTopicDetailActions({
    kafkaApi: { getTopicDetail: (_server, topic) => responses[topic].promise }, getCachedTopicDetail: () => null,
    setSplitPane: split.set, setTopicDetailCacheByServer: cache.set
  });
  const a = actions.previewSplitTopicDetailSilent("s", "A");
  const b = actions.previewSplitTopicDetailSilent("s", "B");
  responses.B.resolve({ name: "B" }); await b;
  responses.A.resolve({ name: "A" }); await a;
  assert.equal(split.get().topic, "B");
  assert.equal(split.get().detail.name, "B");
  assert.deepEqual(split.get().topicTabs, ["B"]);
});

function mainLiveHarness({ profileGate, connectGate, decodeGate } = {}) {
  const handlers = {};
  const calls = { created: 0, subscribed: 0, run: 0, stopped: 0, disconnected: 0, recorded: 0, sent: 0, closed: 0 };
  let eachMessage;
  const errors = [];
  const recorder = { path: "mock-recording.jsonl" };
  let recording = false;
  const consumer = {
    connect: () => connectGate?.promise ?? Promise.resolve(),
    subscribe: async () => { calls.subscribed++; },
    run: async options => { calls.run++; eachMessage = options.eachMessage; },
    stop: async () => { calls.stopped++; },
    disconnect: async () => { calls.disconnected++; }, seek() {}
  };
  const admin = { connect: async () => {}, disconnect: async () => {}, fetchTopicOffsets: async () => [{ partition: 0, offset: "0" }] };
  const { createConsumeProduceService } = loadTypeScript("src/main/ipc/consumeProduce.ts", {
    electron: {}, "./consumeQueries.js": {}, "./produceMessages.js": {},
    "./ipcErrorBoundary.js": { handleLogged: (name, handler) => { handlers[name] = handler; } },
    "./liveRecorder.js": { createLiveRecorderRegistry: () => ({
      start: async () => { recording = true; return recorder; },
      close: () => { if (recording) calls.closed++; recording = false; }, closeAll() {}, write: async () => { calls.recorded++; }
    }) },
    "../storage.js": { getProfile: () => profileGate?.promise ?? Promise.resolve({}), readPreferences: async () => ({}) },
    "../kafkaClient.js": { createKafka: () => ({ consumer: () => { calls.created++; return consumer; }, admin: () => admin }) },
    "../messageMapper.js": { toConsumedMessage: () => decodeGate?.promise ?? Promise.resolve({}) }
  });
  const service = createConsumeProduceService({
    getWindow: () => ({ webContents: { send: (name, payload) => { if (name === "kafka:consume-error") errors.push(payload); else calls.sent++; } } }),
    getLiveRecordTitle: () => "Record"
  });
  service.registerIpcHandlers();
  const request = { serverId: "s", topic: "t", consumerId: "live-session", record: true };
  return { service, calls, errors, request, start: () => handlers["kafka:consume-start"]({}, request), deliver: () => eachMessage({ topic: "t", partition: 0, message: { offset: "1" } }) };
}

test("Main cancels a pending Live start before profile lookup completes", async () => {
  const profileGate = deferred();
  const h = mainLiveHarness({ profileGate });
  const start = h.start();
  await flush();
  assert.equal(h.service.hasActiveConsumers(), true);
  await h.service.stopActiveConsumer(h.request);
  profileGate.resolve({});
  assert.deepEqual(await start, {});
  assert.equal(h.calls.created, 0);
  assert.equal(h.calls.closed, 1);
  assert.equal(h.service.hasActiveConsumers(), false);
  assert.deepEqual(h.errors, []);
});

test("Main cancels a delayed connection without subscribing, running or recording", async () => {
  const connectGate = deferred();
  const h = mainLiveHarness({ connectGate });
  const start = h.start();
  await flush();
  await h.service.stopActiveConsumer(h.request);
  connectGate.resolve();
  assert.deepEqual(await start, {});
  assert.equal(h.calls.subscribed, 0);
  assert.equal(h.calls.run, 0);
  assert.equal(h.calls.recorded, 0);
  assert(h.calls.disconnected >= 1);
  assert.deepEqual(h.errors, []);
});

test("Main discards a decoded Live record after its consumer has been stopped", async () => {
  const decodeGate = deferred();
  const h = mainLiveHarness({ decodeGate });
  await h.start();
  const delivery = h.deliver();
  await h.service.stopActiveConsumer(h.request);
  decodeGate.resolve({ value: "late" });
  await delivery;
  assert.equal(h.calls.recorded, 0);
  assert.equal(h.calls.sent, 0);
});

test("canceling Live recording during its save dialog never opens a file", async () => {
  const dialogResult = deferred();
  let directories = 0, streams = 0;
  const { createLiveRecorderRegistry } = loadTypeScript("src/main/ipc/liveRecorder.ts", {
    electron: { app: { getPath: () => "C:/mock" }, dialog: { showSaveDialog: () => dialogResult.promise } },
    "node:fs": { createWriteStream: () => { streams++; throw new Error("should not open"); } },
    "node:fs/promises": { mkdir: async () => { directories++; } },
    "../kafkaUtils.js": { sanitizeFileName: value => value }
  });
  const registry = createLiveRecorderRegistry({ getWindow: () => ({}), getLiveRecordTitle: () => "Record", onError() {} });
  const controller = new AbortController();
  const start = registry.start("key", { topic: "t", record: true }, controller.signal);
  controller.abort();
  dialogResult.resolve({ filePath: "C:/mock/t.jsonl" });
  assert.equal(await start, undefined);
  assert.equal(directories, 0);
  assert.equal(streams, 0);
});
