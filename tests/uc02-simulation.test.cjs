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
const { getCrossModuleLinksForClaim } = require(path.join(__dirname, "..", "src", "utils", "clinicalNavigation.ts"));
const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;

test("UC02 record is projected from canonical events and reveals claims only when due", () => {
  const engine = new simulation.SimulationEngine(simulation.createFullCase());

  const atNine = simulation.adaptUc02(engine.seek(at(9, 0)).snapshot);
  assert.equal(atNine.caseId, "SAFE-DEMO-001");
  assert.equal(atNine.claims.length, 0);
  assert.ok(atNine.events.some((event) => event.id === "airway-secured"));
  assert.ok(!atNine.events.some((event) => event.id === "medication-phenylephrine-rescue"));

  const atTenThirtyFive = simulation.adaptUc02(engine.seek(at(10, 35)).snapshot);
  assert.ok(atTenThirtyFive.claims.some((claim) => claim.id === "claim-low-map-episode"));
  assert.ok(atTenThirtyFive.claims.some((claim) => claim.id === "claim-hemodynamic-improvement-after-phenylephrine"));
  assert.ok(!atTenThirtyFive.claims.some((claim) => claim.id === "claim-respiratory-no-breath"));
  assert.equal(atTenThirtyFive.claims.find((claim) => claim.id === "claim-hemodynamic-improvement-after-phenylephrine").reviewStatus, "REQUIRES_REVIEW");

  const oneSecondBeforeRespiratoryClaim = simulation.adaptUc02(engine.seek(at(10, 53) - 1).snapshot);
  assert.ok(!oneSecondBeforeRespiratoryClaim.claims.some((claim) => claim.id === "claim-respiratory-no-breath"));

  const atTenFiftyThreeSnapshot = engine.seek(at(10, 53)).snapshot;
  const atTenFiftyThree = simulation.adaptUc02(atTenFiftyThreeSnapshot);
  assert.ok(atTenFiftyThree.claims.some((claim) => claim.id === "claim-respiratory-no-breath"));
  assert.equal(atTenFiftyThree.events.some((event) => event.id.startsWith("evt_")), false);
  assert.equal(
    atTenFiftyThree.claims.find((claim) => claim.id === "claim-respiratory-no-breath").deviceQuality[0].signalQuality,
    "GOOD",
  );
  assert.match(
    simulation.adaptUc02(atTenFiftyThreeSnapshot, "vi").claims.find((claim) => claim.id === "claim-respiratory-no-breath").text,
    /Phát hiện khoảng không có nhịp thở/i,
  );
  const respiratoryLink = getCrossModuleLinksForClaim(
    atTenFiftyThree.claims.find((claim) => claim.id === "claim-respiratory-no-breath"),
  ).find((link) => link.targetModule === "UC05");
  assert.match(respiratoryLink.url, /time=10%3A52%3A01/);
  assert.match(respiratoryLink.url, /event=respiratory-no-breath-detected/);
});

test("canonical claims carry deterministic validation and exact evidence identity", () => {
  const caseDefinition = simulation.createFullCase();
  const engine = new simulation.SimulationEngine(caseDefinition);
  const snapshot = engine.seek(at(10, 53) + 200).snapshot;

  for (const claim of snapshot.recordClaims) {
    assert.ok(claim.clinicalTime, `${claim.id} has clinicalTime`);
    assert.ok(claim.derivation, `${claim.id} has derivation metadata`);
    assert.ok(claim.validation, `${claim.id} has deterministic validation`);
    assert.ok(claim.evidenceRefs.length > 0, `${claim.id} has evidence references`);
    assert.ok(Object.values(claim.validation).every(Boolean), `${claim.id} validates`);
  }

  const administration = snapshot.recordClaims.find((claim) => claim.id === "claim-phenylephrine-administration");
  assert.equal(administration.conceptId, "MEDICATION_ADMINISTRATION");
  assert.deepEqual(administration.eventRefs, ["medication-phenylephrine-rescue"]);
});

test("temporal relationship helper supports point and interval relations without causality", () => {
  const { getTemporalRelationship } = simulation;
  const point = (id, time) => ({ id, eventTime: time, eventType: "POINT", payload: {}, source: "test", sourceType: "SYSTEM", provenance: "DIRECT" });
  const intervalStart = { ...point("interval", 10), eventType: "EPISODE_DETECTED", payload: { episodeId: "episode" } };
  const intervalEnd = { ...point("interval-end", 20), eventType: "EPISODE_RESOLVED", payload: { episodeId: "episode" } };
  const events = [intervalStart, intervalEnd];

  assert.equal(getTemporalRelationship(point("before", 5), point("after", 7), []), "BEFORE");
  assert.equal(getTemporalRelationship(point("after", 7), point("before", 5), []), "AFTER");
  assert.equal(getTemporalRelationship(point("same-a", 5), point("same-b", 5), []), "CO_OCCURS_WITH");
  assert.equal(getTemporalRelationship(point("inside", 15), intervalStart, events), "DURING");
  assert.equal(getTemporalRelationship({ ...point("contained", 12), endTime: 18 }, intervalStart, events), "DURING");
  assert.equal(getTemporalRelationship({ ...point("starts", 10), endTime: 15 }, intervalStart, events), "STARTS_WITHIN");
  assert.equal(getTemporalRelationship({ ...point("ends", 15), endTime: 20 }, intervalStart, events), "ENDS_WITHIN");
  assert.equal(getTemporalRelationship({ ...point("overlap", 18), endTime: 25 }, intervalStart, events), "OVERLAPS");
});
