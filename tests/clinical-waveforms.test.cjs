const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
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

const nativeResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveSafeAnesAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(__dirname, "..", "src", request.slice(2))
    : request;
  return nativeResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

const generator = require(path.join(__dirname, "..", "src", "simulation", "generators", "clinicalWaveforms.ts"));
const engine = require(path.join(__dirname, "..", "src", "components", "clinical-waveforms", "waveformEngine.ts"));
const timeScale = require(path.join(__dirname, "..", "src", "components", "modules", "uc04", "visualization", "timeScale.ts"));
const simulation = require(path.join(__dirname, "..", "src", "simulation", "index.ts"));
const { getUC04SimulationViewModel } = require(path.join(__dirname, "..", "src", "adapters", "uc04Adapter.ts"));
const { getUC05SimulationViewModel } = require(path.join(__dirname, "..", "src", "adapters", "uc05Adapter.ts"));
const uc05Messages = {
  en: require(path.join(__dirname, "..", "src", "messages", "en", "uc05.json")),
  vi: require(path.join(__dirname, "..", "src", "messages", "vi", "uc05.json")),
};

const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;

function point(eventTime, value = eventTime) {
  return {
    eventTime,
    receivedTime: eventTime,
    sourceDevice: "test-monitor",
    value,
    quality: "GOOD",
    provenance: "DERIVED",
  };
}

test("sampleClinicalWaveform is deterministic and keeps the no-breath demo interval distinct from dropout", () => {
  const first = generator.sampleClinicalWaveform(20261007, "ABP", at(10, 31, 12));
  const repeated = generator.sampleClinicalWaveform(20261007, "ABP", at(10, 31, 12));

  assert.equal(first, repeated);
  assert.ok(Number.isFinite(first));
  assert.equal(generator.sampleClinicalWaveform(20261007, "CAPNOGRAM", at(10, 52, 30)), 0);
  assert.ok(generator.sampleClinicalWaveform(20261007, "CAPNOGRAM", at(10, 51, 30)) > 0);
});

test("waveform cycles integrate changing HR and RR continuously across scenario knots", () => {
  const transitionTime = at(10, 50);
  const before = generator.getWaveformCycleCount("CAPNOGRAM", transitionTime - 10);
  const after = generator.getWaveformCycleCount("CAPNOGRAM", transitionTime + 10);

  assert.ok(after > before);
  assert.ok(after - before < 0.01);
  assert.ok(generator.getWaveformCycleCount("PLETH", transitionTime + 10) >
    generator.getWaveformCycleCount("PLETH", transitionTime - 10));
});

test("capnogram has an inspiratory baseline, quick expiratory rise, and gently rising plateau", () => {
  const periodMs = minute / 14;
  const sample = (phase) => generator.sampleClinicalWaveform(20261007, "CAPNOGRAM", periodMs * phase);
  const baseline = sample(0.1);
  const plateauStart = sample(0.34);
  const plateauEnd = sample(0.72);

  assert.ok(baseline < 2, `expected inspiratory baseline, got ${baseline} mmHg`);
  assert.ok(plateauStart > 20);
  assert.ok(plateauEnd - plateauStart > 4, `expected readable plateau slope, got ${plateauStart} to ${plateauEnd} mmHg`);
});

test("pleth has a rounded pulse with a visible dicrotic shoulder", () => {
  const periodMs = minute / 78;
  const sample = (phase) => generator.sampleClinicalWaveform(20261007, "PLETH", periodMs * phase);
  const notch = sample(0.66);
  const rebound = sample(0.72);

  assert.ok(sample(0.2) > 0.6);
  assert.ok(rebound > notch + 0.035, `expected a dicrotic rebound: notch=${notch}, rebound=${rebound}`);
});

test("arterial pressure has a decelerating diastolic decay", () => {
  const periodMs = minute / 78;
  const meanAt = (phase) => Array.from({ length: 20 }, (_, index) =>
    generator.sampleClinicalWaveform(20261007, "ABP", (index + 2 + phase) * periodMs)
  ).reduce((sum, value) => sum + value, 0) / 20;
  const earlyDrop = meanAt(0.3) - meanAt(0.42);
  const lateDrop = meanAt(0.42) - meanAt(0.54);

  assert.ok(earlyDrop > lateDrop * 1.1, `expected exponential decay, got ${earlyDrop} then ${lateDrop} mmHg`);
});

test("presentation time interpolates only across known simulation time and snaps on pause or seek", () => {
  const transition = engine.createWaveformPresentationTransition(1_000, 4_000, 60, "PLAYING", 2_000);

  assert.equal(engine.waveformPresentationTimeAt(transition, 2_000), 1_000);
  assert.equal(engine.waveformPresentationTimeAt(transition, 2_025), 2_500);
  assert.equal(engine.waveformPresentationTimeAt(transition, 2_050), 4_000);
  assert.equal(engine.waveformPresentationTimeAt(
    engine.createWaveformPresentationTransition(4_000, 4_500, 60, "PAUSED", 3_000), 3_010
  ), 4_500);
  assert.equal(engine.waveformPresentationTimeAt(
    engine.createWaveformPresentationTransition(4_500, 1_000, 60, "PLAYING", 4_000), 4_010
  ), 1_000);
});

test("ABP cursor selection maps to the visible waveform window, including midnight", () => {
  assert.equal(timeScale.waveformTimeAtRatio(0, "07:16:51", 8_000), "07:16:43");
  assert.equal(timeScale.waveformTimeAtRatio(0.5, "07:16:51", 8_000), "07:16:47");
  assert.equal(timeScale.waveformTimeAtRatio(1, "07:16:51", 8_000), "07:16:51");
  assert.equal(timeScale.waveformTimeAtRatio(0, "00:00:02", 8_000), "23:59:54");
});

test("waveform startup label has an explicit EN and VI translation", () => {
  assert.equal(typeof uc05Messages.en.waveforms.awaitingSamples, "string");
  assert.notEqual(uc05Messages.en.waveforms.awaitingSamples, "");
  assert.equal(typeof uc05Messages.vi.waveforms.awaitingSamples, "string");
  assert.notEqual(uc05Messages.vi.waveforms.awaitingSamples, "");
});

test("waveform axis preserves the full pleth unit instead of clipping it", () => {
  const axisSource = fs.readFileSync(path.join(__dirname, "..", "src", "components", "modules", "uc05", "visualization", "WaveformAxis.tsx"), "utf8");
  assert.match(axisSource, /w-\[58px\]/);
  assert.match(axisSource, /title=\{unit\}/);
  assert.match(axisSource, /break-words/);
});

test("WaveformBuffer keeps samples ordered, replaces duplicate timestamps, and stays bounded", () => {
  const buffer = new engine.WaveformBuffer(3);
  buffer.insert(point(20));
  buffer.insert(point(0));
  buffer.insert(point(10));
  buffer.insert(point(20, 999));

  assert.deepEqual(buffer.readWindow(0, 20).map((sample) => sample.eventTime), [0, 10, 20]);
  assert.equal(buffer.readWindow(0, 20)[2].value, 999);
  buffer.insert(point(30));
  assert.deepEqual(buffer.readWindow(0, 30).map((sample) => sample.eventTime), [10, 20, 30]);
  buffer.clear();
  assert.deepEqual(buffer.readWindow(0, 30), []);
});

test("time and value transforms map explicit clinical ranges to plot edges", () => {
  assert.equal(engine.timeToX(2_000, 2_000, 10_000, 800), 0);
  assert.equal(engine.timeToX(6_000, 2_000, 10_000, 800), 400);
  assert.equal(engine.timeToX(10_000, 2_000, 10_000, 800), 800);
  assert.equal(engine.valueToY(0, 0, 60, 120), 120);
  assert.equal(engine.valueToY(30, 0, 60, 120), 60);
  assert.equal(engine.valueToY(60, 0, 60, 120), 0);
});

test("WaveformStream never returns samples before their event and receive times", () => {
  const stream = new engine.WaveformStream({
    seed: 20261007,
    signal: "CAPNOGRAM",
    sourceDevice: "capnograph-or2",
    qualitySignal: "ETCO2",
    sampleRateHz: 25,
    windowMs: 8_000,
    receiptDelayMs: 100,
  });
  const simulationTime = 10_000;
  const window = stream.updateTo(simulationTime, []);

  assert.ok(window.samples.length > 2);
  assert.ok(window.samples.every((sample) => sample.eventTime <= simulationTime));
  assert.ok(window.samples.every((sample) => sample.receivedTime <= simulationTime));
  assert.ok(window.samples.every((sample) => sample.eventTime >= window.startTime));
});

test("technical dropout creates a gap while the good-quality no-breath interval remains a real flat trace", () => {
  const stream = new engine.WaveformStream({
    seed: 20261007,
    signal: "CAPNOGRAM",
    sourceDevice: "capnograph-or2",
    qualitySignal: "ETCO2",
    sampleRateHz: 25,
    windowMs: 8_000,
    receiptDelayMs: 100,
  });
  const dropoutStart = at(10, 2);
  const duringDropout = stream.updateTo(dropoutStart + 5_000, [{
    id: "quality-dropout",
    signal: "ETCO2",
    sourceDevice: "capnograph-or2",
    eventTime: dropoutStart,
    validUntilTime: dropoutStart + 12_000,
    status: "TECHNICAL_DROPOUT",
  }]);
  const dropoutSamples = duringDropout.samples.filter((sample) => sample.eventTime >= dropoutStart);
  assert.ok(dropoutSamples.length > 0);
  assert.ok(dropoutSamples.every((sample) => sample.value === null));
  assert.ok(dropoutSamples.every((sample) => sample.quality === "TECHNICAL_DROPOUT"));

  const noBreath = stream.updateTo(at(10, 52, 30), []);
  const flatSamples = noBreath.samples.filter((sample) => sample.eventTime >= at(10, 52) && sample.eventTime < at(10, 52, 30));
  assert.ok(flatSamples.length > 2);
  assert.ok(flatSamples.every((sample) => sample.quality === "GOOD" && sample.value === 0));
});

test("backward seek discards later samples and deterministically reconstructs the selected window", () => {
  const options = {
    seed: 20261007,
    signal: "ABP",
    sourceDevice: "arterial-line-or2",
    qualitySignal: "MAP",
    sampleRateHz: 25,
    windowMs: 8_000,
    receiptDelayMs: 100,
  };
  const stream = new engine.WaveformStream(options);
  stream.updateTo(30_000, []);
  const sought = stream.updateTo(4_000, []);
  const fresh = new engine.WaveformStream(options).updateTo(4_000, []);

  assert.ok(sought.samples.every((sample) => sample.eventTime <= 3_900));
  assert.ok(sought.samples.every((sample) => sample.eventTime < 30_000));
  assert.deepEqual(sought.samples, fresh.samples);
});

test("trace projection splits at missing and invalid samples and excludes future data", () => {
  const projected = engine.projectTraceSegments([
    point(0, 10),
    point(1_000, 20),
    { ...point(2_000, 0), quality: "TECHNICAL_DROPOUT", value: null },
    point(3_000, 30),
    { ...point(4_000, 100), receivedTime: 5_100 },
  ], {
    startTime: 0,
    endTime: 5_000,
    simulationTime: 5_000,
    width: 500,
    height: 100,
    yMin: 0,
    yMax: 50,
  });

  assert.equal(projected.length, 2);
  assert.equal(projected[0].quality, "GOOD");
  assert.deepEqual(projected[0].points, [{ x: 0, y: 80 }, { x: 100, y: 60 }]);
  assert.deepEqual(projected[1].points, [{ x: 300, y: 40 }]);
});

test("dense trace projection stays within a pixel budget while preserving extrema and signal gaps", () => {
  const dense = Array.from({ length: 2_000 }, (_, index) => point(index * 5, 10));
  dense[611] = point(611 * 5, 60);
  dense[1_304] = { ...point(1_304 * 5, 0), quality: "TECHNICAL_DROPOUT", value: null };
  dense[1_305] = point(1_305 * 5, 0);
  dense.push(point(10_005, 30));

  const projected = engine.projectTraceSegments(dense, {
    startTime: 0,
    endTime: 10_000,
    simulationTime: 10_000,
    width: 100,
    height: 60,
    yMin: 0,
    yMax: 60,
    maxPointsPerSegment: 200,
  });

  assert.equal(projected.length, 2, "a missing sample must keep the trace visibly split");
  assert.ok(projected.every((segment) => segment.points.length <= 200));
  assert.ok(projected[0].points.some((sample) => sample.y === 0), "the systolic-sized peak must survive display reduction");
  assert.ok(projected[1].points.some((sample) => sample.y === 60), "the post-gap trough must survive display reduction");

  const swept = engine.projectSweepTraceSegments(dense, {
    startTime: 0,
    endTime: 10_000,
    simulationTime: 10_000,
    width: 100,
    height: 60,
    yMin: 0,
    yMax: 60,
    maxGapMs: 8,
    windowMs: 10_000,
    eraseGapMs: 80,
    maxPointsPerSegment: 200,
  });
  assert.equal(swept.length, 2, "the erase gap and recorded dropout must both break the sweep path");
  assert.ok(swept.every((segment) => segment.points.length <= 200));
  assert.ok(swept.every((segment) => !segment.points.some((sample) => sample.y === 30)), "future points must remain hidden");
});

test("paint scheduler coalesces updates and cancels a queued frame on cleanup", () => {
  let nextHandle = 1;
  const queued = new Map();
  const canceled = [];
  let paintCount = 0;
  const scheduler = engine.createPaintScheduler(
    (callback) => {
      const handle = nextHandle++;
      queued.set(handle, callback);
      return handle;
    },
    (handle) => {
      canceled.push(handle);
      queued.delete(handle);
    },
    () => { paintCount += 1; }
  );

  scheduler.schedule();
  scheduler.schedule();
  assert.equal(queued.size, 1);
  const [handle, callback] = [...queued.entries()][0];
  queued.delete(handle);
  callback();
  assert.equal(paintCount, 1);
  scheduler.schedule();
  scheduler.dispose();
  assert.equal(queued.size, 0);
  assert.deepEqual(canceled, [2]);
});

test("canonical snapshots reveal waveform samples only after each sample has been received", () => {
  const replay = new simulation.SimulationEngine(simulation.createFullCase());
  const atCaseStart = replay.seek(0).snapshot;
  const firstSegment = atCaseStart.waveforms.find((waveform) => waveform.signal === "CAPNOGRAM" && waveform.eventTime === 0);
  assert.ok(firstSegment);
  assert.equal(firstSegment.samples.length, 1);

  const firstReceived = replay.seek(100).snapshot;
  const firstReceivedSegment = firstReceived.waveforms.find((waveform) => waveform.id === firstSegment.id);
  assert.ok(firstReceivedSegment);
  assert.equal(firstReceivedSegment.samples.length, 11);

  const later = replay.seek(420).snapshot;
  const laterSegment = later.waveforms.find((waveform) => waveform.id === firstSegment.id);
  assert.ok(laterSegment);
  assert.equal(laterSegment.samples.length, 43);
  assert.equal(laterSegment.samples.length, Math.floor((later.simulationTime - laterSegment.eventTime) /
    (1_000 / generator.CLINICAL_WAVEFORM_SAMPLE_RATE_HZ)) + 1);
});

test("UC05 renderer source distinguishes technical dropout from a good-quality no-breath trace", () => {
  const replay = new simulation.SimulationEngine(simulation.createFullCase());
  const dropoutTime = at(10, 2, 5);
  const dropoutView = getUC05SimulationViewModel(replay.seek(dropoutTime).snapshot);
  const dropoutStream = new engine.WaveformStream(dropoutView.capnogramWaveform);
  const dropoutWindow = dropoutStream.updateTo(dropoutView.capnogramWaveform.simulationTimeMs,
    dropoutView.capnogramWaveform.qualityStates);
  const missing = dropoutWindow.samples.filter((sample) => sample.eventTime >= at(10, 2));

  assert.equal(dropoutView.signalQuality.capnogram, "unavailable");
  assert.ok(missing.length > 0 && missing.every((sample) => sample.value === null));
  assert.ok(dropoutWindow.samples.some((sample) => sample.value !== null && sample.eventTime < at(10, 2)));

  const noBreathTime = at(10, 52, 10);
  const noBreathView = getUC05SimulationViewModel(replay.seek(noBreathTime).snapshot);
  const noBreathWindow = new engine.WaveformStream(noBreathView.capnogramWaveform)
    .updateTo(noBreathTime, noBreathView.capnogramWaveform.qualityStates);
  assert.equal(noBreathView.signalQuality.capnogram, "good");
  assert.ok(noBreathWindow.samples.length > 2);
  assert.ok(noBreathWindow.samples.every((sample) => sample.quality === "GOOD" && sample.value === 0));
});

test("UC04 waveform source follows the shared simulation time and arterial quality history", () => {
  const replay = new simulation.SimulationEngine(simulation.createFullCase());
  const target = at(9, 42, 5);
  const view = getUC04SimulationViewModel(replay.seek(target).snapshot);

  assert.equal(view.abpWaveformSource.signal, "ABP");
  assert.equal(view.abpWaveformSource.simulationTimeMs, target);
  assert.equal(view.abpWaveformSource.qualitySignal, "MAP");
  const activeArtifact = view.abpWaveformSource.qualityStates.find((state) =>
    state.signal === "MAP" && state.status === "INVALIDATED_ARTIFACT" && state.eventTime <= target &&
    (state.validUntilTime === undefined || state.validUntilTime > target)
  );
  assert.ok(activeArtifact);
  const abpWindow = new engine.WaveformStream(view.abpWaveformSource)
    .updateTo(target, view.abpWaveformSource.qualityStates);
  assert.ok(abpWindow.samples.some((sample) => sample.eventTime >= at(9, 42) && sample.value === null));
});


// Projection uses acquisition timestamps, never a sample index or render-frame
// cadence. Both real track rates must agree at shared times and native units.
for (const sampleRateHz of [62.5, 500]) {
  test(`${sampleRateHz} Hz recorded samples retain time/amplitude mapping at fixed width`, () => {
    const intervalMs = 1000 / sampleRateHz;
    const samples = Array.from({ length: Math.floor(8000 / intervalMs) + 1 }, (_, index) =>
      ({ ...point(index * intervalMs, index * intervalMs / 8000 * 60), provenance: "DIRECT" }));
    const before = structuredClone(samples);
    const options = { startTime: 0, endTime: 8000, simulationTime: 8000, width: 800, height: 120, yMin: 0, yMax: 60 };
    const segments = engine.projectTraceSegments(samples, options);
    assert.equal(segments.length, 1);
    for (const timestamp of [0, 2000, 4000, 6000, 8000]) {
      const index = timestamp / intervalMs;
      assert.equal(segments[0].points[index].x, timestamp / 10);
      assert.equal(segments[0].points[index].y, 120 - timestamp / 8000 * 120);
    }
    assert.deepEqual(engine.resolveWaveformDisplayRange(samples.map(sample => sample.value), 0, 60), { min: 0, max: 60 });
    assert.deepEqual(samples, before, "display projection must not alter recorded timestamps/values/quality");
  });
}

test("62.5 and 500 Hz dense projection budgets preserve first/last and min/max within each segment", () => {
  for (const rate of [62.5, 500]) {
    const interval = 1000 / rate;
    const samples = Array.from({ length: Math.floor(8000 / interval) + 1 }, (_, index) => point(index * interval, 30));
    samples[1].value = 60;
    samples[2].value = 0;
    const options = { startTime: 0, endTime: 8000, simulationTime: 8000, width: 80, height: 120, yMin: 0, yMax: 60, maxPointsPerSegment: 160 };
    const segment = engine.projectTraceSegments(samples, options)[0];
    assert.ok(segment.points.length <= 160);
    assert.deepEqual(segment.points[0], { x: 0, y: 60 });
    assert.deepEqual(segment.points.at(-1), { x: 80, y: 60 });
    assert.ok(segment.points.some(sample => sample.y === 0), "peak survives downsampling");
    assert.ok(segment.points.some(sample => sample.y === 120), "trough survives downsampling");
  }
});

for (const rate of [62.5, 500]) {
  test(`${rate} Hz sweep keeps the 80ms erase bar blank and splits wraparound`, () => {
    const samples = Array.from({ length: 24 * rate + 1 }, (_, index) => point(index * 1000 / rate, 30));
    const options = { startTime: 4000, endTime: 12000, simulationTime: 12000, windowMs: 8000, eraseGapMs: 80, width: 800, height: 120, yMin: 0, yMax: 60, maxGapMs: 1000 / rate * 1.01, maxPointsPerSegment: 1600 };
    const segments = engine.projectSweepTraceSegments(samples, options);
    assert.equal(segments.length, 2, "each sweep side is an independent path, never a joined diagonal");
    for (const segment of segments) {
      assert.ok(segment.points.length <= 1600);
      for (let index = 0; index < segment.points.length; index++) {
        const current = segment.points[index];
        assert.ok(current.x < 400 || current.x >= 408, "no point in 80ms erase gap [400,408)");
        if (index) assert.ok(current.x >= segment.points[index - 1].x, "no sweep-wrap join inside a path");
        assert.equal(current.y, 60);
      }
    }
    assert.ok(segments.some(segment => segment.points.every(sample => sample.x >= 408)));
    assert.ok(segments.some(segment => segment.points.every(sample => sample.x < 400)));
    const gapCrossesRightEdge = engine.projectSweepTraceSegments(samples, { ...options, simulationTime: 15990, endTime: 15990 });
    assert.ok(gapCrossesRightEdge.length > 0);
    for (const segment of gapCrossesRightEdge) for (const sample of segment.points) {
      assert.ok(sample.x >= 7 && sample.x < 799, "wrapped erase gap [799,800] + [0,7) is blank");
    }
  });
}

for (const invalid of [
  { label: "technical dropout", quality: "TECHNICAL_DROPOUT", value: null },
  { label: "invalidated artifact", quality: "INVALIDATED_ARTIFACT", value: 60 },
  { label: "nonfinite NaN", quality: "GOOD", value: NaN },
  { label: "nonfinite Infinity", quality: "GOOD", value: Infinity },
  { label: "missing value", quality: "GOOD", value: null },
]) {
  test(`${invalid.label} breaks flat trace in rolling and sweep rendering`, () => {
    const samples = Array.from({ length: 5 }, (_, index) => point(1000 + index * 1000, 0));
    samples[2] = { ...samples[2], quality: invalid.quality, value: invalid.value };
    const options = { startTime: 0, endTime: 6000, simulationTime: 6000, width: 600, height: 120, yMin: 0, yMax: 60, maxGapMs: 1001 };
    for (const segments of [engine.projectTraceSegments(samples, options), engine.projectSweepTraceSegments(samples, { ...options, windowMs: 8000, eraseGapMs: 80 })]) {
      assert.deepEqual(segments.map(segment => segment.points.length), [2, 2]);
      assert.ok(segments.every(segment => segment.quality === "GOOD" && segment.points.every(sample => sample.y === 120)));
    }
  });
}

test("GOOD physiologic zero remains one connected flat trace in both projections", () => {
  const samples = Array.from({ length: 5 }, (_, index) => point(1000 + index * 1000, 0));
  const options = { startTime: 0, endTime: 6000, simulationTime: 6000, width: 600, height: 120, yMin: 0, yMax: 60, maxGapMs: 1001 };
  for (const segments of [engine.projectTraceSegments(samples, options), engine.projectSweepTraceSegments(samples, { ...options, windowMs: 8000, eraseGapMs: 80 })]) {
    assert.equal(segments.length, 1);
    assert.equal(segments[0].points.length, 5);
    assert.ok(segments[0].points.every(sample => sample.y === 120));
  }
});

test("backward synthetic seek removes future waveform and not-yet-recorded quality evidence", () => {
  const options = { seed: 20261007, signal: "CAPNOGRAM", sourceDevice: "capno", qualitySignal: "ETCO2", sampleRateHz: 500, windowMs: 8000, receiptDelayMs: 0 };
  const quality = [
    { id: "past-artifact", signal: "ETCO2", sourceDevice: "capno", eventTime: 1000, recordedTime: 1500, validUntilTime: 2000, status: "INVALIDATED_ARTIFACT" },
    { id: "future-dropout", signal: "ETCO2", sourceDevice: "capno", eventTime: 11000, validUntilTime: 12000, status: "TECHNICAL_DROPOUT" },
    { id: "late-documentation", signal: "ETCO2", sourceDevice: "capno", eventTime: 3000, recordedTime: 25000, validUntilTime: 6000, status: "TECHNICAL_DROPOUT" },
  ];
  const stream = new engine.WaveformStream(options);
  stream.updateTo(30000, quality);
  const sought = stream.updateTo(5000, quality);
  assert.deepEqual(sought, new engine.WaveformStream(options).updateTo(5000, quality.slice(0, 1)));
  assert.ok(sought.samples.every(sample => sample.eventTime <= 5000 && sample.receivedTime <= 5000));
  assert.ok(sought.samples.filter(sample => sample.eventTime >= 1000 && sample.eventTime < 2000).every(sample => sample.quality === "INVALIDATED_ARTIFACT" && sample.value === null));
  assert.ok(sought.samples.filter(sample => sample.eventTime >= 3000).every(sample => sample.quality === "GOOD" && sample.value !== null));
});
