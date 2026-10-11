const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const providerSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "context", "UC04VitalDbContext.tsx"),
  "utf8",
);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { persistDataSourceMode, readPersistedDataSourceMode } = require(
  path.join(__dirname, "..", "src", "lib", "api", "dataSourcePersistence.ts"),
);

test("VitalDB source selection is restored and saved across a browser reload", () => {
  assert.match(providerSource, /readPersistedDataSourceMode\(window\.sessionStorage\)/);
  assert.match(providerSource, /persistDataSourceMode\(window\.sessionStorage, nextMode\)/);
});

test("data source persistence defaults safely and round-trips the selected mode", () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };

  assert.equal(readPersistedDataSourceMode(storage), "SYNTHETIC_DEMO");
  assert.equal(persistDataSourceMode(storage, "VITALDB_REPLAY"), true);
  assert.equal(readPersistedDataSourceMode(storage), "VITALDB_REPLAY");
  assert.equal(persistDataSourceMode(storage, "SYNTHETIC_DEMO"), true);
  assert.equal(readPersistedDataSourceMode(storage), "SYNTHETIC_DEMO");
});

test("unavailable browser storage falls back without breaking source selection", () => {
  assert.equal(readPersistedDataSourceMode({ getItem: () => { throw new Error("denied"); } }), "SYNTHETIC_DEMO");
  assert.equal(persistDataSourceMode({ setItem: () => { throw new Error("denied"); } }, "VITALDB_REPLAY"), false);
});
