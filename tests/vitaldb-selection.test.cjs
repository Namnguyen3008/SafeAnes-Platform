const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
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

const { retainReplayEventSelectionAtTime } = require(
  path.join(__dirname, "..", "src", "context", "vitalDbReplaySelection.ts"),
);
const contextSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "context", "UC04VitalDbContext.tsx"),
  "utf8",
);

test("a selected evidence event stays selected when its seek snapshot arrives at the event time", () => {
  const selection = { id: "case-start", timestamp: 0, source: "VitalDB EVENT", kind: "OBSERVED" };
  assert.deepEqual(retainReplayEventSelectionAtTime(selection, 0), selection);
});

test("a selected evidence event is cleared when replay moves before its event time", () => {
  const selection = { id: "desaturation", timestamp: 60, source: "VitalDB derived event", kind: "DERIVED" };
  assert.equal(retainReplayEventSelectionAtTime(selection, 59), null);
});

test("replay snapshots preserve a selected event when its evidence time is still available", () => {
  assert.match(
    contextSource,
    /retainReplayEventSelectionAtTime\(selection, frame\.as_of_s\)/,
  );
});
