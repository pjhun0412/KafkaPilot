const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");

const { normalizeServerGroups, moveServerToGroup, getServerGroupId } = loadTypeScript("src/shared/serverGroups.ts");
const { useServerGroupsStore: store } = loadTypeScript("src/renderer/stores/ui/serverGroupsStore.ts");
const initial = () => [
  { id: "prod", name: "운영", serverIds: ["one", "two"], collapsed: true },
  { id: "dev", name: "개발", serverIds: ["three"], collapsed: false }
];

test("legacy and malformed group settings normalize without duplicate membership", () => {
  for (const value of [undefined, null, {}, "groups"]) assert.deepEqual(normalizeServerGroups(value), []);
  assert.deepEqual(normalizeServerGroups([
    null, { id: "bad", name: " " }, { ...initial()[0], name: " 운영 ", serverIds: ["one", "one", 7, "", "two"] },
    { id: "prod", name: "duplicate", serverIds: ["lost"] }, { ...initial()[1], serverIds: ["one", "three"] }
  ]), initial());
});

test("moving and reordering across groups preserves profiles and unrelated members", () => {
  const original = initial();
  const snapshot = JSON.stringify(original);
  let groups = moveServerToGroup(original, "one", "dev", "three", "after");
  assert.deepEqual(groups.map(x => x.serverIds), [["two"], ["three", "one"]]);
  groups = moveServerToGroup(groups, "one", "dev", "three", "before");
  assert.deepEqual(groups[1].serverIds, ["one", "three"]);
  groups = moveServerToGroup(groups, "one", null);
  assert.equal(getServerGroupId(groups, "one"), null);
  assert.deepEqual(groups.map(x => x.serverIds), [["two"], ["three"]]);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(moveServerToGroup(original, "one", "missing"), original);
  assert.equal(moveServerToGroup(original, "one", "prod", "one"), original);
});

test("group store supports create, rename, collapse and safe deletion", () => {
  store.getState().setGroups(initial());
  assert.equal(store.getState().saveGroup(null, "  QA  "), true);
  const id = store.getState().groups[2].id;
  assert.equal(store.getState().saveGroup(null, "qa"), false);
  assert.equal(store.getState().saveGroup(null, " "), false);
  assert.equal(store.getState().saveGroup(null, "a".repeat(61)), false);
  assert.equal(store.getState().saveGroup(id, "검증"), true);
  store.getState().moveServer("one", id);
  store.getState().toggleGroup(id);
  assert.deepEqual(store.getState().groups[2], { id, name: "검증", serverIds: ["one"], collapsed: true });
  store.getState().deleteGroup(id);
  assert.equal(getServerGroupId(store.getState().groups, "one"), null);
  assert.deepEqual(store.getState().groups.map(x => x.serverIds), [["two"], ["three"]]);
});

test("group reordering preserves membership and collapse, and ignores invalid targets", () => {
  const original = [...initial(), { id: "qa", name: "검증", serverIds: [], collapsed: false }];
  store.getState().setGroups(original);
  const snapshot = store.getState().groups;
  store.getState().reorderGroup("qa", "prod", "before");
  assert.deepEqual(store.getState().groups.map(x => x.id), ["qa", "prod", "dev"]);
  assert.deepEqual(store.getState().groups[1], original[0]);
  assert.deepEqual(snapshot, original);
  store.getState().reorderGroup("qa", "dev", "after");
  assert.deepEqual(store.getState().groups, original);
  const unchanged = store.getState().groups;
  store.getState().reorderGroup("prod", "prod", "after");
  store.getState().reorderGroup("missing", "dev", "before");
  store.getState().reorderGroup("prod", "missing", "after");
  assert.equal(store.getState().groups, unchanged);
});

test("search finds members in collapsed groups and supports group names without changing collapse", () => {
  store.getState().setGroups(initial());
  const { useServerGroups } = loadTypeScript("src/renderer/hooks/ui/useServerGroups.ts", {
    react: { useMemo: (fn) => fn(), useState: (value) => [value, () => {}] },
    "../../stores/ui/serverGroupsStore": { useServerGroupsStore: (selector) => selector(store.getState()) }
  });
  const servers = ["one", "two", "three", "four"].map(id => ({ id, name: id, brokers: [] }));
  let result = useServerGroups(servers, [servers[0]], "one");
  assert.equal(result.sections.groups.length, 1);
  assert.deepEqual(result.sections.groups[0].members.map(x => x.id), ["one"]);
  assert.equal(result.sections.groups[0].group.collapsed, true);
  result = useServerGroups(servers, [], "운영");
  assert.deepEqual(result.sections.groups[0].members.map(x => x.id), ["one", "two"]);
  store.getState().deleteGroup("prod");
  result = useServerGroups(servers, servers, "");
  assert.deepEqual(result.sections.ungrouped.map(x => x.id), ["one", "two", "four"]);
  assert.equal(servers.length, 4);
});

const storage = loadTypeScript("src/main/storage.ts", {
  electron: { app: {}, safeStorage: {} }, "./logger.js": { writeAppLog: async () => {} }
});

test("main preference roundtrip and partial updates keep groups, order and collapse", () => {
  const existing = storage.normalizePreferences({ serverGroups: initial(), favoriteTopicsByServer: { server: ["topic"] } });
  const merged = storage.mergePreferences(existing, { appearance: { fontSize: 14 } });
  const restored = storage.normalizePreferences(JSON.parse(JSON.stringify(merged)));
  assert.deepEqual(restored.serverGroups, initial());
  assert.deepEqual(restored.favoriteTopicsByServer, existing.favoriteTopicsByServer);
  assert.deepEqual(storage.mergePreferences(restored, { serverGroups: [] }).serverGroups, []);
  assert.deepEqual(storage.normalizePreferences({}).serverGroups, []);
});

test("settings import replaces groups and legacy imports clear previous organization", () => {
  const { applyImportedPreferences } = loadTypeScript("src/renderer/hooks/actions/settingsTransferUtils.ts");
  const setters = new Proxy({ setServerGroups: store.getState().setGroups }, { get: (object, key) => object[key] || (() => {}) });
  applyImportedPreferences(storage.normalizePreferences({ serverGroups: initial() }), setters);
  assert.deepEqual(store.getState().groups, initial());
  applyImportedPreferences(storage.normalizePreferences({}), setters);
  assert.deepEqual(store.getState().groups, []);
});

test("preference hook hydrates and saves server groups with the existing persistence flow", async () => {
  const effects = [];
  const saves = [];
  const { usePersistedPreferences } = loadTypeScript("src/renderer/hooks/preferences/usePersistedPreferences.ts", {
    react: { useEffect: (effect) => effects.push(effect) },
    "../../stores/ui/serverGroupsStore": { useServerGroupsStore: (selector) => selector(store.getState()) },
    "../../stores/ui/releaseNotesStore": { useReleaseNotesStore: (selector) => selector({ openReleaseNotes: () => {} }) }
  });
  const values = {
    kafkaApi: {
      loadPreferences: async () => storage.normalizePreferences({ serverGroups: initial() }),
      getAppVersion: async () => "test",
      savePreferences: async (value) => { saves.push(value); return value; }
    },
    preferencesLoaded: false,
    favoriteTopicsByServer: {}, viewerPreferences: {},
  };
  const params = new Proxy(values, { get: (object, key) => String(key).startsWith("set") ? () => {} : object[key] });
  store.getState().setGroups([]);
  usePersistedPreferences(params);
  effects[0]();
  effects[1]();
  await new Promise(setImmediate);
  assert.deepEqual(store.getState().groups, initial());
  assert.equal(saves.length, 0);
  values.preferencesLoaded = true;
  effects.length = 0;
  store.getState().moveServer("two", "dev");
  store.getState().reorderGroup("dev", "prod", "before");
  usePersistedPreferences(params);
  effects[1]();
  assert.deepEqual(saves[0].serverGroups.map(x => x.id), ["dev", "prod"]);
  assert.deepEqual(saves[0].serverGroups.map(x => x.serverIds), [["three", "two"], ["one"]]);
});
