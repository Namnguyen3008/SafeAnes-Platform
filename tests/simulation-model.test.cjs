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
  DEFAULT_SIMULATION_SEED,
  SIMULATION_MODE,
  createFullCase,
  simulationMetadata,
  SimulationEngine,
  adaptUc01,
  adaptUc02,
  adaptUc03,
  adaptUc04,
  adaptUc05,
} = require(path.join(__dirname, "..", "src", "simulation", "index.ts"));

test("full case is reproducible for the same scenario and seed", () => {
  assert.deepEqual(createFullCase(20261007), createFullCase(20261007));
});

test("seed changes generated observations without changing case identity", () => {
  const first = createFullCase(20261007);
  const second = createFullCase(20261008);

  assert.equal(first.encounter.caseId, "SAFE-DEMO-001");
  assert.equal(first.patient.patientId, "DEMO-PATIENT-001");
  assert.notDeepEqual(first.observations, second.observations);
});

test("full case contains the requested synthetic patient and boundary metadata", () => {
  const simulationCase = createFullCase();

  assert.equal(DEFAULT_SIMULATION_SEED, 20261007);
  assert.equal(SIMULATION_MODE, true);
  assert.deepEqual(simulationMetadata, {
    synthetic: true,
    clinicalUse: false,
    purpose: "SafeAnes UI and workflow demonstration",
  });
  assert.deepEqual(
    {
      ageYears: simulationCase.patient.ageYears,
      sex: simulationCase.patient.sex,
      weightKg: simulationCase.patient.weightKg,
      asa: simulationCase.patient.asa,
      procedure: simulationCase.procedure.name,
      operatingRoom: simulationCase.procedure.operatingRoom,
      anesthesia: simulationCase.procedure.anesthesia,
    },
    {
      ageYears: 67,
      sex: "Female",
      weightKg: 58,
      asa: "III",
      procedure: "Left Total Hip Arthroplasty",
      operatingRoom: "OR 2",
      anesthesia: "General",
    }
  );
});

test("event time, recorded time, and current simulation time remain distinct", () => {
  const simulationCase = createFullCase();
  const rescueEvent = simulationCase.events.find(
    (event) => event.id === "medication-phenylephrine-rescue"
  );

  assert.ok(rescueEvent);
  assert.equal(rescueEvent.eventTime, 11_880_000);
  assert.equal(rescueEvent.recordedTime, 11_880_250);
  assert.equal(simulationCase.simulationTime, 0);
  assert.notEqual(rescueEvent.eventTime, rescueEvent.recordedTime);
  assert.notEqual(rescueEvent.eventTime, simulationCase.simulationTime);
});

test("shared module projections retain one case identity and separate model outputs", () => {
  const simulationCase = createFullCase();
  const projections = [
    adaptUc01(simulationCase),
    adaptUc02(simulationCase),
    adaptUc03(simulationCase),
    adaptUc04(simulationCase),
    adaptUc05(simulationCase),
  ];

  assert.deepEqual(projections.map((projection) => projection.caseId), Array(5).fill("SAFE-DEMO-001"));
  assert.equal(adaptUc03(simulationCase).medications.find((item) => item.id === "med-ketorolac-proposal").status, "PROPOSED");
  assert.equal(adaptUc05(simulationCase).observations.some((item) => item.signal === "MAP"), false);
  assert.equal(simulationCase.predictions.some((prediction) => simulationCase.observations.includes(prediction)), false);
});

test("cross-module event references resolve and every medication has a stream event", () => {
  const simulationCase = createFullCase();
  const eventIds = new Set(simulationCase.events.map((event) => event.id));
  for (const episode of simulationCase.episodes) {
    for (const eventId of episode.relatedEventIds) assert.ok(eventIds.has(eventId), `Missing episode event ${eventId}`);
  }
  for (const claim of simulationCase.recordClaims) {
    for (const eventId of claim.eventRefs) assert.ok(eventIds.has(eventId), `Missing claim event ${eventId}`);
  }
  for (const alert of simulationCase.alerts) {
    for (const eventId of alert.relatedEventIds) assert.ok(eventIds.has(eventId), `Missing alert event ${eventId}`);
  }
  for (const medication of simulationCase.medications) {
    assert.ok(simulationCase.events.some((event) => event.payload?.medicationId === medication.id));
  }
});

test("event stream is stably ordered and replay emits the same events for a cursor", () => {
  const simulationCase = createFullCase();
  const times = simulationCase.events.map((event) => event.eventTime);
  assert.deepEqual(times, [...times].sort((left, right) => left - right));

  const engine = new SimulationEngine(simulationCase);
  const firstReplay = engine.advanceTo(11_940_000).emittedEvents.map((event) => event.id);
  const secondReplay = engine.replayTo(11_940_000).emittedEvents.map((event) => event.id);
  assert.deepEqual(secondReplay, firstReplay);
  assert.ok(firstReplay.includes("medication-phenylephrine-rescue"));
  assert.ok(!firstReplay.includes("medication-ketorolac-proposed"));
});
