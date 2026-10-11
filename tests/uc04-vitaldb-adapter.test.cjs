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

const { projectUC04VitalDbView } = require(
  path.join(__dirname, "..", "src", "adapters", "uc04VitalDbAdapter.ts")
);

function prediction(time, horizon, score) {
  return {
    case_id: "1",
    model_id: "SafeAnes-UC04-HypoFormer",
    model_version: "verified-version",
    prediction_time: time,
    input_window_start: time - 300,
    input_window_end: time,
    task: "New MAP episode <=65 mmHg sustained for >=60 seconds within 5, 10, or 15 minutes",
    raw_output: 0.25,
    interpreted_output: { kind: "uncalibrated_sigmoid_score", value: score, calibrated: false },
    horizon_minutes_or_null: horizon,
    data_coverage: 0.9,
    quality: "GOOD",
    calibrated_or_not: false,
    threshold_if_verified: horizon === 5 ? 0.5 : null,
    artifact_sha256: "artifact",
  };
}

test("UC04 VitalDB projection retains only as-of data and exact model horizons", () => {
  const projection = projectUC04VitalDbView({
    case_id: "1",
    dataset: "VitalDB",
    dataset_version: "1.0.1",
    as_of_s: 400,
    window_start_s: 0,
    window_end_s: 400,
    time_basis: "seconds_since_case_start",
    available_tracks: ["Solar8000/ART_MBP", "Solar8000/HR"],
    signals: [
      { signal: "MAP", track_name: "Solar8000/ART_MBP", observations: [
        { timestamp: 300, value: 70, unit: "mmHg", quality: "UNKNOWN", is_missing: false },
        { timestamp: 401, value: 10, unit: "mmHg", quality: "UNKNOWN", is_missing: false },
      ] },
      { signal: "HR", track_name: "Solar8000/HR", observations: [
        { timestamp: 399, value: 75, unit: "/min", quality: "UNKNOWN", is_missing: false },
      ] },
    ],
    abp_waveform: { start_time_s: 370, end_time_s: 400, timestamps: [399, 401], values: [82, 0] },
    events: [{ timestamp: 390, description: "Recorded annotation" }, { timestamp: 402, description: "Future annotation" }],
    predictions: { predictions: [prediction(390, 5, 0.4), prediction(390, 10, 0.2),
      prediction(390, 15, 0.1), prediction(420, 5, 0.9), prediction(390, 1, 0.7)] },
    prediction_cache_status: "READY",
    prediction_cache: {
      window_eligibility: "ABSTAINED",
      window_reason: "INPUT_NOT_ELIGIBLE: fixture abstention",
    },
  }, 400);

  assert.equal(projection.asOfSeconds, 400);
  assert.equal(projection.latestBySignal.MAP.value, 70);
  assert.equal(projection.latestBySignal.HR.value, 75);
  assert.deepEqual(projection.events.map((event) => event.description), ["Recorded annotation"]);
  assert.deepEqual(projection.abp_waveform.timestamps, [399]);
  assert.deepEqual(projection.latestPredictions.map((item) => item.horizon_minutes_or_null), [5, 10, 15]);
  assert.ok(projection.predictions.every((item) => item.prediction_time <= 400));
  assert.equal(projection.latestPredictions[0].interpreted_output.kind, "uncalibrated_sigmoid_score");
  assert.equal(projection.latestPredictions[0].calibrated_or_not, false);
  assert.equal(projection.windowEligibility, "ABSTAINED");
  assert.equal(projection.windowReason, "INPUT_NOT_ELIGIBLE: fixture abstention");
});
