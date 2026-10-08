const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const loadTypeScript = require("./load-typescript.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kafkapilot-storage-"));
  t.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith("kafkapilot-storage-"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const storage = loadTypeScript("src/main/storage.ts", {
    electron: { app: { getPath: () => directory }, safeStorage: { isEncryptionAvailable: () => false } },
    "node:fs/promises": { ...fs, ...overrides },
    "./logger.js": { writeAppLog: async () => {} }
  });
  return { directory, storage };
}

for (const kind of ["profiles", "preferences"]) {
  const filename = kind === "profiles" ? "servers.json" : "preferences.json";
  const first = kind === "profiles" ? [{ id: "one", name: "First", brokers: ["localhost:9092"] }] : { appearance: { language: "ko" }, layout: { sidebarCollapsed: true } };
  const second = kind === "profiles" ? [{ id: "two", name: "Second", brokers: ["localhost:9092"] }] : { appearance: { language: "en" } };
  const method = kind === "profiles" ? "writeProfiles" : "writePreferences";
  const readMethod = kind === "profiles" ? "readProfiles" : "readPreferences";
  const identity = (value) => kind === "profiles" ? value[0]?.id : value.appearance.language;

  test(`${kind}: a second save creates recovery directory and preserves the previous version`, async (t) => {
    const { directory, storage } = await fixture(t);
    await fs.writeFile(path.join(directory, filename), JSON.stringify(first));
    await storage[method](second);
    assert.equal(identity(JSON.parse(await fs.readFile(path.join(directory, ".recovery", filename)))), identity(first));
    assert.equal(identity(await storage[readMethod]()), identity(second));
  });

  for (const corrupt of [false, true]) {
    test(`${kind}: valid backup restores a ${corrupt ? "corrupt" : "missing"} primary file`, async (t) => {
      const { directory, storage } = await fixture(t);
      await fs.mkdir(path.join(directory, ".recovery"));
      await fs.writeFile(path.join(directory, ".recovery", filename), JSON.stringify(first));
      if (corrupt) await fs.writeFile(path.join(directory, filename), "{");
      assert.equal(identity(await storage[readMethod]()), identity(first));
      assert.equal(identity(JSON.parse(await fs.readFile(path.join(directory, filename)))), identity(first));
      assert.equal(identity(JSON.parse(await fs.readFile(path.join(directory, ".recovery", filename)))), identity(first));
    });
  }

  test(`${kind}: a rotation I/O error does not delete the valid primary file`, async (t) => {
    const { directory, storage } = await fixture(t, {
      rename: async (from, to) => {
        if (path.basename(from) === filename && path.basename(path.dirname(to)) === ".recovery") {
          throw Object.assign(new Error("fixture rename denied"), { code: "EACCES" });
        }
        return fs.rename(from, to);
      }
    });
    await fs.writeFile(path.join(directory, filename), JSON.stringify(first));
    await assert.rejects(storage[method](second), /fixture rename denied/);
    assert.equal(identity(JSON.parse(await fs.readFile(path.join(directory, filename)))), identity(first));
  });

  test(`${kind}: reads wait for an in-progress backup rotation instead of restoring stale data`, async (t) => {
    const rotated = deferred();
    const finishWrite = deferred();
    const { directory, storage } = await fixture(t, {
      rename: async (from, to) => {
        await fs.rename(from, to);
        if (path.basename(from) === filename && path.basename(path.dirname(to)) === ".recovery") {
          rotated.resolve();
          await finishWrite.promise;
        }
      }
    });
    await fs.writeFile(path.join(directory, filename), JSON.stringify(first));
    const writing = storage[method](second);
    await rotated.promise;
    let readFinished = false;
    const reading = storage[readMethod]().then((value) => { readFinished = true; return value; });
    await new Promise((done) => setImmediate(done));
    assert.equal(readFinished, false);
    finishWrite.resolve();
    await writing;
    assert.equal(identity(await reading), identity(second));
    assert.equal(identity(JSON.parse(await fs.readFile(path.join(directory, filename)))), identity(second));
  });
}

test("a rejected write releases the file queue for a later save", async (t) => {
  let fail = true;
  const { storage } = await fixture(t, {
    writeFile: async (...args) => {
      if (fail) { fail = false; throw new Error("fixture write denied"); }
      return fs.writeFile(...args);
    }
  });
  await assert.rejects(storage.writePreferences({ appearance: { language: "ko" } }), /fixture write denied/);
  await storage.writePreferences({ appearance: { language: "en" } });
  assert.equal((await storage.readPreferences()).appearance.language, "en");
});

test("profile migration can write within the read lock without deadlocking", { timeout: 3000 }, async (t) => {
  const { directory } = await fixture(t);
  await fs.writeFile(path.join(directory, "servers.json"), JSON.stringify([{
    id: "legacy", name: "Legacy", brokers: ["localhost:9092"],
    schemaRegistry: { url: "http://localhost:8081", auth: { type: "basic", username: "test", password: "fixture-value" } }
  }]));
  const storage = loadTypeScript("src/main/storage.ts", {
    electron: {
      app: { getPath: () => directory },
      safeStorage: { isEncryptionAvailable: () => true, encryptString: () => Buffer.from("fixture-encrypted") }
    },
    "./logger.js": { writeAppLog: async () => {} }
  });
  assert.equal((await storage.readProfiles())[0].id, "legacy");
  const stored = JSON.parse(await fs.readFile(path.join(directory, "servers.json")))[0];
  assert.equal(stored.schemaRegistry.auth.password, undefined);
  assert.equal(stored.schemaRegistry.auth.passwordEncrypted, Buffer.from("fixture-encrypted").toString("base64"));
});

test("fresh installation still receives default preferences and an empty profile list", async (t) => {
  const { storage } = await fixture(t);
  assert.deepEqual(await storage.readProfiles(), []);
  assert.deepEqual(await storage.readPreferences(), storage.defaultPreferences);
});

test("import applies language and collapsed sidebar before subsequent autosave", () => {
  const { applyImportedPreferences } = loadTypeScript("src/renderer/hooks/actions/settingsTransferUtils.ts");
  const state = {};
  const setters = new Proxy({}, { get: (_, name) => (value) => { state[name] = value; } });
  applyImportedPreferences({ appearance: { language: "ko" }, layout: { sidebarCollapsed: true } }, setters);
  assert.equal(state.setLanguage, "ko");
  assert.equal(state.setSidebarCollapsed, true);
  applyImportedPreferences({ appearance: { language: "auto" }, layout: { sidebarCollapsed: false } }, setters);
  assert.equal(state.setLanguage, "auto");
  assert.equal(state.setSidebarCollapsed, false);
});

test("editor font Reset restores all font settings without modifying the export template", (t) => {
  const previousReact = global.React;
  global.React = require("react");
  t.after(() => { global.React = previousReact; });
  const { PreferencesDialog } = loadTypeScript("src/renderer/components/modals/PreferencesDialog.tsx");
  const values = { template: "custom-format" };
  const tree = PreferencesDialog({
    activePage: "editor-font", resolvedLanguage: "en",
    onFontFamily: (value) => { values.family = value; },
    onFontSize: (value) => { values.size = value; },
    onFontWeight: (value) => { values.weight = value; },
    onExportFormatTemplate: (value) => { values.template = value; }
  });
  const findReset = (node) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === "button" && node.props.children === "Reset") return node;
    return [node.props?.children].flat(Infinity).map(findReset).find(Boolean);
  };
  const button = findReset(tree);
  assert.ok(button, "actual PreferencesDialog reset action exists");
  button.props.onClick();
  assert.equal(values.size, 13);
  assert.equal(values.weight, 600);
  assert.match(values.family, /Inter/);
  assert.equal(values.template, "custom-format");
});
