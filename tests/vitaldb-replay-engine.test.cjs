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

const {
  mergeRecordedSamples,
  mergeWaveformSamples,
  mergeReplayPredictions,
  isReplayCaseSwitch,
  mergeVitalDbReplayDelta,
  filterUC04ViewAsOf,
  filterUC05ViewAsOf,
  hasReplaySessionChanged,
} = require(path.join(__dirname, "..", "src", "adapters", "vitalDbReplayBuffer.ts"));
const { projectUC05VitalDbView, toRecordedWaveformSamples } = require(path.join(
  __dirname, "..", "src", "adapters", "uc05VitalDbAdapter.ts",
));

test("unchanged replay snapshots do not trigger another UI state update", () => {
  const paused = {
    session_id: "session-1", case_id: "6388", current_time_s: 42, duration_seconds: 100,
    status: "PAUSED", speed: 1, uc04_model_status: "INTEGRATION_READY", uc05_model_status: "INTEGRATION_READY",
  };
  assert.equal(hasReplaySessionChanged(paused, { ...paused }), false);
  assert.equal(hasReplaySessionChanged(paused, { ...paused, status: "PLAYING" }), true);
  assert.equal(hasReplaySessionChanged(paused, { ...paused, current_time_s: 42.5 }), true);
  assert.equal(hasReplaySessionChanged(paused, { ...paused, speed: 2 }), true);
  assert.equal(hasReplaySessionChanged(paused, { ...paused, case_id: "3300" }), true);
  assert.equal(hasReplaySessionChanged(null, paused), true);
});

test("UC05 projection and waveform adaptation reuse unchanged recorded sample objects", () => {
  const waveform = {
    case_id: "6388", track_name: "SNUADC/PLETH", start_time_s: 1, end_time_s: 2,
    sample_rate_hz: 500, unit: "", source: "VitalDB", quality: "UNKNOWN",
    timestamps: [1, 1.002, 2], values: [2, 3, 4], is_missing: [false, false, false],
    missing_intervals: [], provenance: {},
  };
  const view = {
    case_id: "6388", dataset: "VitalDB", dataset_version: "1", as_of_s: 2,
    window_start_s: 0, window_end_s: 2, time_basis: "seconds_since_case_start",
    available_tracks: ["SNUADC/PLETH"], signals: [], waveforms: { ppg: waveform },
    recorded_events: [], derived_events: [], predictions: [], prediction_cache_status: "READY",
    model: {
      model_id: "demo", model_version: "0.1", artifact_sha256: "hash", task: "task",
      horizons_minutes: [], readiness_status: "INTEGRATION_READY", inference_contract_mode: "verified", clinical_use: false,
    },
  };

  const projected = projectUC05VitalDbView(view, 2);
  assert.strictEqual(projected.waveforms.ppg, waveform);
  const points = toRecordedWaveformSamples(waveform);
  assert.strictEqual(toRecordedWaveformSamples(waveform), points);
});

test("UC05 delta adaptation reuses unchanged point objects and replaces overlapping timestamps", () => {
  const waveform = (start, end, timestamps, values) => ({
    case_id: "6388", track_name: "SNUADC/PLETH", start_time_s: start, end_time_s: end,
    sample_rate_hz: 500, unit: "", source: "VitalDB", quality: "UNKNOWN",
    timestamps, values, is_missing: values.map((value) => value === null),
    missing_intervals: [], provenance: {},
  });
  const firstFrame = waveform(0.5, 2, [0.5, 1, 2], [5, 10, 20]);
  const previousPoints = toRecordedWaveformSamples(firstFrame);
  const merged = mergeWaveformSamples(
    firstFrame,
    waveform(2, 4, [2, 3, 4], [22, 30, 40]),
    4,
    3,
  );
  const currentPoints = toRecordedWaveformSamples(merged);

  assert.deepEqual(currentPoints.map((sample) => sample.eventTime), [1_000, 2_000, 3_000, 4_000]);
  assert.strictEqual(currentPoints[0], previousPoints[1]);
  assert.equal(currentPoints[1].value, 22);
  assert.notStrictEqual(currentPoints[1], previousPoints[2]);
});

test("UC05 waveform projection clips future samples and quality intervals to the selected time", () => {
  const waveform = {
    case_id: "6388", track_name: "Primus/CO2", start_time_s: 1, end_time_s: 3,
    sample_rate_hz: 62.5, unit: "mmHg", source: "VitalDB", quality: "DEGRADED",
    timestamps: [1, 2, 3], values: [10, 20, 30], is_missing: [false, false, false],
    missing_intervals: [{ start_time_s: 2.5, end_time_s: 3 }], provenance: {},
  };
  const view = {
    case_id: "6388", dataset: "VitalDB", dataset_version: "1", as_of_s: 3,
    window_start_s: 0, window_end_s: 3, time_basis: "seconds_since_case_start",
    available_tracks: ["Primus/CO2"], signals: [], waveforms: { capno: waveform },
    recorded_events: [], derived_events: [], predictions: [], prediction_cache_status: "READY",
    model: {
      model_id: "demo", model_version: "0.1", artifact_sha256: "hash", task: "task",
      horizons_minutes: [], readiness_status: "INTEGRATION_READY", inference_contract_mode: "verified", clinical_use: false,
    },
  };

  const projected = projectUC05VitalDbView(view, 2);
  assert.deepEqual(projected.waveforms.capno.timestamps, [1, 2]);
  assert.deepEqual(projected.waveforms.capno.missing_intervals, []);
});

test("incremental recorded samples are ordered, deduplicated, as-of, and bounded", () => {
  const current = [
    { timestamp: 1, value: 10 },
    { timestamp: 2, value: 20 },
  ];
  const incoming = [
    { timestamp: 2, value: 21 },
    { timestamp: 3, value: 30 },
    { timestamp: 11, value: 110 },
  ];

  assert.deepEqual(mergeRecordedSamples(current, incoming, 10, 8), [
    { timestamp: 2, value: 21 },
    { timestamp: 3, value: 30 },
  ]);
});

test("waveform merge preserves raw samples and missing gaps inside a bounded window", () => {
  const current = {
    start_time_s: 4,
    end_time_s: 6,
    sample_rate_hz: 2,
    timestamps: [4, 5, 6],
    values: [40, null, 60],
    is_missing: [false, true, false],
  };
  const delta = {
    start_time_s: 6,
    end_time_s: 11,
    sample_rate_hz: 2,
    timestamps: [6, 8, 10, 11],
    values: [61, 80, 100, 110],
    is_missing: [false, false, false, false],
  };

  const merged = mergeWaveformSamples(current, delta, 10, 5);
  assert.deepEqual(merged.timestamps, [5, 6, 8, 10]);
  assert.deepEqual(merged.values, [null, 61, 80, 100]);
  assert.deepEqual(merged.is_missing, [true, false, false, false]);
  assert.equal(merged.sample_rate_hz, 2);
});

test("replay predictions beyond the shared cursor remain hidden", () => {
  const rows = [
    { model_id: "demo", prediction_time: 8, raw_output: 0.2 },
    { model_id: "demo", prediction_time: 10, raw_output: 0.9 },
  ];
  assert.deepEqual(mergeReplayPredictions([], rows, 9), [rows[0]]);
});

test("case switch is the only selection change that invalidates replay data", () => {
  assert.equal(isReplayCaseSwitch("1", "1"), false);
  assert.equal(isReplayCaseSwitch("1", "6388"), true);
});

test("one replay delta updates both UCs, events, pump tracks, and only due predictions", () => {
  const buffers = {
    uc04View: {
      case_id: "1", as_of_s: 4, signals: [{ signal: "HR", track_name: "Solar8000/HR", observations: [{ timestamp: 2, value: 70 }] }],
      abp_waveform: { start_time_s: 2, end_time_s: 4, sample_rate_hz: 2, timestamps: [2, 4], values: [90, 92] },
      events: [], predictions: { predictions: [{ model_id: "hpi", prediction_time: 3, horizon_minutes_or_null: 5, raw_output: 0.1 }] },
    },
    uc05View: {
      case_id: "1", as_of_s: 4, signals: [{ signal: "ETCO2", track_name: "Primus/ETCO2", observations: [{ timestamp: 2, value: 35 }] }],
      waveforms: { ppg: { start_time_s: 2, end_time_s: 4, sample_rate_hz: 2, timestamps: [2, 4], values: [0.3, null], is_missing: [false, true] } },
      recorded_events: [], derived_events: [], predictions: { predictions: [] },
    },
    medicationTracks: [], trackMetadata: [], availableTracks: [],
  };
  const frame = {
    case_id: "1", from_s: 4, as_of_s: 6,
    numeric_tracks: [
      { track_name: "Solar8000/HR", unit: "bpm", source: "monitor", observations: [{ timestamp: 5, value: 72, unit: "bpm" }], module_aliases: ["uc04:HR"] },
      { track_name: "Primus/ETCO2", unit: "mmHg", source: "machine", observations: [{ timestamp: 5, value: 36, unit: "mmHg" }], module_aliases: ["uc05:ETCO2"] },
    ],
    waveforms: {
      abp: { start_time_s: 4, end_time_s: 6, sample_rate_hz: 2, timestamps: [5, 6], values: [95, 96] },
      pleth: { start_time_s: 4, end_time_s: 6, sample_rate_hz: 2, timestamps: [5, 6], values: [0.4, null], is_missing: [false, true] },
    },
    recorded_events: [{ id: "e6", timestamp: 6, available_at_s: 6, description: "observed" }],
    derived_events: [{ id: "future-derived", timestamp: 5, end_time_s: 7, available_at_s: 7, description: "future" }],
    medication_tracks: [{ track_name: "Orchestra/Rate", observations: [{ timestamp: 5, value: 2 }, { timestamp: 7, value: 4 }] }],
    predictions: {
      uc04: { predictions: [{ model_id: "hpi", prediction_time: 5, horizon_minutes_or_null: 5, raw_output: 0.2 }, { model_id: "hpi", prediction_time: 7, horizon_minutes_or_null: 5, raw_output: 0.9 }] },
      uc05: { predictions: [{ model_id: "resp", prediction_time: 6, horizon_minutes_or_null: 5, raw_output: 0.3 }] },
    },
  };

  const merged = mergeVitalDbReplayDelta(buffers, frame);
  assert.deepEqual(merged.uc04View.signals[0].observations.map((item) => item.timestamp), [2, 5]);
  assert.deepEqual(merged.uc04View.abp_waveform.timestamps, [2, 4, 5, 6]);
  assert.deepEqual(merged.uc04View.predictions.predictions.map((item) => item.prediction_time), [3, 5]);
  assert.equal(merged.uc04View.events[0].id, "e6");
  assert.deepEqual(merged.uc05View.signals[0].observations.map((item) => item.timestamp), [2, 5]);
  assert.deepEqual(merged.uc05View.waveforms.ppg.timestamps, [2, 4, 5, 6]);
  assert.equal(merged.uc05View.derived_events.length, 0);
  assert.deepEqual(merged.uc05View.predictions.predictions.map((item) => item.prediction_time), [6]);
  assert.deepEqual(merged.medicationTracks[0].observations.map((item) => item.timestamp), [5]);

  const backwardUC04 = filterUC04ViewAsOf(merged.uc04View, 4);
  const backwardUC05 = filterUC05ViewAsOf(merged.uc05View, 4);
  assert.deepEqual(backwardUC04.predictions.predictions.map((item) => item.prediction_time), [3]);
  assert.deepEqual(backwardUC04.abp_waveform.timestamps, [2, 4]);
  assert.deepEqual(backwardUC05.waveforms.ppg.timestamps, [2, 4]);
});

test("backward replay reconstruction clears future prediction-window evidence", () => {
  const uc04 = filterUC04ViewAsOf({
    as_of_s: 6,
    predictions: {
      cache_status: "READY",
      predictions: [
        { prediction_time: 3, input_window_start: 0, input_window_end: 3 },
        { prediction_time: 5, input_window_start: 2, input_window_end: 5 },
      ],
      window_eligibility: "ELIGIBLE",
      window_status: "ELIGIBLE",
      window_reason: null,
      window_prediction_time_s: 5,
      window_start_s: 2,
      window_end_s: 5,
    },
    prediction_cache: {
      cache_status: "READY",
      window_eligibility: "ELIGIBLE",
      window_status: "ELIGIBLE",
      window_reason: null,
      window_prediction_time_s: 5,
      window_start_s: 2,
      window_end_s: 5,
    },
  }, 4);
  assert.equal(uc04.predictions.window_prediction_time_s, 3);
  assert.equal(uc04.predictions.window_start_s, 0);
  assert.equal(uc04.predictions.window_end_s, 3);
  assert.equal(uc04.predictions.window_eligibility, "ELIGIBLE");
  assert.equal(uc04.predictions.window_reason, null);
  assert.equal(uc04.prediction_cache.window_prediction_time_s, 3);
  assert.equal(uc04.prediction_cache.window_end_s, 3);

  const uc05 = filterUC05ViewAsOf({
    as_of_s: 6,
    waveforms: {},
    predictions: {
      cache_status: "READY",
      predictions: [{ prediction_time: 5, input_window_start: 2, input_window_end: 5 }],
      window_eligibility: "ABSTAINED",
      window_status: "ABSTAINED",
      window_reason: "future abstention",
      window_prediction_time_s: 5,
      window_start_s: 2,
      window_end_s: 5,
    },
    prediction_cache: {
      cache_status: "READY",
      window_eligibility: "ABSTAINED",
      window_status: "ABSTAINED",
      window_reason: "future abstention",
      window_prediction_time_s: 5,
      window_start_s: 2,
      window_end_s: 5,
    },
  }, 4);
  assert.equal(uc05.predictions.window_eligibility, "NOT_EVALUATED");
  assert.equal(uc05.predictions.window_status, "NOT_EVALUATED");
  assert.equal(uc05.predictions.window_reason, "No persisted model window is due at this replay time.");
  assert.equal(uc05.predictions.window_prediction_time_s, null);
  assert.equal(uc05.prediction_cache.window_prediction_time_s, null);
});

test("latest explicit abstention wins over an earlier eligible row and counts stay as-of", () => {
  const makeEnvelope = (modelId) => ({
    cache_status: "READY",
    prediction_count: 1,
    inference_window_count: 2,
    abstained_window_count: 1,
    predictions: [
      { model_id: modelId, prediction_time: 3, input_window_start: 0, input_window_end: 3 },
    ],
    window_eligibility: "ABSTAINED",
    window_status: "ABSTAINED",
    window_reason: "INPUT_NOT_ELIGIBLE: later window was explicitly abstained",
    window_prediction_time_s: 5,
    window_start_s: 2,
    window_end_s: 5,
  });

  for (const [name, filter] of [["uc04", filterUC04ViewAsOf], ["uc05", filterUC05ViewAsOf]]) {
    const view = {
      as_of_s: 6,
      ...(name === "uc05" ? { waveforms: {} } : {}),
      predictions: makeEnvelope(name),
      prediction_cache: {
        cache_status: "READY",
        prediction_count: 1,
        inference_window_count: 2,
        abstained_window_count: 1,
        window_eligibility: "ABSTAINED",
        window_status: "ABSTAINED",
        window_reason: "INPUT_NOT_ELIGIBLE: later window was explicitly abstained",
        window_prediction_time_s: 5,
        window_start_s: 2,
        window_end_s: 5,
      },
    };

    const atEarlyCursor = filter(view, 4);
    assert.equal(atEarlyCursor.predictions.window_eligibility, "ELIGIBLE", `${name} earlier row remains eligible`);
    assert.equal(atEarlyCursor.predictions.window_prediction_time_s, 3);
    assert.equal(atEarlyCursor.predictions.prediction_count, 1);
    assert.equal(atEarlyCursor.predictions.inference_window_count, 1);
    assert.equal(atEarlyCursor.predictions.abstained_window_count, 0);
    assert.equal(atEarlyCursor.prediction_cache.window_eligibility, "ELIGIBLE");
    assert.equal(atEarlyCursor.prediction_cache.window_prediction_time_s, 3);
    assert.equal(atEarlyCursor.prediction_cache.prediction_count, 1);
    assert.equal(atEarlyCursor.prediction_cache.inference_window_count, 1);
    assert.equal(atEarlyCursor.prediction_cache.abstained_window_count, 0);

    const atAbstention = filter(view, 5);
    assert.equal(atAbstention.predictions.window_eligibility, "ABSTAINED", `${name} abstention is the latest due state`);
    assert.equal(atAbstention.predictions.window_status, "ABSTAINED");
    assert.equal(atAbstention.predictions.window_prediction_time_s, 5);
    assert.equal(atAbstention.predictions.window_reason, "INPUT_NOT_ELIGIBLE: later window was explicitly abstained");
    assert.equal(atAbstention.predictions.prediction_count, 1);
    assert.equal(atAbstention.predictions.inference_window_count, 2);
    assert.equal(atAbstention.predictions.abstained_window_count, 1);
    assert.equal(atAbstention.prediction_cache.window_eligibility, "ABSTAINED");
    assert.equal(atAbstention.prediction_cache.window_prediction_time_s, 5);
    assert.equal(atAbstention.prediction_cache.inference_window_count, 2);
    assert.equal(atAbstention.prediction_cache.abstained_window_count, 1);
  }
});


test("recorded backward seek clips crossing gaps and removes future quality intervals and samples", () => {
  for (const rate of [62.5, 500]) {
    const timestamps = Array.from({ length: Math.floor(8 * rate) + 1 }, (_, index) => index / rate);
    const waveform = { case_id: "6388", track_name: rate === 62.5 ? "Primus/CO2" : "SNUADC/PLETH", start_time_s: 0, end_time_s: 8,
      sample_rate_hz: rate, unit: rate === 62.5 ? "mmHg" : "", source: "VitalDB", quality: "GOOD", timestamps,
      values: timestamps.map(time => time >= 3 && time <= 5 || time >= 7 ? null : 30),
      is_missing: timestamps.map(time => time >= 3 && time <= 5 || time >= 7),
      missing_intervals: [{ start_time_s: 3, end_time_s: 5 }, { start_time_s: 7, end_time_s: 8 }], provenance: {} };
    const before = structuredClone(waveform);
    const view = { case_id: "6388", dataset: "VitalDB", dataset_version: "1", as_of_s: 8, window_start_s: 0, window_end_s: 8,
      available_tracks: [waveform.track_name], signals: [], waveforms: { capno: waveform }, recorded_events: [], derived_events: [], predictions: [],
      model: { model_id: "test-contract", horizons_minutes: [], readiness_status: "MODEL_NOT_READY" } };
    const sought = projectUC05VitalDbView(view, 4).waveforms.capno;
    assert.equal(sought.end_time_s, 4);
    assert.equal(sought.sample_rate_hz, rate);
    assert.equal(sought.unit, waveform.unit);
    assert.deepEqual(sought.missing_intervals, [{ start_time_s: 3, end_time_s: 4 }]);
    assert.ok(sought.timestamps.every(timestamp => timestamp <= 4));
    assert.ok(sought.values.filter((_, index) => sought.timestamps[index] >= 3).every(value => value === null));
    const samples = toRecordedWaveformSamples(sought);
    assert.ok(samples.every(sample => sample.eventTime <= 4000 && sample.receivedTime <= 4000));
    assert.ok(samples.filter(sample => sample.eventTime >= 3000).every(sample => sample.value === null));
    assert.deepEqual(waveform, before, "raw recording must remain immutable during replay seek");
    const resumed = projectUC05VitalDbView(view, 8).waveforms.capno;
    assert.deepEqual(resumed.timestamps, before.timestamps);
    assert.deepEqual(resumed.missing_intervals, before.missing_intervals);
  }
});
