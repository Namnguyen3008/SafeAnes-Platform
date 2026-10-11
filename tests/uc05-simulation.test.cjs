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

test("UC05 scenario is synthetic, deterministic and has no preloaded future respiratory outputs", () => {
  const first = createFullCase(20261007);
  const second = createFullCase(20261007);

  assert.equal(first.scenarioManifest.respiratory.modelId, "SAFEANES-DEMO-RESP-v0.1");
  assert.equal(first.scenarioManifest.respiratory.horizonMinutes, 5);
  assert.equal(first.scenarioManifest.respiratory.clinicalUse, false);
  assert.deepEqual(first.waveforms.filter((item) => item.signal === "CAPNOGRAM" || item.signal === "PLETH"),
    second.waveforms.filter((item) => item.signal === "CAPNOGRAM" || item.signal === "PLETH"));
  assert.equal(first.predictions.some((item) => item.modelId === "SAFEANES-DEMO-RESP-v0.1"), false);
  assert.equal(first.alerts.some((item) => item.sourceModule === "UC05"), false);
  assert.equal(first.episodes.some((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE"), false);
  assert.equal(first.waveforms.some((item) => item.signal === "CAPNOGRAM" && item.eventTime === at(10, 2)), false);
});

test("replay seek publishes one completed snapshot instead of one per raw event", () => {
  const engine = new SimulationEngine(createFullCase());
  const updates = [];
  engine.subscribe((snapshot) => updates.push(snapshot.simulationTime));

  engine.seek(at(10, 2, 5));

  assert.equal(updates.length, 1);
  assert.equal(updates[0], at(10, 2, 5));
});

test("UC05 gates technical dropout and reconstructs one real respiratory episode and alert", () => {
  const engine = new SimulationEngine(createFullCase());

  const dropout = engine.seek(at(10, 2, 5)).snapshot;
  const dropoutQuality = dropout.qualityStates.find((item) =>
    item.signal === "ETCO2" && item.eventTime <= dropout.simulationTime &&
    (item.validUntilTime === undefined || item.validUntilTime > dropout.simulationTime)
  );
  assert.equal(dropoutQuality?.status, "TECHNICAL_DROPOUT");
  assert.equal(dropout.observations.some((item) => item.signal === "ETCO2" && item.eventTime >= at(10, 2)), false);
  assert.equal(dropout.episodes.some((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE"), false);
  assert.equal(dropout.alerts.some((item) => item.sourceModule === "UC05"), false);
  const dropoutPrediction = dropout.predictions
    .filter((item) => item.modelId === "SAFEANES-DEMO-RESP-v0.1")
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  assert.ok(dropoutPrediction);
  assert.ok(dropoutPrediction.missingModalities.some((item) => /EtCO2/i.test(item)));
  assert.ok(dropoutPrediction.dataCoverage < 1);
  assert.ok(dropout.predictions.every((item) => item.timestamp <= dropout.simulationTime));

  const preAlert = engine.seek(at(10, 52, 19)).snapshot;
  assert.equal(preAlert.alerts.some((item) => item.sourceModule === "UC05"), false);
  const episodes = preAlert.episodes.filter((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE");
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].status, "ACTIVE");
  assert.equal(preAlert.events.some((item) => item.id === "respiratory-no-breath-detected"), true);

  const highAlert = engine.seek(at(10, 52, 21)).snapshot;
  const alerts = highAlert.alerts.filter((item) => item.sourceModule === "UC05");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, "HIGH");
  assert.equal(alerts[0].clinicalUse, false);
  assert.match(alerts[0].safetyBoundary, /not a diagnosis/i);
  assert.equal(highAlert.episodes.filter((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE").length, 1);
  assert.ok(highAlert.predictions.every((item) => item.timestamp <= highAlert.simulationTime));

  const recovered = engine.seek(at(10, 53, 2)).snapshot;
  const resolvedEpisode = recovered.episodes.find((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE");
  assert.equal(resolvedEpisode.status, "RESOLVED");
  assert.equal(recovered.episodes.filter((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE").length, 1);
  assert.equal(recovered.alerts.filter((item) => item.sourceModule === "UC05").length, 1);

  const replayed = engine.seek(at(10, 51, 5)).snapshot;
  assert.equal(replayed.alerts.some((item) => item.sourceModule === "UC05"), false);
  assert.equal(replayed.episodes.some((item) => item.type === "RESPIRATORY_DETERIORATION_CANDIDATE"), false);
  assert.ok(replayed.predictions.every((item) => item.timestamp <= replayed.simulationTime));
});

test("UC05 risk rises before the event with a separate five-minute model estimate", () => {
  const engine = new SimulationEngine(createFullCase());
  const beforeMorphology = engine.seek(at(10, 47, 10)).snapshot;
  const afterMorphology = engine.seek(at(10, 48, 10)).snapshot;
  const afterRateDrop = engine.seek(at(10, 50, 10)).snapshot;
  const risingRisk = engine.seek(at(10, 51, 10)).snapshot;

  const latestPrediction = (snapshot) => snapshot.predictions
    .filter((item) => item.modelId === "SAFEANES-DEMO-RESP-v0.1")
    .sort((left, right) => right.timestamp - left.timestamp)[0];

  const baseline = latestPrediction(beforeMorphology);
  const morphology = latestPrediction(afterMorphology);
  const rateDrop = latestPrediction(afterRateDrop);
  const rising = latestPrediction(risingRisk);
  assert.ok(baseline && morphology && rateDrop && rising);
  assert.equal(rising.horizonMinutes, 5);
  assert.equal(rising.synthetic, true);
  assert.equal(rising.clinicalUse, false);
  assert.ok(morphology.probability >= baseline.probability);
  assert.ok(rateDrop.probability > morphology.probability);
  assert.ok(rising.probability > rateDrop.probability);
  assert.ok(rising.confidence > 0 && rising.confidence <= 1);
  assert.ok(rising.dataCoverage > 0 && rising.dataCoverage <= 1);
  assert.equal(rising.output.label, "DEMO ONLY — not clinically validated");
});

