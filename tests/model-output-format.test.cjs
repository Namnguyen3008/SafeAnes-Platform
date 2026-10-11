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

const { formatModelOutput, formatModelPercent } = require(path.join(__dirname, "..", "src", "lib", "formatModelOutput.ts"));
const { classifyModelOutputState } = require(path.join(__dirname, "..", "src", "lib", "modelOutputStatus.ts"));

test("UC05 recorded model outputs use precision-preserving formatting", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc05", "ClinicalSummaryRail.tsx"), "utf8");
  assert.match(source, /formatModelOutput\(row\.value\)/);
  assert.match(source, /formatModelOutput\(auxiliary\.value\)/);
});

test("model output formatter preserves small nonzero values and significant digits", () => {
  assert.equal(formatModelOutput(0.000002), "0.000002");
  assert.equal(formatModelOutput(0.0000002), "2e-7");
  assert.equal(formatModelOutput(0.00121385), "0.001214");
  assert.equal(formatModelOutput(-4.38626337), "-4.386");
  assert.equal(formatModelOutput(0), "0");
  assert.equal(formatModelOutput(Number.NaN), "NOT_AVAILABLE");
});

test("model percent formatter outputs readable percentages for probability and score outputs", () => {
  assert.equal(formatModelPercent(0.4166), "41.7%");
  assert.equal(formatModelPercent(0.0883), "8.8%");
  assert.equal(formatModelPercent(0.005), "0.50%");
  assert.equal(formatModelPercent(0.000002079), "0.00021%");
  assert.equal(formatModelPercent(0), "0%");
  assert.equal(formatModelPercent(1), "100.0%");
  assert.equal(formatModelPercent(-4.386), null);
  assert.equal(formatModelPercent(Number.NaN), null);
  assert.equal(formatModelPercent(null), null);
});

test("recorded model output state distinguishes loading, blocked, abstained, missing and ready", () => {
  assert.equal(classifyModelOutputState({ loading: true, readinessStatus: "INTEGRATION_READY", hasOutput: false }), "LOADING");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "BLOCKED_CONTRACT_MISMATCH", hasOutput: false }), "MODEL_NOT_READY");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "INSUFFICIENT_DATA", hasOutput: false }), "ABSTAINED");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "INFERENCE_FAILED", hasOutput: false }), "INFERENCE_FAILED");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "INTEGRATION_READY", predictionCacheStatus: "NOT_READY", hasOutput: false }), "PREDICTION_CACHE_NOT_READY");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "INTEGRATION_READY", predictionCacheStatus: "READY", windowEligibility: "ABSTAINED", hasOutput: false }), "ABSTAINED");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "INTEGRATION_READY", hasOutput: false }), "NO_OUTPUT");
  assert.equal(classifyModelOutputState({ loading: false, readinessStatus: "INTEGRATION_READY", hasOutput: true }), "READY");
});

test("recorded model output components consume the explicit state projection", () => {
  const uc04 = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc04", "PredictedHpiPanel.tsx"), "utf8");
  const uc04Secondary = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc04", "HypotensionRiskCard.tsx"), "utf8");
  const uc04Gauge = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc04", "OverviewGaugeStrip.tsx"), "utf8");
  const uc04Trend = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc04", "VitalDbHemodynamicTrendPanel.tsx"), "utf8");
  const uc04Popover = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc04", "ui", "Popover.tsx"), "utf8");
  const uc05 = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc05", "ClinicalSummaryRail.tsx"), "utf8");
  assert.match(uc04, /projectModelOutputState/);
  assert.match(uc04, /formatModelOutput\(f\.outputValue\)/);
  for (const source of [uc04Secondary, uc04Gauge, uc04Trend, uc04Popover]) assert.match(source, /projectModelOutputState/);
  assert.match(uc04Secondary, /vitaldb\.modelPrediction/);
  assert.doesNotMatch(uc04Secondary, /vitaldb\.recordedDataLabel/);
  assert.match(uc05, /projectModelOutputState/);
});

test("recorded adapters do not invent a fallback horizon or output semantics", () => {
  const uc04 = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "uc04Adapter.ts"), "utf8");
  const uc05 = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "uc05VitalDbCaseAdapter.ts"), "utf8");
  assert.match(uc04, /horizonMinutes:\s*primaryOutput\?\.horizon_minutes_or_null \?\? null/);
  assert.match(uc04, /outputSemantics:\s*primaryOutput\?\.interpreted_output\.kind \?\? modelMetadata\.output_semantics/);
  assert.match(uc05, /horizonMinutes:\s*firstOutput\?\.horizon_minutes_or_null \?\? null/);
});

test("recorded adapters preserve cache and current-window eligibility evidence", () => {
  const uc04 = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "uc04VitalDbAdapter.ts"), "utf8");
  const uc05 = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "uc05VitalDbAdapter.ts"), "utf8");
  const uc04Case = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "uc04Adapter.ts"), "utf8");
  const uc05Case = fs.readFileSync(path.join(__dirname, "..", "src", "adapters", "uc05VitalDbCaseAdapter.ts"), "utf8");
  for (const source of [uc04, uc05]) {
    assert.match(source, /prediction_cache_status/);
    assert.match(source, /abstained_window_count/);
    assert.match(source, /windowEligibility/);
  }
  assert.match(uc04Case, /predictionCacheStatus/);
  assert.match(uc04Case, /windowEligibility/);
  assert.match(uc05Case, /predictionCacheStatus/);
  assert.match(uc05Case, /windowEligibility/);
});
