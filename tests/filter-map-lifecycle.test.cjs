const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");
const { filterMessages } = loadTypeScript("src/renderer/messageFilters.ts");
const message = (value) => ({ serverId: "test", topic: "topic", key: "", value, headers: {}, offset: "0", partition: 0, timestamp: "0" });
const matches = (query, values) => filterMessages(values.map(message), query, "value").map((item) => item.value);

test("regular expression escapes survive tokenization", () => {
  assert.deepEqual(matches(String.raw`value:/^\d+$/`, ["123", "ddd"]), ["123"]);
  assert.deepEqual(matches(String.raw`/^\w+\s\d+\.\d+$/`, ["car 12.5", "carwss"]), ["car 12.5"]);
  assert.deepEqual(matches(String.raw`value:/^a\/b$/`, ["a/b", "ab"]), ["a/b"]);
  assert.deepEqual(matches(String.raw`value:/^[a/b]+$/`, ["a/b", "c"]), ["a/b"]);
  assert.deepEqual(matches(`value:/^"two words"$/`, ['"two words"', "two words"]), ['"two words"']);
  assert.deepEqual(matches(String.raw`!value:/^\d+$/`, ["123", "ddd"]), ["ddd"]);
});

test("global and sticky expressions evaluate each record independently", () => {
  assert.deepEqual(matches("/a/g", ["a", "a", "a"]), ["a", "a", "a"]);
  assert.deepEqual(matches("/a/y", ["a", "a", "a"]), ["a", "a", "a"]);
});

test("quoted text, escaped spaces and combined filters retain their existing behavior", () => {
  assert.deepEqual(matches('value:"two words" !error', ["two words", "two words error", "two"]), ["two words"]);
  assert.deepEqual(matches(String.raw`two\ words`, ["two words", "two"]), ["two words"]);
  assert.deepEqual(matches(String.raw`value:/^\d+$/ topic:topic`, ["123", "ddd"]), ["123"]);
});

test("map retention bounds unique IDs and keeps recently updated IDs", () => {
  const { MAX_LIVE_MAP_POINTS, retainRecentMapValue } = loadTypeScript("src/shared/liveMapRetention.ts");
  const items = new Map();
  for (let i = 0; i < MAX_LIVE_MAP_POINTS; i += 1) retainRecentMapValue(items, String(i), i);
  retainRecentMapValue(items, "0", "updated");
  assert.deepEqual(retainRecentMapValue(items, "next", "new"), ["1", 1]);
  assert.equal(items.get("0"), "updated");
  for (let i = MAX_LIVE_MAP_POINTS; i < 20000; i += 1) retainRecentMapValue(items, String(i), i);
  assert.equal(items.size, MAX_LIVE_MAP_POINTS);
  assert.equal(items.get("19999"), 19999);
});

test("closed Map Viewer still bounds its Main process buffer and can clear it", () => {
  const { MAX_LIVE_MAP_POINTS } = loadTypeScript("src/shared/liveMapRetention.ts");
  const api = loadTypeScript("src/main/liveMapWindow.ts", {
    electron: {}, "./logger.js": {}, "./storage.js": {}
  });
  api.sendLiveMapPoints(Array.from({ length: 20000 }, (_, offset) => ({ id: "", topic: "topic", partition: 0, offset: String(offset) })));
  assert.equal(api.getLiveMapPoints().length, MAX_LIVE_MAP_POINTS);
  assert.equal(api.getLiveMapPoints()[0].offset, "15000");
  api.clearLiveMapPoints();
  assert.equal(api.getLiveMapPoints().length, 0);
});

test("automatic zoom preserves tracking while explicit map navigation interrupts it", (t) => {
  const { onUserMapNavigation } = loadTypeScript("src/renderer/mapNavigation.ts");
  const previousElement = global.Element;
  global.Element = class Element { closest() { return true; } };
  t.after(() => { global.Element = previousElement; });
  const listeners = new Map();
  const domListeners = new Map();
  const container = {
    addEventListener: (event, callback) => domListeners.set(event, callback),
    removeEventListener: (event) => domListeners.delete(event)
  };
  let mode = "fit";
  const dispose = onUserMapNavigation({
    on: (event, callback) => listeners.set(event, callback),
    off: (event) => listeners.delete(event),
    getContainer: () => container
  }, () => { mode = "free"; });
  listeners.get("zoomstart")?.();
  assert.equal(mode, "fit");
  for (const [type, payload] of [["wheel", {}], ["dblclick", {}], ["keydown", { key: "+" }], ["keydown", { key: "ArrowLeft" }], ["click", { target: new Element() }], ["touchstart", { touches: [1, 2] }]]) {
    mode = "fit";
    domListeners.get(type)(payload);
    assert.equal(mode, "free", type);
  }
  mode = "selected";
  domListeners.get("keydown")({ key: "Tab" });
  assert.equal(mode, "selected");
  listeners.get("dragstart")();
  assert.equal(mode, "free");
  mode = "fit";
  listeners.get("boxzoomstart")();
  assert.equal(mode, "free");
  dispose();
  assert.equal(listeners.size, 0);
  assert.equal(domListeners.size, 0);
});
