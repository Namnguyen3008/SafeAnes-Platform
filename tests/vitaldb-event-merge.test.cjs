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

const { mergeVitalDbEvents } = require(
  path.join(__dirname, "..", "src", "adapters", "vitalDbEventAdapter.ts"),
);

test("the same VitalDB annotation from UC04 and UC05 has one canonical row", () => {
  const uc04 = [{
    timestamp: 0,
    description: "Case started",
    source: "VitalDB EVENT",
    quality: "UNKNOWN",
  }];
  const uc05 = [{
    id: "vitaldb-annotation-0-0.000",
    timestamp: 0,
    available_at_s: 0,
    event_type: "ANNOTATION",
    description: "Case started",
    definition: "Recorded VitalDB EVENT annotation",
    source: "VitalDB EVENT",
    source_class: "OBSERVED",
    quality: "UNKNOWN",
    provenance: { track_name: "EVENT" },
  }];

  const events = mergeVitalDbEvents(uc04, uc05, [], 0);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, "vitaldb-annotation-0-0.000");
  assert.equal(events[0].kind, "OBSERVED");
});

test("distinct recorded and derived events at the same time remain separate", () => {
  const events = mergeVitalDbEvents(
    [],
    [{
      id: "recorded",
      timestamp: 12,
      event_type: "ANNOTATION",
      description: "Case marker",
      source: "VitalDB EVENT",
      source_class: "OBSERVED",
      quality: "UNKNOWN",
    }],
    [{
      id: "derived",
      timestamp: 12,
      event_type: "DESATURATION",
      description: "SpO2 below threshold",
      source: "SafeAnes derived rule",
      source_class: "DERIVED",
      quality: "GOOD",
    }],
    12,
  );

  assert.deepEqual(events.map((event) => event.id), ["recorded", "derived"]);
});
