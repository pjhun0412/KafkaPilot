const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");

// Exercise source modules without starting Electron or connecting to Kafka.
module.exports = function loadTypeScript(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const nativeRequire = createRequire(filename);
  const requireSource = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith(".")) {
      const base = path.resolve(path.dirname(filename), specifier).replace(/\.js$/, "");
      for (const extension of [".ts", ".tsx"]) {
        if (fs.existsSync(base + extension)) return loadTypeScript(base + extension, mocks, cache);
      }
    }
    return nativeRequire(specifier);
  };
  const execute = vm.runInThisContext(`(function(require, module, exports) {\n${output}\n})`, { filename });
  execute(requireSource, module, module.exports);
  return module.exports;
};
