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

function elapsed(hour, minute, second = 0) {
  return (((hour * 60 + minute) - (7 * 60 + 15)) * 60 + second) * 1_000;
}

function snapshotAt(hour, minute, second = 0) {
  const engine = new simulation.SimulationEngine(simulation.createFullCase());
  return engine.seek(elapsed(hour, minute, second)).snapshot;
}

test("UC01 keeps signal quality separate from device connection state", () => {
  const snapshot = snapshotAt(9, 14, 1);
  const uc01 = simulation.runUc01Engine(snapshot);
  const bisDevice = uc01.devices.find((device) => device.kind === "BIS_MONITOR");
  const bisSignal = uc01.signals.find((signal) => signal.signal === "BIS");

  assert.equal(bisDevice.status, "CONNECTED");
  assert.equal(bisDevice.clockOffsetMs, 8);
  assert.equal(bisSignal.quality, "DEGRADED");
  const latestBis = snapshot.observations
    .filter((item) => item.signal === "BIS" && item.eventTime <= snapshot.simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  assert.equal(bisSignal.value, latestBis.value);
});

test("UC01 invalidates arterial artifact for display without changing the raw stream", () => {
  const snapshot = snapshotAt(9, 42, 1);
  const uc01 = simulation.runUc01Engine(snapshot);
  const map = uc01.signals.find((signal) => signal.signal === "MAP");
  const rawMap = snapshot.observations.find((item) => item.signal === "MAP" && item.eventTime === elapsed(9, 42));

  assert.equal(map.quality, "INVALIDATED_ARTIFACT");
  assert.equal(map.value, null);
  assert.ok(rawMap && typeof rawMap.value === "number");
  assert.equal(rawMap.imputed, false);
  assert.equal(rawMap.provenance, "DIRECT");
});

test("UC01 technical EtCO2 dropout is missing data, never a fabricated zero", () => {
  const snapshot = snapshotAt(10, 2, 1);
  const uc01 = simulation.runUc01Engine(snapshot);
  const etco2 = uc01.signals.find((signal) => signal.signal === "ETCO2");

  assert.equal(etco2.quality, "TECHNICAL_DROPOUT");
  assert.equal(etco2.value, null);
  assert.ok(snapshot.observations.every((item) => item.signal !== "ETCO2" || item.value !== 0));
});

test("UC01 pump gateway latency degrades and then reconnects with its synthetic clock offset", () => {
  const during = simulation.runUc01Engine(snapshotAt(10, 18, 15));
  const after = simulation.runUc01Engine(snapshotAt(10, 18, 31));
  const pumpDuring = during.devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");
  const pumpAfter = after.devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");

  assert.equal(pumpDuring.status, "DEGRADED");
  assert.equal(pumpDuring.latencyMs, 750);
  assert.equal(pumpDuring.clockOffsetMs, 42);
  assert.equal(pumpAfter.status, "CONNECTED");
  assert.equal(pumpAfter.latencyMs, 80);
});

test("UC01 adapter binds physiologic values, device sources, timeline, and recent quality events", () => {
  const snapshot = snapshotAt(10, 2, 1);
  const baseState = {
    observations: [], phases: [], checklistSections: [], recentEvents: [], dataIntegrity: undefined,
    deviceStatus: { batteryPercent: 0, isAcConnected: true, batterySegments: 0, networkConnected: true, externalDisplayActive: false, telemetrySynced: true, systemTime: "", systemDate: "" },
    situationAwareness: {
      hemodynamicStatus: { status: "Stable", details: "" },
      anesthesiaDepth: { status: "Adequate", bisValue: 0, targetRange: "" },
      surgicalProgress: { status: "On track", phaseDetail: "" },
      predictedRisk: { riskLevel: "Low", primaryRisk: "", modelName: "", horizonMinutes: 0, probabilityPercent: 0, confidence: "Low", dataCoveragePercent: 0, missingSignals: [], isModelEstimate: true },
    },
  };
  const adapted = simulation.adaptUc01Snapshot(snapshot, baseState);

  assert.equal(adapted.observations.find((item) => item.parameter === "ETCO2").value, null);
  assert.ok(adapted.dataIntegrity.deviceSources.some((device) => device.name === "Patient Monitor"));
  assert.equal(adapted.dataIntegrity.clockSync.monitorOffset, "+8 ms");
  assert.ok(adapted.recentEvents.some((event) => event.time === "10:02" && /EtCO2/i.test(`${event.event} ${event.details}`)));
  assert.equal(adapted.simulationTime, elapsed(10, 2, 1));
});

test("UC01 exposes the four requested acquisition events at their replay times", () => {
  const cases = [
    [9, 14, "BIS degraded", "BIS", "DEGRADED"],
    [9, 42, "MAP artifact", "MAP", "INVALIDATED_ARTIFACT"],
    [10, 2, "EtCO₂ dropout", "ETCO2", "TECHNICAL_DROPOUT"],
    [10, 18, "Pump latency high", "PUMP_GATEWAY", "DEGRADED"],
  ];

  for (const [hour, minute, eventTitle, signal, quality] of cases) {
    const snapshot = snapshotAt(hour, minute, 1);
    const uc01 = simulation.runUc01Engine(snapshot);
    const adapted = simulation.adaptUc01Snapshot(snapshot, {
      observations: [], phases: [], checklistSections: [], recentEvents: [], dataIntegrity: undefined,
      deviceStatus: { batteryPercent: 0, isAcConnected: true, batterySegments: 0, networkConnected: true, externalDisplayActive: false, telemetrySynced: true, systemTime: "", systemDate: "" },
      situationAwareness: {
        hemodynamicStatus: { status: "Stable", details: "" },
        anesthesiaDepth: { status: "Adequate", bisValue: 0, targetRange: "" },
        surgicalProgress: { status: "On track", phaseDetail: "" },
        predictedRisk: { riskLevel: "Low", primaryRisk: "", modelName: "", horizonMinutes: 0, probabilityPercent: 0, confidence: "Low", dataCoveragePercent: 0, missingSignals: [], isModelEstimate: true },
      },
    });

    assert.ok(adapted.recentEvents.some((event) => event.time === `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` && event.event === eventTitle));
    if (signal === "PUMP_GATEWAY") {
      const pump = uc01.devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");
      const pumpSource = adapted.dataIntegrity.deviceSources.find((device) => device.name === "Infusion Pump Gateway");
      assert.equal(pump.status, "DEGRADED");
      assert.equal(pump.latencyMs, 750);
      assert.equal(pumpSource.status, "DEGRADED");
      assert.equal(pumpSource.latencyMs, 750);
    } else {
      assert.equal(uc01.signals.find((item) => item.signal === signal).quality, quality);
      assert.equal(adapted.dataIntegrity.signals.find((item) => item.signalId === `sig-${signal.toLowerCase()}`).qualityState, quality);
    }
  }
});

test("UC01 starts from recorded baseline observations and preserves five device clock offsets", () => {
  const snapshot = snapshotAt(7, 15);
  const uc01 = simulation.runUc01Engine(snapshot);
  const offsets = Object.fromEntries(uc01.devices.map((device) => [device.kind, device.clockOffsetMs]));

  assert.equal(uc01.devices.length, 5);
  assert.deepEqual(offsets, {
    PATIENT_MONITOR: 8,
    ANESTHESIA_MACHINE: -19,
    BIS_MONITOR: 8,
    INFUSION_PUMP_GATEWAY: 42,
    VENTILATOR: -19,
  });
  assert.ok(uc01.signals.find((item) => item.signal === "MAP").value !== null);
  assert.ok(uc01.devices.every((device) => device.lastMessageAt !== null));
});

test("UC01 engine applies explicit device disconnect and reconnect events", () => {
  const simulationCase = simulation.createFullCase();
  simulationCase.events.push(
    { id: "test-pump-disconnect", eventTime: 1_000, recordedTime: 1_000, source: "infusion-pump-or2", sourceType: "DEVICE", eventType: "DEVICE_DISCONNECTED", payload: { reason: "synthetic link interruption" }, provenance: "DIRECT" },
    { id: "test-pump-reconnect", eventTime: 2_000, recordedTime: 2_000, source: "infusion-pump-or2", sourceType: "DEVICE", eventType: "DEVICE_CONNECTED", payload: { latencyMs: 92 }, provenance: "DIRECT" }
  );
  const engine = new simulation.SimulationEngine(simulationCase);

  const disconnected = simulation.runUc01Engine(engine.seek(1_000).snapshot)
    .devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");
  const reconnected = simulation.runUc01Engine(engine.seek(2_000).snapshot)
    .devices.find((device) => device.kind === "INFUSION_PUMP_GATEWAY");

  assert.equal(disconnected.status, "DISCONNECTED");
  assert.equal(reconnected.status, "CONNECTED");
  assert.equal(reconnected.latencyMs, 92);
});

test("UC01 exposes only due synthetic predictions and keeps baseline risk low", () => {
  const baseState = {
    observations: [], phases: [], checklistSections: [], recentEvents: [], dataIntegrity: undefined,
    deviceStatus: { batteryPercent: 0, isAcConnected: true, batterySegments: 0, networkConnected: true, externalDisplayActive: false, telemetrySynced: true, systemTime: "", systemDate: "" },
    situationAwareness: {
      hemodynamicStatus: { status: "Stable", details: "" },
      anesthesiaDepth: { status: "Adequate", bisValue: 0, targetRange: "" },
      surgicalProgress: { status: "On track", phaseDetail: "Static future text that must not leak." },
      predictedRisk: { riskLevel: "High", primaryRisk: "Static future risk", modelName: "static", horizonMinutes: 5, probabilityPercent: 99, confidence: "High", dataCoveragePercent: 99, missingSignals: [], isModelEstimate: true },
    },
  };
  const beforeModelSnapshot = snapshotAt(10, 0);
  const beforeModelEvent = simulation.adaptUc01Snapshot(beforeModelSnapshot, baseState);
  const afterFirstModelEvent = simulation.adaptUc01Snapshot(snapshotAt(10, 23, 1), baseState);

  assert.equal(beforeModelEvent.situationAwareness.predictedRisk.available, true);
  assert.equal(beforeModelEvent.situationAwareness.predictedRisk.riskLevel, "Low");
  assert.equal(beforeModelEvent.situationAwareness.predictedRisk.probabilityPercent, 8);
  assert.equal(beforeModelEvent.situationAwareness.predictedRisk.modelName, "SAFEANES-DEMO-HPI");
  assert.ok(beforeModelSnapshot.predictions.every((prediction) => prediction.timestamp <= beforeModelSnapshot.simulationTime));
  assert.match(beforeModelEvent.situationAwareness.surgicalProgress.phaseDetail, /Surgery/);
  assert.doesNotMatch(beforeModelEvent.situationAwareness.surgicalProgress.phaseDetail, /Static future/);
  assert.equal(afterFirstModelEvent.situationAwareness.predictedRisk.available, true);
  assert.equal(afterFirstModelEvent.situationAwareness.predictedRisk.horizonMinutes, 1);
  assert.equal(afterFirstModelEvent.situationAwareness.predictedRisk.probabilityPercent, 8);
  assert.equal(afterFirstModelEvent.situationAwareness.predictedRisk.modelName, "SAFEANES-DEMO-HPI");
});
