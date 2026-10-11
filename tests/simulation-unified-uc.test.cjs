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
const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;

test("one shared simulation view exposes canonical case state and clock controls", () => {
  const engine = new simulation.SimulationEngine(simulation.createFullCase());
  const snapshot = engine.getSnapshot();
  const view = simulation.createSafeAnesSimulationState(engine, snapshot);

  assert.equal(view.patient.patientId, "DEMO-PATIENT-001");
  assert.equal(view.case.caseId, "SAFE-DEMO-001");
  assert.equal(view.clock.simulationTime, 0);
  assert.equal(view.clock.status, "STOPPED");
  assert.equal(view.devices, snapshot.devices);
  assert.equal(view.observations, snapshot.observations);
  assert.equal(view.quality, snapshot.qualityStates);
  assert.equal(view.medications, snapshot.medications);
  assert.equal(view.events, snapshot.events);
  assert.equal(view.episodes, snapshot.episodes);
  assert.equal(view.predictions, snapshot.predictions);
  assert.equal(view.alerts, snapshot.alerts);
  assert.equal(view.faults, snapshot.activeFaults);
  assert.equal(view.claims, snapshot.recordClaims);

  view.clock.setSpeed(2);
  view.clock.play();
  assert.equal(engine.speed, 2);
  assert.equal(engine.status, "PLAYING");
  view.clock.pause();
  assert.equal(engine.status, "PAUSED");
});

test("UC01-UC05 and the overview keep shared event, episode, and alert identity", () => {
  const engine = new simulation.SimulationEngine(simulation.createFullCase());
  const snapshot = engine.seek(at(10, 53, 1)).snapshot;
  const uc01 = simulation.adaptUc01(snapshot);
  const uc02 = simulation.adaptUc02(snapshot);
  const uc03 = simulation.adaptUc03(snapshot);
  const uc04 = simulation.adaptUc04(snapshot);
  const uc05 = simulation.adaptUc05(snapshot);

  const phenylephrineId = "medication-phenylephrine-rescue";
  for (const events of [uc01.events, uc02.evidenceEvents, uc03.medicationEvents, uc04.events]) {
    assert.ok(events.some((event) => event.id === phenylephrineId), `missing shared event in projection`);
  }

  const lowMapId = "episode-hemodynamic-low-map";
  assert.ok(uc01.episodes.some((episode) => episode.id === lowMapId));
  assert.ok(uc04.episodes.some((episode) => episode.id === lowMapId));
  assert.ok(uc02.events.some((event) => event.id === "episode-hemodynamic-low-map-detected"));
  assert.ok(uc02.claims.some((claim) => claim.id === "claim-low-map-episode"));

  const respiratoryEpisodeId = "episode-respiratory-deterioration-candidate";
  assert.ok(uc01.episodes.some((episode) => episode.id === respiratoryEpisodeId));
  assert.ok(uc05.episodes.some((episode) => episode.id === respiratoryEpisodeId));
  assert.ok(uc02.events.some((event) => event.id === "respiratory-no-breath-detected"));
  assert.ok(uc02.claims.some((claim) => claim.id === "claim-respiratory-no-breath"));

  const respiratoryAlertId = "alert-respiratory-no-breath";
  assert.ok(snapshot.alerts.some((alert) => alert.id === respiratoryAlertId));
  assert.ok(uc01.activeAlerts.some((alert) => alert.id === respiratoryAlertId));
  assert.ok(uc05.alerts.some((alert) => alert.id === respiratoryAlertId));
});

test("shared projections never expose events or claims beyond the simulation cursor", () => {
  const engine = new simulation.SimulationEngine(simulation.createFullCase());
  const view = simulation.createSafeAnesSimulationState(engine, engine.seek(at(9, 0)).snapshot);

  assert.ok(view.events.every((event) => event.eventTime <= view.clock.simulationTime));
  assert.ok(view.claims.every((claim) => claim.eventTime <= view.clock.simulationTime));
  assert.ok(!view.medications.some((medication) => medication.id === "med-ketorolac-proposal"));
  assert.ok(!view.alerts.some((alert) => alert.id === "alert-respiratory-no-breath"));
});
