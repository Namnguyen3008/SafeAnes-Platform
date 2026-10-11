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

const simulation = require(path.join(__dirname, "..", "src", "simulation", "index.ts"));
const {
  adaptUc01,
  adaptUc02,
  adaptUc03,
  adaptUc04,
  adaptUc05,
  createFullCase,
  SimulationEngine,
} = simulation;

const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;

function normalizePlaybackFields(snapshot) {
  return { ...snapshot, status: "PAUSED", speed: 1 };
}

function assertUniqueIds(items, label) {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label} must not contain duplicate IDs`);
}

function currentQuality(snapshot, signal, time = snapshot.simulationTime) {
  return snapshot.qualityStates
    .filter((state) => state.signal === signal && state.eventTime <= time &&
      (state.validUntilTime === undefined || time < state.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
}

function latestPrediction(snapshot, modelId, horizonMinutes) {
  return snapshot.predictions
    .filter((item) => item.modelId === modelId && item.horizonMinutes === horizonMinutes)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
}

function latestHorizonSet(snapshot, modelId) {
  const predictions = snapshot.predictions.filter((item) => item.modelId === modelId);
  const timestamp = Math.max(...predictions.map((item) => item.timestamp));
  return predictions.filter((item) => item.timestamp === timestamp);
}

test("full case replays every major UC milestone identically at 1x, 10x, 30x, and 60x", () => {
  const checkpoints = [
    ["07:15", at(7, 15) + 1_000],
    ["07:45", at(7, 45) + 1_000],
    ["08:05", at(8, 5) + 1_000],
    ["08:15", at(8, 15) + 1_000],
    ["08:25", at(8, 25) + 1_000],
    ["09:10-surgery", at(9, 10) + 1_000],
    ["09:14", at(9, 14) + 1_000],
    ["09:42", at(9, 42) + 1_000],
    ["10:02-dropout", at(10, 2) + 1_000],
    ["10:02-recovered", at(10, 2) + 13_000],
    ["10:18-latency", at(10, 18) + 1_000],
    ["10:18-recovered", at(10, 18) + 31_000],
    ["10:23-risk", at(10, 23) + 1_000],
    ["10:25-risk", at(10, 25) + 1_000],
    ["10:27-risk", at(10, 27) + 1_000],
    ["10:29-risk", at(10, 29) + 1_000],
    ["10:30-seek-boundary", at(10, 30)],
    ["10:31-low-map", at(10, 31) + 1_000],
    ["10:33-phenylephrine", at(10, 33) + 1_000],
    ["10:35-record", at(10, 35) + 1_000],
    ["10:42-medication-rule", at(10, 42) + 1_000],
    ["10:48-morphology", at(10, 48) + 1_000],
    ["10:50-rate", at(10, 50) + 1_000],
    ["10:51-respiratory-risk", at(10, 51) + 1_000],
    ["10:52-no-breath", at(10, 52) + 1_000],
    ["10:52:20-alert", at(10, 52, 21)],
    ["10:53-live-claim", at(10, 53) + 1_000],
    ["11:20-closure", at(11, 20) + 1_000],
    ["11:45-emergence", at(11, 45) + 1_000],
    ["12:05-pacu", at(12, 5) + 1_000],
    ["12:15-complete", 5 * 60 * minute],
  ];
  const expectedByCheckpoint = new Map();

  for (const speed of [1, 10, 30, 60]) {
    const engine = new SimulationEngine(createFullCase(20261007));
    engine.setSpeed(speed);
    engine.play();
    let previousTime = 0;

    for (const [label, targetTime] of checkpoints) {
      const realElapsedMs = (targetTime - previousTime) / speed;
      const frame = engine.advanceRealTime(realElapsedMs);
      const snapshot = frame.snapshot;
      previousTime = targetTime;

      assert.equal(snapshot.simulationTime, targetTime, `${speed}x must reach ${label} exactly`);
      assert.equal(snapshot.patient.patientId, "DEMO-PATIENT-001");
      assert.equal(snapshot.encounter.caseId, "SAFE-DEMO-001");
      assertUniqueIds(snapshot.events, `${speed}x events at ${label}`);
      assertUniqueIds(snapshot.episodes, `${speed}x episodes at ${label}`);
      assertUniqueIds(snapshot.alerts, `${speed}x alerts at ${label}`);
      assertUniqueIds(snapshot.predictions, `${speed}x predictions at ${label}`);
      assert.ok(snapshot.events.every((event) => event.eventTime <= snapshot.simulationTime));
      assert.ok(snapshot.predictions.every((prediction) => prediction.timestamp <= snapshot.simulationTime));
      assert.ok(snapshot.alerts.every((alert) => alert.eventTime <= snapshot.simulationTime));

      const normalized = normalizePlaybackFields(snapshot);
      if (speed === 1) expectedByCheckpoint.set(label, normalized);
      else assert.deepEqual(normalized, expectedByCheckpoint.get(label), `${speed}x output diverged at ${label}`);

      if (label === "09:14") {
        assert.equal(currentQuality(snapshot, "BIS")?.status, "DEGRADED");
      }
      if (label === "07:15") assert.ok(snapshot.events.some((event) => event.id === "case-started"));
      if (label === "07:45") assert.ok(snapshot.events.some((event) => event.id === "patient-entered-or"));
      if (label === "08:05") assert.ok(snapshot.events.some((event) => event.id === "phase-induction"));
      if (label === "08:15") assert.ok(snapshot.events.some((event) => event.id === "airway-secured"));
      if (label === "08:25") assert.ok(snapshot.events.some((event) => event.id === "phase-maintenance"));
      if (label === "09:10-surgery") assert.ok(snapshot.events.some((event) => event.id === "surgery-started"));
      if (label === "09:42") {
        assert.equal(currentQuality(snapshot, "MAP")?.status, "INVALIDATED_ARTIFACT");
        assert.ok(snapshot.observations.some((item) => item.signal === "MAP" && item.value !== null));
      }
      if (label === "10:02-dropout") {
        assert.equal(currentQuality(snapshot, "ETCO2")?.status, "TECHNICAL_DROPOUT");
        assert.equal(adaptUc01(snapshot).events.some((event) => event.id === "quality-etco2-technical-dropout"), true);
        assert.ok(!snapshot.observations.some((item) => item.signal === "ETCO2" && item.eventTime >= at(10, 2) && item.eventTime < at(10, 2) + 12_000));
        assert.ok(!snapshot.episodes.some((episode) => episode.type.startsWith("RESPIRATORY_")));
      }
      if (label === "10:02-recovered") {
        assert.ok(!snapshot.observations.some((item) => item.signal === "ETCO2" && item.value === 0));
        assert.ok(!snapshot.episodes.some((episode) => episode.type.startsWith("RESPIRATORY_")));
      }
      if (label === "10:18-latency") {
        assert.equal(snapshot.devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY").latencyMs, 750);
      }
      if (label === "10:18-recovered") {
        assert.equal(snapshot.devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY").latencyMs, 80);
      }
      if (label === "10:23-risk") {
        const horizons = latestHorizonSet(snapshot, "SAFEANES-DEMO-HPI");
        assert.deepEqual(horizons.map((item) => item.horizonMinutes).sort((a, b) => a - b), [1, 5, 10, 15]);
        assert.equal(horizons.find((item) => item.horizonMinutes === 5).probability, 0.22);
        assert.ok(snapshot.observations.some((item) => item.signal === "MAP" && item.value !== null));
      }
      if (label === "10:25-risk") assert.equal(latestPrediction(snapshot, "SAFEANES-DEMO-HPI", 5)?.probability, 0.38);
      if (label === "10:27-risk") assert.equal(latestPrediction(snapshot, "SAFEANES-DEMO-HPI", 5)?.probability, 0.57);
      if (label === "10:29-risk") {
        const hpi = snapshot.alerts.filter((alert) => alert.sourceModule === "UC04");
        assert.equal(hpi.length, 1);
        assert.equal(hpi[0].riskProbability, 0.76);
        assert.equal(snapshot.episodes.filter((episode) => episode.type === "IMPENDING_HYPOTENSION").length, 1);
        assert.deepEqual(latestHorizonSet(snapshot, "SAFEANES-DEMO-HPI").map((item) => item.horizonMinutes).sort((a, b) => a - b), [1, 5, 10, 15]);
      }
      if (label === "10:30-seek-boundary") {
        assert.ok(!snapshot.events.some((event) => event.id === "medication-ketorolac-proposed"));
        assert.ok(!snapshot.events.some((event) => event.id === "respiratory-no-breath-detected"));
        assert.ok(!snapshot.alerts.some((alert) => alert.id === "alert-medication-safety-demo" || alert.id === "alert-respiratory-no-breath"));
        assert.ok(!snapshot.recordClaims.some((claim) => claim.id === "claim-respiratory-no-breath"));
      }
      if (label === "10:31-low-map") {
        assert.equal(latestPrediction(snapshot, "SAFEANES-DEMO-HPI", 5)?.probability, 0.88);
        assert.equal(snapshot.episodes.filter((episode) => episode.id === "episode-hemodynamic-low-map").length, 1);
        assert.equal(snapshot.episodes.filter((episode) => episode.type === "HYPOTENSION").length, 1);
        assert.equal(snapshot.episodes.find((episode) => episode.id === "episode-hemodynamic-low-map").status, "ACTIVE");
      }
      if (label === "10:33-phenylephrine") {
        assert.equal(snapshot.events.filter((event) => event.id === "medication-phenylephrine-rescue").length, 1);
        assert.equal(snapshot.medications.filter((item) => item.id === "med-phenylephrine").length, 1);
        assert.ok(snapshot.eventGraph.some((edge) =>
          edge.eventId === "medication-phenylephrine-rescue" &&
          edge.relatedEventId === "episode-hemodynamic-low-map-detected" &&
          edge.relationship === "OVERLAPS"
        ));
        assert.ok(!snapshot.eventGraph.some((edge) => /TREATED_BY|CAUSED_BY|SUCCESSFUL_RESPONSE/.test(edge.relationship)));
      }
      if (label === "10:35-record") {
        const claims = snapshot.recordClaims;
        assert.ok(claims.some((claim) => claim.id === "claim-phenylephrine-administration"));
        assert.ok(claims.some((claim) => claim.id === "claim-low-map-episode"));
        const causal = claims.find((claim) => claim.id === "claim-hemodynamic-improvement-after-phenylephrine");
        assert.equal(causal.reviewStatus, "REQUIRES_REVIEW");
        assert.ok(claims.every((claim) => claim.evidenceRefs.length > 0 && Object.values(claim.validation).every(Boolean)));
        assert.ok(!snapshot.events.some((event) => /RECORD_SIGNED|CLAIM_ACCEPTED/.test(event.eventType)));
      }
      if (label === "10:42-medication-rule") {
        assert.equal(snapshot.medications.find((item) => item.id === "med-ketorolac-proposal").status, "PROPOSED");
        assert.ok(!snapshot.events.some((event) => event.eventType === "MEDICATION_ADMINISTERED" && event.payload.medicationId === "med-ketorolac-proposal"));
        assert.equal(snapshot.events.filter((event) => event.id === "medication-ketorolac-proposed").length, 1);
        assert.equal(snapshot.alerts.filter((alert) => alert.sourceModule === "UC03").length, 1);
      }
      if (label === "10:52-no-breath") {
        assert.equal(snapshot.episodes.filter((episode) => episode.id === "episode-respiratory-deterioration-candidate").length, 1);
        assert.equal(snapshot.events.find((event) => event.id === "respiratory-no-breath-detected").quality.status, "GOOD");
      }
      if (label === "10:52:20-alert") {
        assert.equal(snapshot.alerts.filter((alert) => alert.id === "alert-respiratory-no-breath").length, 1);
      }
      if (label === "10:53-live-claim") {
        const uc01 = adaptUc01(snapshot);
        const uc02 = adaptUc02(snapshot);
        const uc03 = adaptUc03(snapshot);
        const uc04 = adaptUc04(snapshot);
        const uc05 = adaptUc05(snapshot);
        assert.ok([uc01, uc02, uc03, uc04, uc05].every((view) => view.caseId === "SAFE-DEMO-001" && view.simulationTime === snapshot.simulationTime));
        assert.ok(uc01.events.some((event) => event.id === "medication-phenylephrine-rescue"));
        assert.ok(uc02.evidenceEvents.some((event) => event.id === "medication-phenylephrine-rescue"));
        assert.ok(uc03.medicationEvents.some((event) => event.id === "medication-phenylephrine-rescue"));
        assert.ok(uc04.events.some((event) => event.id === "medication-phenylephrine-rescue"));
        assert.ok(uc02.claims.some((claim) => claim.id === "claim-respiratory-no-breath"));
        assert.equal(uc01.activeAlerts.find((alert) => alert.id === "alert-respiratory-no-breath")?.id, "alert-respiratory-no-breath");
        assert.equal(uc05.alerts.find((alert) => alert.id === "alert-respiratory-no-breath")?.id, "alert-respiratory-no-breath");
      }
      if (label === "11:20-closure") assert.ok(snapshot.events.some((event) => event.id === "phase-closure"));
      if (label === "11:45-emergence") assert.ok(snapshot.events.some((event) => event.id === "phase-emergence"));
      if (label === "12:05-pacu") assert.ok(snapshot.events.some((event) => event.id === "patient-transferred-pacu"));
      if (label === "12:15-complete") {
        assert.equal(snapshot.status, "COMPLETED");
        assert.equal(snapshot.encounter.status, "COMPLETED");
        assert.ok(snapshot.events.some((event) => event.id === "case-completed"));
      }
    }
  }
});

test("reset and replay with seed 20261007 reproduce the same complete canonical output", () => {
  const target = 5 * 60 * minute;
  const engine = new SimulationEngine(createFullCase(20261007));
  const first = engine.seek(target).snapshot;
  engine.seek(at(10, 42) + 1_000);
  const proposal = engine.getSnapshot().medications.find((item) => item.id === "med-ketorolac-proposal");
  const alert = engine.getSnapshot().alerts.find((item) => item.sourceModule === "UC03");
  const modified = engine.dispatchEvent({
    id: "e2e-demo-modify",
    eventTime: engine.simulationTime,
    recordedTime: engine.simulationTime,
    source: "uc03-demo-actions",
    sourceType: "MANUAL",
    eventType: "MEDICATION_PROPOSAL_MODIFIED",
    payload: {
      medicationId: proposal.id,
      alertId: alert.id,
      name: proposal.name,
      dose: 24,
      doseUnit: proposal.doseUnit,
      route: proposal.route,
      action: "MODIFY",
      synthetic: true,
      clinicalUse: false,
    },
    provenance: "DIRECT",
  });
  assert.equal(modified.alerts.find((item) => item.id === alert.id).status, "RESOLVED");
  assert.ok(modified.events.some((event) => event.id === "e2e-demo-modify"));

  engine.resetScenario();
  const baseline = engine.getSnapshot();
  assert.equal(baseline.seed, 20261007);
  assert.equal(baseline.simulationTime, 0);
  assert.equal(baseline.status, "STOPPED");
  const replayed = engine.seek(target).snapshot;
  assert.deepEqual(replayed, first);
});
