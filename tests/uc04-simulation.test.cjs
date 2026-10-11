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

const { createFullCase, SimulationEngine, adaptUc04 } = require(
  path.join(__dirname, "..", "src", "simulation", "index.ts")
);
const activeUc04Messages = {
  en: require(path.join(__dirname, "..", "src", "messages", "en", "uc04.json")),
  vi: require(path.join(__dirname, "..", "src", "messages", "vi", "uc04.json")),
};

const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;
const near = (actual, expected, tolerance = 0.015) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);

test("UC04 active EN and VI labels identify synthetic output and provide demo disclaimers", () => {
  for (const locale of ["en", "vi"]) {
    const messages = activeUc04Messages[locale];
    assert.doesNotMatch(messages.gauge.hpiSubtitle, /Edwards|Acumen|ML model/i);
    assert.match(messages.gauge.hpiSubtitle, /demo|DEMO|mô phỏng/i);
    assert.match(messages.gauge.modelEstimateExplain, /synthetic|demo|mô phỏng/i);
    assert.match(messages.popover.disclaimer, /DEMO ONLY|CHỈ DÙNG DEMO/i);
    assert.ok(messages.simulation.noActiveAlert);
    assert.ok(messages.simulation.notClinical);
  }
});

test("UC04 full-case scenario configures the synthetic model and demo threshold", () => {
  const simulationCase = createFullCase();
  const config = simulationCase.scenarioManifest.hemodynamics;

  assert.equal(config.demoOnly, true);
  assert.equal(config.clinicalUse, false);
  assert.equal(config.hypotensionThresholdMmHg, 65);
  assert.match(config.hypotensionThresholdLabel, /DEMO ONLY/i);
  assert.equal(config.modelId, "SAFEANES-DEMO-HPI");
  assert.equal(config.modelVersion, "0.1-demo");
  assert.deepEqual(config.horizonsMinutes, [1, 5, 10, 15]);
  assert.equal(simulationCase.predictions.some((prediction) => prediction.task.includes("hemodynamic")), false);
  assert.equal(simulationCase.events.some((event) => event.id.startsWith("event-prediction-hemodynamic-risk")), false);
});

test("UC04 publishes only due multi-horizon outputs with canonical input coverage", () => {
  const simulationCase = createFullCase();
  const engine = new SimulationEngine(simulationCase);
  const preEvent = engine.seek(at(10, 0) + 1_000).snapshot;
  assert.equal(preEvent.predictions.some((prediction) => prediction.modelId === "SAFEANES-DEMO-HPI"), true);
  assert.ok(preEvent.predictions.every((prediction) => prediction.timestamp <= preEvent.simulationTime));
  assert.equal(preEvent.alerts.some((alert) => alert.sourceModule === "UC04"), false);

  const atRiskOnset = engine.seek(at(10, 23) + 1_000).snapshot;
  const predictions = atRiskOnset.predictions.filter((prediction) => prediction.modelId === "SAFEANES-DEMO-HPI");
  const latestTime = Math.max(...predictions.map((prediction) => prediction.timestamp));
  const latest = predictions.filter((prediction) => prediction.timestamp === latestTime);
  assert.deepEqual(latest.map((prediction) => prediction.horizonMinutes).sort((a, b) => a - b), [1, 5, 10, 15]);
  for (const prediction of latest) {
    assert.equal(prediction.synthetic, true);
    assert.equal(prediction.clinicalUse, false);
    assert.ok(prediction.dataCoverage > 0.8);
    assert.deepEqual(prediction.missingModalities, []);
    assert.ok(prediction.inputSummary.some((input) => input.signal === "ABP"));
    assert.ok(prediction.inputSummary.some((input) => input.signal === "MAP"));
  }
  near(latest.find((prediction) => prediction.horizonMinutes === 5).probability, 0.22);
});

test("UC04 risk alert escalates as one episode, then resolves after recovery", () => {
  const engine = new SimulationEngine(createFullCase());
  const early = engine.seek(at(10, 23) + 1_000).snapshot;
  const alertId = early.alerts.find((alert) => alert.sourceModule === "UC04")?.id;
  assert.ok(alertId);
  assert.equal(early.alerts.filter((alert) => alert.sourceModule === "UC04").length, 1);
  assert.equal(early.episodes.filter((episode) => episode.type === "IMPENDING_HYPOTENSION").length, 1);

  const beforeEpisode = engine.seek(at(10, 29) + 1_000).snapshot;
  const escalating = beforeEpisode.alerts.find((alert) => alert.id === alertId);
  assert.equal(escalating.severity, "HIGH");
  near(escalating.riskProbability, 0.76);
  assert.equal(escalating.leadTimeMinutes, 2);

  const duringEpisode = engine.seek(at(10, 31) + 1_000).snapshot;
  assert.equal(duringEpisode.alerts.filter((alert) => alert.sourceModule === "UC04").length, 1);
  assert.equal(duringEpisode.alerts.find((alert) => alert.id === alertId).severity, "CRITICAL");
  assert.equal(duringEpisode.episodes.filter((episode) => episode.type === "HYPOTENSION").length, 1);

  const afterRecovery = engine.seek(at(10, 48) + 1_000).snapshot;
  const resolved = afterRecovery.alerts.find((alert) => alert.id === alertId);
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.demoOnly, true);
  assert.equal(resolved.clinicalUse, false);
  assert.equal(afterRecovery.episodes.filter((episode) => episode.type === "IMPENDING_HYPOTENSION").length, 1);
  const projected = adaptUc04(afterRecovery);
  assert.equal(projected.predictions.filter((prediction) => prediction.modelId === "SAFEANES-DEMO-HPI").length > 0, true);
  assert.equal(projected.alerts.length, 1);
});

test("UC04 low-MAP episode and phenylephrine remain temporal overlap only", () => {
  const simulationCase = createFullCase();
  const config = simulationCase.scenarioManifest.hemodynamics;
  const lowMap = simulationCase.events.find((event) => event.id === "episode-hemodynamic-low-map-detected");
  const phenylephrine = simulationCase.events.find((event) => event.id === "medication-phenylephrine-rescue");
  assert.equal(lowMap.payload.demoThresholdMmHg, config.hypotensionThresholdMmHg);
  assert.match(lowMap.payload.thresholdLabel, /DEMO ONLY/i);
  assert.equal(phenylephrine.payload.temporalRelation.relationship, "OVERLAPS");
  assert.equal(phenylephrine.payload.temporalRelation.relationship === "TREATED_BY", false);
  assert.equal(phenylephrine.payload.temporalRelation.relationship === "SUCCESSFUL_RESPONSE", false);

  const snapshot = new SimulationEngine(simulationCase).seek(at(10, 34) + 1_000).snapshot;
  assert.ok(snapshot.eventGraph.some((edge) =>
    edge.eventId === phenylephrine.id && edge.relatedEventId === lowMap.id && edge.relationship === "OVERLAPS"
  ));
  assert.equal(snapshot.eventGraph.some((edge) => /TREATED_BY|CAUSED_BY|SUCCESSFUL_RESPONSE/.test(edge.relationship)), false);
});
