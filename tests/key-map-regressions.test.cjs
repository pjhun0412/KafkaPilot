const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");

const { formatMessagePayload } = loadTypeScript("src/renderer/utils.tsx");
const preview = loadTypeScript("src/renderer/messagePreview.ts");
const map = loadTypeScript("src/renderer/mapPreview.ts");
const preferences = loadTypeScript("src/renderer/viewerPreferences.ts");
const { toConsumedMessage } = loadTypeScript("src/main/messageMapper.ts", {
  "./avroDecoder.js": { decodeConfluentAvro: async () => undefined }
});
const { formatMessageExportContent } = loadTypeScript("src/main/ipc/messageExportFormatters.ts", {
  "../storage.js": { defaultPreferences: {} }
});

const message = {
  serverId: "server", topic: "coordinates", partition: 0, offset: "2",
  timestamp: "2026-10-07T06:08:18.275Z", key: "2522026100715025500",
  value: '{"currentLat":37757309,"currentLng":128905820}', headers: {}
};
const mapping = {
  xPath: "value.currentLng", yPath: "value.currentLat", projection: "wgs84_e6"
};

test("Kafka keys remain exact strings through reception, inspection, preview and export", async () => {
  for (const key of [message.key, "-2522026100715025500", "9007199254740991", "00123", "true", "null", '"quoted"', '{"id":2522026100715025500}', ""]) {
    const consumed = await toConsumedMessage({ id: "server" }, message.topic, 0, {
      key: Buffer.from(key), value: Buffer.from(message.value),
      offset: "2", timestamp: "1791353298275", headers: {}
    });
    const payload = formatMessagePayload(consumed);
    assert.equal(consumed.key, key);
    assert.equal(payload.key, key);
    assert.equal(JSON.parse(JSON.stringify(payload)).key, key);
    assert.deepEqual(payload.value, { currentLat: 37757309, currentLng: 128905820 });
    assert.equal(preview.formatPreviewText(consumed, "key", "utf-8"), key);
    const exported = formatMessageExportContent({ format: "json", topic: message.topic, messages: [consumed] });
    assert.equal(JSON.parse(exported).messages[0].key, key);
  }
});

test("E6 field mapping converts integer coordinates and retains the original key as vehicle ID", () => {
  const payload = formatMessagePayload(message);
  const point = map.createLiveMapPoint(message, payload, undefined, mapping);
  assert.equal(point.lat, 37.757309);
  assert.equal(point.lng, 128.90582);
  assert.equal(point.id, message.key);
  assert.equal(point.label, message.key);
  assert.equal(payload.value.currentLat, 37757309);
  assert.equal(payload.value.currentLng, 128905820);
});

test("live ConsumePanel sends E6 points without selecting the incoming message", () => {
  const effects = [];
  const timers = [];
  const sent = [];
  const react = {
    ...require("react"),
    memo: (component) => component,
    useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
    useMemo: (factory) => factory(),
    useRef: (current) => ({ current }),
    useEffect: (effect) => effects.push(effect)
  };
  const { ConsumePanel } = loadTypeScript("src/renderer/components/workspace/consume/ConsumePanel.tsx", {
    react,
    "./ConsumeToolbar": { ConsumeToolbar: () => null },
    "./MessageInspector": { MessageInspector: () => null },
    "./MessageFilterBar": { MessageFilterBar: () => null },
    "./MessageGrid": {
      MessageGrid: () => null,
      getMessageRowKey: (item) => item.offset,
      useMessageGridRows: () => ({ rows: [], highlightedMessageKeys: new Set() })
    },
    "./useInspectorResize": { useInspectorResize: () => () => {} }
  });
  const previousWindow = global.window;
  const cleanups = [];
  global.window = {
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    setTimeout: (callback) => timers.push(callback), clearTimeout: () => {},
    kafkaApi: { sendLiveMapPoints: (points) => sent.push(...points) }
  };
  try {
    ConsumePanel({
      messages: [message], selectedMessage: null, mode: "live", language: "en",
      mapFieldMapping: mapping, valueColumnPaths: [], filterText: "", filterField: "all",
      filterMode: "hide", valueFormat: "json", keyFormat: "text", payloadEncoding: "utf-8"
    });
    for (const effect of effects) cleanups.push(effect());
    for (const callback of timers) callback();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].lat, 37.757309);
    assert.equal(sent[0].lng, 128.90582);
    assert.equal(sent[0].id, message.key);
  } finally {
    for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

test("E6 accepts numeric strings, negative coordinates, zero and geographic boundaries", () => {
  for (const [lat, lng, expected] of [
    ["37757309", "128905820", { lat: 37.757309, lng: 128.90582 }],
    [-37757309, -128905820, { lat: -37.757309, lng: -128.90582 }],
    [0, 0, { lat: 0, lng: 0 }],
    [90000000, 180000000, { lat: 90, lng: 180 }],
    [-90000000, -180000000, { lat: -90, lng: -180 }]
  ]) {
    assert.deepEqual(map.getMapCoordinateFromSelection({ value: { currentLat: lat, currentLng: lng } }, mapping), expected);
  }
});

test("E6 rejects missing, non-numeric, non-finite and out-of-range coordinates", () => {
  for (const [lat, lng] of [
    [90000001, 128905820], [37757309, 180000001], [-90000001, 128905820],
    [37757309, -180000001], ["", 128905820], [null, 128905820],
    [undefined, 128905820], ["invalid", 128905820], [Infinity, 128905820], [NaN, 128905820]
  ]) {
    assert.equal(map.getMapCoordinateFromSelection({ value: { currentLat: lat, currentLng: lng } }, mapping), null);
  }
});

test("E6 mapping survives per-topic preference serialization without changing another topic", () => {
  const existingMapping = { xPath: "lng", yPath: "lat", projection: "wgs84_msec" };
  const current = preferences.normalizeViewerPreferences({ retentionDays: 0, byServer: {
    server: { other: { mapFieldMapping: existingMapping, updatedAt: Date.now() } }
  } });
  const saved = preferences.updateTopicViewerPreference({
    current, serverId: "server", topic: message.topic,
    baseline: { mapFieldMapping: null }, patch: { mapFieldMapping: mapping }
  });
  const restored = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(preferences.getViewerPreferenceOverride(restored, "server", message.topic).mapFieldMapping, mapping);
  assert.deepEqual(restored.byServer.server.other, current.byServer.server.other);
  assert.equal(map.createLiveMapPoint(message, formatMessagePayload(message), undefined,
    preferences.getViewerPreferenceOverride(restored, "server", message.topic).mapFieldMapping).lat, 37.757309);
});

test("existing degree, milliarcsecond, TM and UTM mappings keep their conversion behavior", () => {
  for (const [projection, x, y, expectedLat, expectedLng] of [
    ["wgs84", 128.90582, 37.757309, 37.757309, 128.90582],
    ["wgs84_msec", 129 * 3600000, 38 * 3600000, 38, 129],
    ["korea_grs80_central", 200000, 600000, 38, 127],
    ["korea_itrf2000_central", 200000, 500000, 38, 127],
    ["utm52n", 500000, 0, 0, 129]
  ]) {
    const coordinate = map.getMapCoordinateFromSelection({ x, y }, { xPath: "x", yPath: "y", projection });
    assert.ok(Math.abs(coordinate.lat - expectedLat) < 1e-8, projection);
    assert.ok(Math.abs(coordinate.lng - expectedLng) < 1e-8, projection);
  }
  assert.equal(map.getMapCoordinateFromSelection(formatMessagePayload(message), { ...mapping, projection: "wgs84" }), null);
});
