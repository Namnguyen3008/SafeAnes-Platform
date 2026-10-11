const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

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

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === "@/components/clinical-waveforms/waveformEngine") {
    return path.join(__dirname, "..", "src", "components", "clinical-waveforms", "waveformEngine.ts");
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { projectUC05VitalDbView, toRecordedWaveformSamples } = require(
  path.join(__dirname, "..", "src", "adapters", "uc05VitalDbAdapter.ts")
);
const { toRespiratoryVitalDbCaseData } = require(
  path.join(__dirname, "..", "src", "adapters", "uc05VitalDbCaseAdapter.ts")
);

function makeView() {
  return {
    case_id: "1",
    dataset: "VitalDB",
    dataset_version: "1.0.1",
    as_of_s: 700,
    window_start_s: 100,
    window_end_s: 700,
    time_basis: "seconds_since_case_start",
    available_tracks: ["Primus/CO2", "SNUADC/PLETH"],
    signals: [{
      signal: "SPO2",
      track_name: "Solar8000/PLETH_SPO2",
      unit: "NOT_RECORDED",
      source: "Solar8000",
      quality: "UNKNOWN",
      observations: [
        { timestamp: 699, value: 92, unit: "NOT_RECORDED", quality: "UNKNOWN", is_missing: false },
        { timestamp: 701, value: 89, unit: "NOT_RECORDED", quality: "UNKNOWN", is_missing: false },
      ],
    }],
    waveforms: {
      capno: {
        track_name: "Primus/CO2", source: "Primus", unit: "mmHg", sample_rate_hz: 62.5,
        quality: "DEGRADED", timestamps: [699.9, 699.916, 699.932, 701],
        values: [35, null, 38, 10], is_missing: [false, true, false, false],
        missing_intervals: [{ start_time_s: 699.916, end_time_s: 699.932 }],
        provenance: { dataset: "VitalDB", raw_sha256: "source-sha" },
      },
      awp: null,
      ppg: {
        track_name: "SNUADC/PLETH", source: "SNUADC", unit: "NOT_RECORDED", sample_rate_hz: 500,
        quality: "UNKNOWN", timestamps: [699.996, 699.998], values: [0.1, 0.2],
        is_missing: [false, false], missing_intervals: [], provenance: { dataset: "VitalDB" },
      },
      flow: null,
      resp: null,
    },
    recorded_events: [{
      id: "annotation-1", timestamp: 699, event_type: "VITALDB_ANNOTATION", description: "source note",
      source: "VitalDB EVENT", quality: "UNKNOWN", definition: "Recorded annotation text",
      source_class: "OBSERVED", provenance: { dataset: "VitalDB" },
    }, {
      id: "future-annotation", timestamp: 701, event_type: "VITALDB_ANNOTATION", description: "future",
      source: "VitalDB EVENT", quality: "UNKNOWN", source_class: "OBSERVED", provenance: { dataset: "VitalDB" },
    }],
    derived_events: [{
      id: "spo2-episode-1", start_time_s: 640, end_time_s: 700, source_class: "DERIVED",
      source: "Solar8000/PLETH_SPO2", definition: "SpO2 < 90% for at least 60 seconds",
      quality: "UNKNOWN", provenance: { dataset: "VitalDB" },
    }],
    predictions: [
      { prediction_time: 690, horizon_if_applicable: 1, raw_output: -1, interpreted_output: { kind: "temperature_scaled_probability", value: 0.1 }, data_coverage: 0.8, quality: "DEGRADED" },
      { prediction_time: 690, horizon_if_applicable: 3, raw_output: -0.5, interpreted_output: { kind: "temperature_scaled_probability", value: 0.2 }, data_coverage: 0.8, quality: "DEGRADED" },
      { prediction_time: 690, horizon_if_applicable: 5, raw_output: -0.2, interpreted_output: { kind: "temperature_scaled_probability", value: 0.3 }, data_coverage: 0.8, quality: "DEGRADED" },
      { prediction_time: 690, horizon_if_applicable: null, raw_output: -4, interpreted_output: { kind: "raw_logit", value: -4 }, data_coverage: 0.8, quality: "DEGRADED" },
      { prediction_time: 701, horizon_if_applicable: 5, raw_output: 2, interpreted_output: { kind: "temperature_scaled_probability", value: 0.9 }, data_coverage: 0.8, quality: "GOOD" },
    ],
    prediction_cache_status: "READY",
    prediction_cache: {
      window_eligibility: "ABSTAINED",
      window_reason: "INPUT_NOT_ELIGIBLE: fixture abstention",
    },
    model: {
      model_id: "SafeAnes-UC05-RespFormer",
      model_version: "v1-demo-test",
      artifact_sha256: "artifact-sha",
      task: "SpO2 <90% sustained for 60 seconds",
      horizons_minutes: [1, 3, 5],
      readiness_status: "BLOCKED_CONTRACT_MISMATCH",
      inference_contract_mode: "STRICT_SIGNAL_SCHEMA",
      clinical_use: false,
    },
  };
}

test("UC05 VitalDB projection clips all data to replay time and retains raw waveform gaps", () => {
  const view = projectUC05VitalDbView(makeView(), 700);

  assert.deepEqual(view.signals[0].observations.map((item) => item.timestamp), [699]);
  assert.deepEqual(view.waveforms.capno.timestamps, [699.9, 699.916, 699.932]);
  assert.deepEqual(view.waveforms.capno.values, [35, null, 38]);
  assert.equal(view.waveforms.capno.sample_rate_hz, 62.5);
  assert.equal(view.waveforms.awp, null);
  assert.deepEqual(view.recorded_events.map((item) => item.id), ["annotation-1"]);
  assert.deepEqual(view.predictions.map((item) => item.horizon_if_applicable), [1, 3, 5, null]);
  assert.ok(view.predictions.every((item) => item.prediction_time <= 700));
  assert.equal(view.derived_events[0].definition, "SpO2 < 90% for at least 60 seconds");
  assert.equal(view.model.readiness_status, "BLOCKED_CONTRACT_MISMATCH");
  assert.equal(view.windowEligibility, "ABSTAINED");
  assert.equal(view.windowReason, "INPUT_NOT_ELIGIBLE: fixture abstention");
});

test("recorded renderer samples retain timestamp, missingness, quality, and direct provenance", () => {
  const view = projectUC05VitalDbView(makeView(), 700);
  const samples = toRecordedWaveformSamples(view.waveforms.capno, "Primus");

  assert.deepEqual(samples.map((item) => item.eventTime), [699900, 699916, 699932]);
  assert.deepEqual(samples.map((item) => item.value), [35, null, 38]);
  assert.ok(samples.every((item) => item.quality === "DEGRADED"));
  assert.ok(samples.every((item) => item.provenance === "DIRECT"));
});

test("VitalDB UC05 context leaves unavailable demographics and device state unknown", () => {
  const data = toRespiratoryVitalDbCaseData(projectUC05VitalDbView(makeView(), 700));

  assert.equal(data.patient.category, "NOT_RECORDED");
  assert.equal(data.patient.operatingRoom, "NOT_RECORDED");
  assert.equal(data.patient.anesthesiaType, "NOT_RECORDED");
  assert.equal(data.device.isWifiConnected, null);
  assert.equal(data.device.isSensorConnected, null);
  assert.equal(data.device.isSystemOk, null);
});
