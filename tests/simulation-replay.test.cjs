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

const { createFullCase, formatCaseTime, SimulationClock, SimulationEngine, SIMULATION_SPEEDS } = require(
  path.join(__dirname, "..", "src", "simulation", "index.ts")
);

test("clock supports play, pause, resume, speeds, completion, seek, and reset", () => {
  const clock = new SimulationClock({ durationMs: 300_000 });

  assert.equal(clock.status, "STOPPED");
  assert.equal(clock.speed, 1);
  for (const speed of SIMULATION_SPEEDS) {
    clock.setSpeed(speed);
    assert.equal(clock.speed, speed);
  }
  clock.setSpeed(1);
  clock.play();
  clock.advanceRealTime(1_000);
  assert.equal(clock.simulationTime, 1_000);

  clock.pause();
  clock.advanceRealTime(1_000);
  assert.equal(clock.status, "PAUSED");
  assert.equal(clock.simulationTime, 1_000);

  clock.setSpeed(30);
  clock.resume();
  clock.advanceRealTime(1_000);
  assert.equal(clock.simulationTime, 31_000);
  clock.seek(295_000);
  clock.setSpeed(60);
  clock.advanceRealTime(1_000);
  assert.equal(clock.simulationTime, 300_000);
  assert.equal(clock.status, "COMPLETED");

  clock.reset();
  assert.equal(clock.simulationTime, 0);
  assert.equal(clock.status, "STOPPED");
  assert.throws(() => clock.setSpeed(3), RangeError);
});

test("five simulated hours advance at 30x and 60x without wall-clock waits", () => {
  const duration = 5 * 60 * 60 * 1_000;
  assert.equal(duration / 30 / 1_000, 600);
  assert.equal(duration / 60 / 1_000, 300);

  const clock = new SimulationClock({ durationMs: duration, speed: 30 });
  clock.play();
  clock.advanceRealTime(10 * 60 * 1_000);
  assert.equal(clock.simulationTime, duration);
  assert.equal(clock.status, "COMPLETED");
});

test("fractional real-time slices keep the simulated cursor on integer milliseconds", () => {
  const clock = new SimulationClock({ durationMs: 5_000, speed: 30 });
  clock.play();
  clock.advanceRealTime(1_000 / 30);
  assert.equal(clock.simulationTime, 1_000);

  const engine = new SimulationEngine(createFullCase());
  engine.setSpeed(30);
  engine.play();
  const frame = engine.advanceRealTime(1_000 / 30);
  assert.equal(frame.simulationTime, 1_000);
});

test("event pipeline runs in order and records an audit entry per due event", () => {
  const stages = [];
  const pipeline = Object.fromEntries(
    [
      "ingestRawEvent",
      "updateCanonicalState",
      "updateQualityState",
      "runUseCaseEngines",
      "createPredictions",
      "runAlertPolicy",
      "updateEventGraphAndClaims",
    ].map((name) => [name, ({ event }) => stages.push(`${name}:${event.id}`)])
  );
  const generatedPrediction = {
    id: "pipeline-prediction",
    modelId: "test-model",
    modelVersion: "1",
    task: "synthetic test estimate",
    timestamp: 0,
    horizonMinutes: 1,
    probability: 0.5,
    confidence: 0.5,
    dataCoverage: 1,
    missingModalities: [],
  };
  pipeline.runUseCaseEngines = ({ event }) => {
    stages.push(`runUseCaseEngines:${event.id}`);
    return { rulesTriggered: ["demo-rule"] };
  };
  pipeline.createPredictions = ({ event }) => {
    stages.push(`createPredictions:${event.id}`);
    return { predictionsGenerated: [generatedPrediction] };
  };
  pipeline.runAlertPolicy = ({ event }) => {
    stages.push(`runAlertPolicy:${event.id}`);
    return {
      alertsCreated: [{
        id: "pipeline-alert",
        code: "DEMO-TEST",
        title: "Synthetic test alert",
        message: "Test only",
        severity: "INFO",
        sourceModule: "UC01",
        status: "ACTIVE",
        eventTime: 0,
        relatedEventIds: [],
        provenance: "DERIVED",
      }],
    };
  };
  const scenario = createFullCase();
  const engine = new SimulationEngine(scenario, { pipeline });
  const notifications = [];
  engine.subscribe((snapshot) => notifications.push(snapshot));

  engine.seek(0);
  const stageNames = [
    "ingestRawEvent",
    "updateCanonicalState",
    "updateQualityState",
    "runUseCaseEngines",
    "createPredictions",
    "runAlertPolicy",
    "updateEventGraphAndClaims",
  ];
  const dueAtStart = scenario.events.filter((event) => Math.max(event.eventTime, event.recordedTime ?? event.eventTime) <= 0);
  assert.deepEqual(stages, dueAtStart.flatMap((event) => stageNames.map((stage) => `${stage}:${event.id}`)));
  const audit = engine.getSnapshot().auditEntries[0];
  assert.equal(audit.eventId, "case-started");
  for (const field of ["simulationTime", "stateChanges", "rulesTriggered", "predictionsGenerated", "alertsCreated", "alertsUpdated"]) {
    assert.ok(Object.hasOwn(audit, field));
  }
  assert.deepEqual(audit.rulesTriggered, ["demo-rule"]);
  assert.deepEqual(audit.predictionsGenerated, ["pipeline-prediction"]);
  assert.deepEqual(audit.alertsCreated, ["pipeline-alert"]);
  assert.ok(notifications.some((snapshot) => snapshot.auditEntries.some((entry) => entry.eventId === "case-started")));
});

test("queue processes events by eventTime and does not expose future records", () => {
  const simulationCase = createFullCase();
  assert.equal(simulationCase.encounter.startedAt, "2026-10-07T07:15:00+07:00");
  assert.equal(formatCaseTime(simulationCase.encounter.startedAt, 0), "07:15:00");
  assert.equal(formatCaseTime(simulationCase.encounter.startedAt, simulationCase.encounter.scheduledDurationMs), "12:15:00");
  assert.equal(simulationCase.encounter.scheduledDurationMs, 5 * 60 * 60 * 1_000);
  const engine = new SimulationEngine(simulationCase);
  const atTen = engine.seek(165 * 60_000).snapshot;
  const visibleEventIds = new Set(atTen.events.map((event) => event.id));

  assert.ok(atTen.events.every((event, index, all) => index === 0 || all[index - 1].eventTime <= event.eventTime));
  assert.equal(visibleEventIds.has("episode-hemodynamic-low-map-detected"), false);
  assert.equal(visibleEventIds.has("medication-phenylephrine-rescue"), false);
  assert.equal(visibleEventIds.has("medication-ketorolac-proposed"), false);
  assert.equal(visibleEventIds.has("respiratory-no-breath-detected"), false);
  assert.equal(atTen.medications.some((item) => item.id === "med-phenylephrine"), false);
  assert.equal(atTen.predictions.some((item) => item.id === "prediction-hemodynamic-risk-1023"), false);
});

test("pipeline outputs are also gated until their simulated timestamps", () => {
  const futurePrediction = {
    id: "future-pipeline-prediction",
    modelId: "test-model",
    modelVersion: "1",
    task: "synthetic future estimate",
    timestamp: 60_000,
    horizonMinutes: 1,
    probability: 0.5,
    confidence: 0.5,
    dataCoverage: 1,
    missingModalities: [],
  };
  const futureAlert = {
    id: "future-pipeline-alert",
    code: "DEMO-FUTURE",
    title: "Future alert",
    message: "Not visible yet",
    severity: "INFO",
    sourceModule: "UC01",
    status: "ACTIVE",
    eventTime: 60_000,
    relatedEventIds: [],
    provenance: "DERIVED",
  };
  const engine = new SimulationEngine(createFullCase(), {
    pipeline: {
      createPredictions: () => ({ predictionsGenerated: [futurePrediction] }),
      runAlertPolicy: () => ({ alertsCreated: [futureAlert] }),
    },
  });

  const snapshot = engine.seek(0).snapshot;
  assert.equal(snapshot.predictions.some((item) => item.id === futurePrediction.id), false);
  assert.equal(snapshot.alerts.some((item) => item.id === futureAlert.id), false);
  assert.equal(snapshot.auditEntries[0].predictionsGenerated.includes(futurePrediction.id), false);
  assert.equal(snapshot.auditEntries[0].alertsCreated.includes(futureAlert.id), false);
});

test("seeking backwards rebuilds state and reset clears replay state", () => {
  const simulationCase = createFullCase();
  const engine = new SimulationEngine(simulationCase);
  engine.seek(simulationCase.encounter.scheduledDurationMs);
  assert.ok(engine.getSnapshot().events.some((event) => event.id === "case-completed"));

  const rewound = engine.seek(60 * 60_000).snapshot;
  const fresh = new SimulationEngine(simulationCase).seek(60 * 60_000).snapshot;
  const { status: _rewoundStatus, ...rewoundState } = rewound;
  const { status: _freshStatus, ...freshState } = fresh;
  assert.deepEqual(rewoundState, freshState);
  assert.ok(!rewound.events.some((event) => event.id === "case-completed"));

  engine.reset();
  const reset = engine.getSnapshot();
  const freshBaseline = new SimulationEngine(simulationCase).seek(0).snapshot;
  assert.equal(reset.simulationTime, 0);
  assert.deepEqual(reset.events, freshBaseline.events);
  assert.deepEqual(reset.auditEntries, freshBaseline.auditEntries);
  assert.equal(reset.status, "STOPPED");
});

test("seek-to-event and clinical jumps land on the selected event time", () => {
  const engine = new SimulationEngine(createFullCase());
  const eventSeek = engine.seekToEvent("episode-hemodynamic-low-map-detected");
  assert.ok(eventSeek.snapshot.events.some((event) => event.id === "episode-hemodynamic-low-map-detected"));
  assert.equal(eventSeek.snapshot.simulationTime, 11_760_100);

  const induction = engine.jumpTo("INDUCTION");
  assert.equal(induction.snapshot.simulationTime, 50 * 60_000);
  const hemodynamic = engine.jumpTo("HEMODYNAMIC_EVENT");
  assert.ok(hemodynamic.snapshot.events.some((event) => event.id === "episode-hemodynamic-low-map-detected"));
  const respiratory = engine.jumpTo("RESPIRATORY_EVENT");
  assert.ok(respiratory.snapshot.events.some((event) => event.id === "respiratory-no-breath-detected"));
});

test("replay from start resets the cursor and resumes at the selected speed", () => {
  const engine = new SimulationEngine(createFullCase());
  engine.setSpeed(30);
  engine.seek(60_000);
  const replay = engine.replayFromStart();

  assert.equal(replay.simulationTime, 0);
  assert.equal(replay.status, "PLAYING");
  assert.equal(replay.speed, 30);
  assert.ok(replay.events.some((event) => event.id === "case-started"));
});

test("snapshots are deterministic across direct seek and replay from start", () => {
  const simulationCase = createFullCase();
  const targetTime = 9_200_000;
  const direct = new SimulationEngine(simulationCase).seek(targetTime).snapshot;
  const engine = new SimulationEngine(simulationCase);
  engine.play();
  engine.advanceRealTime(targetTime);
  engine.pause();
  const played = engine.getSnapshot();
  const { status: _playedStatus, ...playedState } = played;
  const { status: _directStatus, ...directState } = direct;
  assert.deepEqual(playedState, directState);
});
