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
const { createFullCase, runUc01Engine, SimulationEngine } = simulation;
const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;

test("fault injection defaults off and is represented in canonical state", () => {
  const engine = new SimulationEngine(createFullCase());
  assert.deepEqual(engine.getSnapshot().activeFaults, []);
  assert.equal(simulation.SIMULATION_FAULTS_DEFAULT_ENABLED, false);

  const snapshot = engine.setFault("SIGNAL_ARTIFACT", true);
  assert.deepEqual(snapshot.activeFaults.map((item) => item.id), ["SIGNAL_ARTIFACT"]);
  assert.ok(snapshot.events.some((event) => event.eventType === "SIMULATION_FAULT_ENABLED"));
});

test("all optional faults have readable EN and VI labels and demo-only messaging", () => {
  const en = require(path.join(__dirname, "..", "src", "messages", "en", "common.json"));
  const vi = require(path.join(__dirname, "..", "src", "messages", "vi", "common.json"));
  for (const fault of simulation.SIMULATION_FAULT_DEFINITIONS) {
    assert.ok(en.caseReplay.controller.faults.names[fault.id]);
    assert.ok(vi.caseReplay.controller.faults.names[fault.id]);
    assert.ok(en.caseReplay.controller.faults.targets[fault.id]);
    assert.ok(vi.caseReplay.controller.faults.targets[fault.id]);
  }
  assert.match(en.caseReplay.controller.faults.demoOnly, /not for clinical use/i);
  assert.match(vi.caseReplay.controller.faults.demoOnly, /không dùng trong lâm sàng/i);
});

test("signal artifact invalidates MAP input, appears in UC01 quality, and lowers prediction coverage", () => {
  const target = at(10, 29);
  const baseline = new SimulationEngine(createFullCase()).seek(target).snapshot;
  const engine = new SimulationEngine(createFullCase());
  engine.seek(at(10, 28));
  engine.setFault("SIGNAL_ARTIFACT", true);
  const snapshot = engine.seek(target).snapshot;
  const quality = snapshot.qualityStates.find((item) =>
    item.signal === "MAP" && item.status === "INVALIDATED_ARTIFACT" && item.validUntilTime === undefined,
  );
  const uc01Map = runUc01Engine(snapshot).signals.find((item) => item.signal === "MAP");
  const latestRisk = (state) => state.predictions
    .filter((item) => item.modelId === "SAFEANES-DEMO-HPI")
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  assert.ok(quality);
  assert.equal(uc01Map.value, null);
  assert.equal(uc01Map.quality, "INVALIDATED_ARTIFACT");
  assert.ok(latestRisk(snapshot).dataCoverage < latestRisk(baseline).dataCoverage);
  assert.ok(latestRisk(snapshot).missingModalities.includes("MAP"));
});

test("capnograph disconnect suppresses the synthetic no-breath event and alert", () => {
  const engine = new SimulationEngine(createFullCase());
  engine.seek(0);
  const enabled = engine.setFault("DEVICE_DISCONNECT", true);
  assert.equal(enabled.devices.find((item) => item.kind === "VENTILATOR").status, "DISCONNECTED");

  const snapshot = engine.seek(at(10, 53)).snapshot;
  assert.equal(snapshot.events.some((event) => event.id === "respiratory-no-breath-detected"), false);
  assert.equal(snapshot.events.some((event) => event.id === "event-alert-respiratory-no-breath"), false);
  assert.equal(snapshot.episodes.some((episode) => episode.type === "RESPIRATORY_DETERIORATION_CANDIDATE"), false);
  assert.equal(snapshot.alerts.some((alert) => alert.sourceModule === "UC05"), false);
  assert.equal(snapshot.observations.some((item) => item.signal === "ETCO2" && item.value === 0), false);
  assert.equal(snapshot.waveforms.some((item) => item.signal === "CAPNOGRAM" && item.eventTime > 0), false);
  const prediction = snapshot.predictions
    .filter((item) => item.modelId === "SAFEANES-DEMO-RESP-v0.1")
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  assert.ok(prediction.dataCoverage < 1);
  assert.ok(prediction.missingModalities.some((item) => /capnogram|EtCO2/i.test(item)));
});

test("delayed medication documentation keeps event time and delays record visibility", () => {
  const engine = new SimulationEngine(createFullCase());
  engine.seek(0);
  engine.setFault("DELAYED_MEDICATION_DOCUMENTATION", true);

  const beforeDocumentation = engine.seek(at(10, 34)).snapshot;
  assert.equal(beforeDocumentation.events.some((event) => event.id === "medication-phenylephrine-rescue"), false);
  assert.equal(beforeDocumentation.medications.some((item) => item.id === "med-phenylephrine"), false);

  const documented = engine.seek(at(10, 38, 1)).snapshot;
  const medicationEvent = documented.events.find((event) => event.id === "medication-phenylephrine-rescue");
  assert.ok(medicationEvent);
  assert.equal(medicationEvent.eventTime, at(10, 33));
  assert.equal(medicationEvent.recordedTime, at(10, 38));
});

test("fault state replays deterministically and Reset Scenario restores baseline", () => {
  const engine = new SimulationEngine(createFullCase());
  engine.seek(at(10, 1));
  engine.setFault("PACKET_DROPOUT", true);
  const on = engine.seek(at(10, 2, 5)).snapshot;
  const rewound = engine.seek(at(9, 59)).snapshot;
  const replayed = engine.seek(at(10, 2, 5)).snapshot;
  assert.deepEqual(replayed, on);
  assert.deepEqual(rewound.activeFaults, []);

  const reset = engine.resetScenario();
  const fresh = new SimulationEngine(createFullCase()).seek(0).snapshot;
  assert.equal(reset.simulationTime, 0);
  assert.deepEqual(reset.activeFaults, []);
  assert.deepEqual(reset.events, fresh.events);
  assert.deepEqual(reset.devices, fresh.devices);
  assert.deepEqual(reset.observations, fresh.observations);
  assert.deepEqual(reset.qualityStates, fresh.qualityStates);
  const resetReplay = engine.seek(at(10, 53)).snapshot;
  const deterministicBaseline = new SimulationEngine(createFullCase()).seek(at(10, 53)).snapshot;
  assert.deepEqual(resetReplay, deterministicBaseline);
});

test("clock drift, missing modality, conflicting source, and pump latency alter canonical state", () => {
  const engine = new SimulationEngine(createFullCase());
  engine.seek(0);
  const baselineMonitorOffset = engine.getSnapshot().devices.find((device) => device.kind === "PATIENT_MONITOR").clockOffsetMs;
  engine.setFault("CLOCK_DRIFT", true);
  const driftedMonitorOffset = engine.getSnapshot().devices.find((device) => device.kind === "PATIENT_MONITOR").clockOffsetMs;
  assert.ok(driftedMonitorOffset > 100);
  assert.notEqual(driftedMonitorOffset, baselineMonitorOffset);
  engine.setFault("MISSING_MODALITY", true);
  engine.setFault("CONFLICTING_SOURCE", true);
  engine.setFault("PUMP_GATEWAY_LATENCY", true);
  const snapshot = engine.seek(at(8, 9)).snapshot;

  assert.equal(snapshot.qualityStates.some((item) => item.status === "STRUCTURAL_NOT_MONITORED"), true);
  assert.ok(snapshot.observations.some((item) => item.validity === "CONFLICTING"));
  const hpi = snapshot.predictions
    .filter((item) => item.modelId === "SAFEANES-DEMO-HPI")
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  const respiratory = snapshot.predictions
    .filter((item) => item.modelId === "SAFEANES-DEMO-RESP-v0.1")
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  assert.ok(hpi.missingModalities.includes("MAP"));
  assert.ok(respiratory.missingModalities.includes("SPO2"));
  const pump = snapshot.devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");
  assert.ok(pump.latencyMs >= 2_000);
  const pumpMedication = snapshot.events.find((event) => event.id === "medication-remifentanil-infusion-started");
  assert.ok(pumpMedication);
  assert.equal(pumpMedication.recordedTime, pumpMedication.eventTime + 2_500);
});
