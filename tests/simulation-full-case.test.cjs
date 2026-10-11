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

const { createFullCase, SimulationEngine } = require(
  path.join(__dirname, "..", "src", "simulation", "index.ts")
);

const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;
const findEvent = (simulationCase, id) => {
  const event = simulationCase.events.find((item) => item.id === id);
  assert.ok(event, `Expected canonical event ${id}`);
  return event;
};

test("full-case scenario uses one synthetic case and the requested timeline", () => {
  const simulationCase = createFullCase();
  assert.equal(simulationCase.scenarioId, "SAFEANES_FULL_UC_DEMO_V1");
  assert.equal(simulationCase.encounter.caseId, "SAFE-DEMO-001");
  assert.equal(simulationCase.patient.patientId, "DEMO-PATIENT-001");
  assert.equal(simulationCase.simulationTime, 0);

  const milestoneTimes = {
    "case-started": at(7, 15),
    "patient-entered-or": at(7, 45),
    "phase-induction": at(8, 5),
    "airway-secured": at(8, 15),
    "phase-maintenance": at(8, 25),
    "surgery-started": at(9, 10),
    "episode-hemodynamic-low-map-detected": at(10, 31),
    "hemodynamic-major-episode-marker": at(10, 32),
    "phase-closure": at(11, 20),
    "phase-emergence": at(11, 45),
    "patient-transferred-pacu": at(12, 5),
    "case-completed": at(12, 15),
  };
  for (const [eventId, eventTime] of Object.entries(milestoneTimes)) {
    assert.equal(findEvent(simulationCase, eventId).eventTime, eventTime, eventId);
  }
});

test("case signals are deterministic, continuous, and include the requested physiology", () => {
  const simulationCase = createFullCase(20261007);
  assert.deepEqual(simulationCase, createFullCase(20261007));
  for (const signal of ["HR", "MAP", "SBP", "DBP", "SPO2", "ETCO2", "RR", "BIS"]) {
    const readings = simulationCase.observations.filter((item) => item.signal === signal);
    assert.ok(readings.length >= 500, `${signal} should cover the full case`);
    assert.ok(readings.every((item, index) => index === 0 || readings[index - 1].eventTime < item.eventTime));
    assert.ok(readings.every((item) => Number.isFinite(item.value)));
  }
  for (const signal of ["ABP", "CAPNOGRAM", "PLETH"]) {
    assert.ok(simulationCase.waveforms.some((item) => item.signal === signal), `${signal} waveform is required`);
  }
});

test("technical EtCO2 dropout is quality metadata, never a physiological zero", () => {
  const simulationCase = createFullCase();
  const dropoutStart = at(10, 2);
  const dropoutEnd = dropoutStart + 12_000;
  const dropout = findEvent(simulationCase, "quality-etco2-technical-dropout");
  assert.equal(dropout.eventTime, dropoutStart);
  assert.equal(dropout.payload.quality, "TECHNICAL_DROPOUT");
  assert.equal(findEvent(simulationCase, "quality-etco2-restored").eventTime, dropoutEnd);
  assert.ok(!simulationCase.observations.some((item) =>
    item.signal === "ETCO2" && item.eventTime >= dropoutStart && item.eventTime < dropoutEnd
  ));
  assert.ok(!simulationCase.observations.some((item) => item.signal === "ETCO2" && item.value === 0));
  assert.ok(!simulationCase.waveforms.some((item) =>
    item.signal === "CAPNOGRAM" && item.eventTime < dropoutEnd &&
    item.eventTime + (item.samples.length / item.sampleRateHz) * 1_000 > dropoutStart
  ));

  const snapshot = new SimulationEngine(simulationCase).seek(dropoutStart + 1_000).snapshot;
  assert.ok(snapshot.qualityStates.some((item) =>
    item.signal === "ETCO2" && item.status === "TECHNICAL_DROPOUT"
  ));
  const restored = new SimulationEngine(simulationCase).seek(dropoutEnd + 500).snapshot;
  assert.ok(restored.qualityStates.some((item) =>
    item.signal === "ETCO2" && item.status === "GOOD" && item.validUntilTime === dropoutEnd
  ));
});

test("quality interruptions and pump latency are explicit, bounded events", () => {
  const simulationCase = createFullCase();
  const intervals = [
    ["quality-bis-degraded", "quality-bis-restored", at(9, 14), 45_000],
    ["quality-arterial-artifact", "quality-arterial-restored", at(9, 42), 15_000],
    ["quality-pump-gateway-latency", "quality-pump-gateway-recovered", at(10, 18), 30_000],
  ];
  for (const [startId, endId, start, duration] of intervals) {
    assert.equal(findEvent(simulationCase, startId).eventTime, start);
    assert.equal(findEvent(simulationCase, endId).eventTime, start + duration);
  }

  const engine = new SimulationEngine(simulationCase);
  const degraded = engine.seek(at(9, 14, 30) + 500).snapshot;
  assert.ok(degraded.qualityStates.some((item) => item.signal === "BIS" && item.status === "DEGRADED"));
  const restored = engine.seek(at(9, 15) + 500).snapshot;
  assert.ok(restored.qualityStates.some((item) =>
    item.signal === "BIS" && item.status === "GOOD" && item.validUntilTime === at(9, 14, 45)
  ));
  const pumpDegraded = engine.seek(at(10, 18, 15) + 500).snapshot;
  assert.equal(pumpDegraded.devices.find((item) => item.id === "infusion-pump-or2").status, "DEGRADED");
  const pumpRestored = engine.seek(at(10, 19) + 500).snapshot;
  assert.equal(pumpRestored.devices.find((item) => item.id === "infusion-pump-or2").status, "CONNECTED");
});

test("point-level invalidated samples do not leave the case quality degraded after the artifact interval", () => {
  const artifactStart = at(9, 42);
  const restoredAt = artifactStart + 15_000;
  const snapshot = new SimulationEngine(createFullCase()).seek(restoredAt + 1_000).snapshot;
  const activeArtifacts = snapshot.qualityStates.filter((quality) =>
    quality.status === "INVALIDATED_ARTIFACT" &&
    quality.eventTime <= snapshot.simulationTime &&
    (quality.validUntilTime === undefined || snapshot.simulationTime < quality.validUntilTime)
  );

  assert.deepEqual(activeArtifacts, []);
});

test("hemodynamic deterioration, risk curve, and medication overlap remain separate facts", () => {
  const simulationCase = createFullCase();
  const model = simulationCase.scenarioManifest.hemodynamics;
  assert.equal(model.modelId, "SAFEANES-DEMO-HPI");
  assert.equal(model.modelVersion, "0.1-demo");
  assert.equal(model.hypotensionThresholdMmHg, 65);
  assert.equal(simulationCase.predictions.some((prediction) => prediction.modelId === model.modelId), false);
  const engine = new SimulationEngine(simulationCase);
  const expectedRisk = [
    [at(10, 23), 0.22],
    [at(10, 25), 0.38],
    [at(10, 27), 0.57],
    [at(10, 29), 0.76],
    [at(10, 31), 0.88],
  ];
  for (const [timestamp, probability] of expectedRisk) {
    const snapshot = engine.seek(timestamp + 1_000).snapshot;
    const prediction = snapshot.predictions
      .filter((item) => item.modelId === model.modelId && item.horizonMinutes === 5)
      .find((item) => Math.abs(item.timestamp - timestamp) < 2_000);
    assert.ok(prediction, `Expected replay-generated five-minute prediction at ${timestamp}`);
    assert.ok(Math.abs(prediction.probability - probability) < 0.005);
    assert.match(prediction.task, /synthetic|demo/i);
    assert.equal(prediction.clinicalUse, false);
  }
  for (const minuteOffset of [196, 197, 198]) {
    const map = simulationCase.observations.find((item) => item.signal === "MAP" && item.eventTime === minuteOffset * minute);
    assert.ok(map && map.value < 65, `MAP should be below the demo threshold at minute ${minuteOffset}`);
  }

  const rescue = findEvent(simulationCase, "medication-phenylephrine-rescue");
  assert.equal(rescue.eventTime, at(10, 33));
  assert.equal(rescue.payload.temporalRelation.relationship, "OVERLAPS");
  assert.equal(rescue.relatedEventIds.includes("episode-hemodynamic-low-map-detected"), true);
  assert.ok(!JSON.stringify(simulationCase.events).includes("TREATED_BY"));
  assert.ok(!JSON.stringify(simulationCase.events).includes("SUCCESSFULLY TREATED"));
  const inferredClaim = simulationCase.recordClaims.find((claim) => claim.id === "claim-hemodynamic-improvement-after-phenylephrine");
  assert.ok(inferredClaim);
  assert.equal(inferredClaim.provenance, "INFERRED");
  assert.equal(inferredClaim.reviewStatus, "REQUIRES_REVIEW");
  assert.match(inferredClaim.text, /causality not established/i);
});

test("medication safety proposal is synthetic and explicitly marked as unvalidated", () => {
  const simulationCase = createFullCase();
  assert.equal(findEvent(simulationCase, "medication-propofol-bolus").eventTime, at(8, 5));
  assert.equal(findEvent(simulationCase, "medication-rocuronium-administered").eventTime, at(8, 6));
  assert.equal(findEvent(simulationCase, "medication-remifentanil-infusion-started").eventTime, at(8, 8));
  assert.equal(findEvent(simulationCase, "medication-propofol-infusion-started").eventTime, at(8, 25));
  assert.equal(findEvent(simulationCase, "medication-ketorolac-proposed").eventTime, at(10, 42));
  const proposal = findEvent(simulationCase, "medication-ketorolac-proposed");
  assert.equal(proposal.payload.demoReviewRequired, true);
  assert.equal(simulationCase.alerts.some((item) => item.sourceModule === "UC03"), false);
  assert.equal(simulationCase.events.some((event) => event.id === "medication-safety-demo-rule-triggered"), false);
  const engine = new SimulationEngine(simulationCase);
  const snapshot = engine.seek(at(10, 42) + 1_000).snapshot;
  const alert = snapshot.alerts.find((item) => item.sourceModule === "UC03");
  assert.ok(alert);
  assert.equal(alert.demoOnly, true);
  assert.equal(alert.clinicalUse, false);
  assert.match(alert.ruleLabel, /DEMO ONLY.*NOT CLINICALLY VALIDATED/i);
  assert.deepEqual(alert.availableActions, ["MODIFY", "OVERRIDE"]);
  assert.deepEqual(alert.evidenceEventIds, [proposal.id]);
  assert.ok(simulationCase.medications.every((item) => item.synthetic === true && item.clinicalUse === false));
});

test("respiratory candidate is distinct from technical dropout and assigns no cause", () => {
  const simulationCase = createFullCase();
  const noBreath = findEvent(simulationCase, "respiratory-no-breath-detected");
  assert.equal(noBreath.eventTime, at(10, 52));
  assert.equal(noBreath.payload.type, "RESPIRATORY_DETERIORATION_CANDIDATE");
  assert.equal(findEvent(simulationCase, "event-alert-respiratory-no-breath").eventTime, at(10, 52, 20));
  assert.equal(findEvent(simulationCase, "respiratory-no-breath-resolved").eventTime, at(10, 53));
  assert.ok(simulationCase.observations.some((item) => item.signal === "RR" && item.eventTime === at(10, 52) && item.value === 0));
  assert.ok(!simulationCase.observations.some((item) => item.signal === "ETCO2" && item.eventTime >= at(10, 52) && item.eventTime < at(10, 53)));
  const alert = new SimulationEngine(simulationCase).seek(at(10, 52, 20) + 200).snapshot.alerts
    .find((item) => item.id === "alert-respiratory-no-breath");
  assert.equal(alert.severity, "HIGH");
  assert.match(alert.message, /cause not assigned/i);
  const claim = simulationCase.recordClaims.find((item) => item.id === "claim-respiratory-no-breath");
  assert.equal(claim.provenance, "DERIVED");
  assert.match(claim.text, /detected/i);
  assert.ok(!claim.text.match(/apnea diagnosis|cause was/i));
});

test("same-time medication relationship is represented as OVERLAPS in replay graph", () => {
  const simulationCase = createFullCase();
  const snapshot = new SimulationEngine(simulationCase).seek(at(10, 34)).snapshot;
  assert.ok(snapshot.eventGraph.some((edge) =>
    edge.eventId === "medication-phenylephrine-rescue" &&
    edge.relatedEventId === "episode-hemodynamic-low-map-detected" &&
    edge.relationship === "OVERLAPS"
  ));
});

test("causal-review claim and respiratory alert respect their event boundaries", () => {
  const simulationCase = createFullCase();
  const engine = new SimulationEngine(simulationCase);
  const hemodynamicMidEpisode = engine.seek(at(10, 33, 30)).snapshot;
  assert.ok(hemodynamicMidEpisode.episodes.some((item) => item.id === "episode-hemodynamic-low-map" && item.status === "ACTIVE"));
  assert.ok(!hemodynamicMidEpisode.recordClaims.some((item) => item.id === "claim-hemodynamic-improvement-after-phenylephrine"));

  const hemodynamicResolved = engine.seek(at(10, 34) + 500).snapshot;
  assert.ok(hemodynamicResolved.recordClaims.some((item) => item.id === "claim-hemodynamic-improvement-after-phenylephrine"));
  assert.equal(hemodynamicResolved.recordClaims.find((item) => item.id === "claim-phenylephrine-administration").provenance, "DIRECT");

  const respiratoryAlert = engine.seek(at(10, 52, 20) + 200).snapshot;
  assert.ok(respiratoryAlert.alerts.some((item) => item.id === "alert-respiratory-no-breath" && item.severity === "HIGH"));
  assert.ok(respiratoryAlert.episodes.some((item) => item.id === "episode-respiratory-deterioration-candidate" && item.status === "ACTIVE"));
  assert.ok(!respiratoryAlert.recordClaims.some((item) => item.id === "claim-respiratory-no-breath"));
  const respiratoryResolved = engine.seek(at(10, 53) + 500).snapshot;
  assert.ok(respiratoryResolved.recordClaims.some((item) => item.id === "claim-respiratory-no-breath"));
});
