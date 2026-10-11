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

const { getWaveformHeaderMode, getWaveformUnit } = require(
  path.join(__dirname, "..", "src", "adapters", "uc05WaveformPresentation.ts")
);

test("recorded source with no waveform is marked unavailable, never as a live sweep", () => {
  assert.equal(getWaveformHeaderMode("VITALDB_REPLAY", false), "UNAVAILABLE");
  assert.equal(getWaveformHeaderMode("VITALDB_REPLAY", true), "RECORDED_RATE");
  assert.equal(getWaveformHeaderMode("SYNTHETIC_DEMO", false), "LIVE_SWEEP");
});

test("recorded waveforms preserve only source units and mark absent units unknown", () => {
  assert.equal(getWaveformUnit("VITALDB_REPLAY", "mmHg", "mmHg"), "mmHg");
  assert.equal(getWaveformUnit("VITALDB_REPLAY", null, "relative amplitude"), "NOT_RECORDED");
  assert.equal(getWaveformUnit("SYNTHETIC_DEMO", null, "relative amplitude"), "relative amplitude");
});
