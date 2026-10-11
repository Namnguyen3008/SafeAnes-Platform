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
const { createFullCase, SimulationEngine, adaptUc02, adaptUc03, runUc03Engine } = simulation;
const fullCase = createFullCase();
const minute = 60_000;
const at = (hour, minuteOfHour, second = 0) =>
  ((hour * 60 + minuteOfHour) - (7 * 60 + 15)) * minute + second * 1_000;
const proposalTime = at(10, 42);

function dueEngine() {
  const engine = new SimulationEngine(fullCase);
  const snapshot = engine.seek(proposalTime + 1_000).snapshot;
  return { engine, snapshot };
}

function actionEvent(id, eventType, payload, eventTime) {
  return {
    id,
    eventTime,
    recordedTime: eventTime,
    source: "uc03-demo-action",
    sourceType: "MANUAL",
    eventType,
    payload: { synthetic: true, clinicalUse: false, ...payload },
    provenance: "DIRECT",
  };
}

function dispatchAt(engine, event) {
  engine.seek(event.eventTime);
  return engine.dispatchEvent(event);
}

test("UC03 rule stays hidden until the proposed medication is due", () => {
  assert.equal(fullCase.alerts.some((alert) => alert.sourceModule === "UC03"), false);
  const engine = new SimulationEngine(fullCase);
  const before = engine.seek(proposalTime - 1).snapshot;

  assert.equal(before.medications.some((medication) => medication.id === "med-ketorolac-proposal"), false);
  assert.equal(before.alerts.some((alert) => alert.sourceModule === "UC03"), false);
  assert.equal(adaptUc03(before).medications.some((medication) => medication.id === "med-ketorolac-proposal"), false);
  assert.equal(adaptUc03(before).alerts.length, 0);

  const after = engine.seek(proposalTime + 1_000).snapshot;
  assert.equal(after.medications.find((medication) => medication.id === "med-ketorolac-proposal").status, "PROPOSED");
  assert.equal(after.alerts.filter((alert) => alert.sourceModule === "UC03").length, 1);
  assert.equal(adaptUc03(after).alerts[0].severity, "HIGH");
  assert.equal(adaptUc03(after).alerts[0].rule.id, "DEMO-MED-001");
});

test("UC03 alert explains its synthetic rule and exact patient context", () => {
  const { snapshot } = dueEngine();
  const alert = snapshot.alerts.find((item) => item.sourceModule === "UC03");

  assert.ok(alert);
  assert.equal(alert.alertId, alert.id);
  assert.equal(alert.severity, "HIGH");
  assert.equal(alert.firstTriggerTime, proposalTime);
  assert.equal(alert.status, "ACTIVE");
  assert.match(alert.why, /synthetic|demo/i);
  assert.deepEqual(alert.triggeringPatientData.map((item) => [item.key, item.value]), [
    ["ageYears", 67],
    ["weightKg", 58],
    ["asa", "III"],
  ]);
  assert.equal(alert.rule.id, "DEMO-MED-001");
  assert.equal(alert.rule.version, "1.0.0");
  assert.equal(alert.rule.effectiveDate, "2026-10-07");
  assert.equal(alert.rule.evidenceSource, "SafeAnes Synthetic Demo Knowledge Base");
  assert.equal(alert.rule.clinicalUse, false);
  assert.ok(alert.recommendedActionReference);
  assert.equal(alert.suppressionReason, null);
  assert.deepEqual(simulation.UC03_DEMO_RULES.map((rule) => rule.id), ["DEMO-MED-001", "DEMO-MED-002"]);
  assert.ok(simulation.UC03_DEMO_RULES.every((rule) => rule.clinicalUse === false));
});

test("repeated evaluation updates one unresolved alert and records suppression", () => {
  const { engine, snapshot } = dueEngine();
  const proposal = fullCase.events.find((event) => event.id === "medication-ketorolac-proposed");
  const duplicate = {
    ...proposal,
    id: "medication-ketorolac-proposed-repeat",
    eventTime: proposalTime + 2_000,
    recordedTime: proposalTime + 2_000,
  };

  const repeated = dispatchAt(engine, duplicate);

  assert.equal(repeated.alerts.filter((alert) => alert.sourceModule === "UC03").length, 1);
  assert.equal(repeated.alerts.find((alert) => alert.sourceModule === "UC03").id, snapshot.alerts.find((alert) => alert.sourceModule === "UC03").id);
  assert.match(repeated.alerts.find((alert) => alert.sourceModule === "UC03").suppressionReason, /duplicate|same exposure/i);
});

test("severity escalation updates the existing alert immediately", () => {
  const { snapshot } = dueEngine();
  const alert = snapshot.alerts.find((item) => item.sourceModule === "UC03");
  alert.severity = "LOW";
  const proposal = fullCase.events.find((event) => event.id === "medication-ketorolac-proposed");
  const result = runUc03Engine({
    event: { ...proposal, id: "escalation-evaluation", eventTime: proposalTime + 2_000, recordedTime: proposalTime + 2_000 },
    simulationTime: proposalTime + 2_000,
    snapshot,
    caseInfo: {
      scenarioId: snapshot.scenarioId,
      seed: snapshot.seed,
      simulationMetadata: snapshot.simulationMetadata,
      patient: snapshot.patient,
      encounter: snapshot.encounter,
      procedure: snapshot.procedure,
    },
  });

  assert.equal(result.alertsCreated?.length ?? 0, 0);
  assert.equal(result.alertsUpdated?.[0]?.severity, "HIGH");
});

test("Modify changes the proposal and resolves the alert without recording administration", () => {
  const { engine } = dueEngine();
  const actionTime = proposalTime + 2_000;
  const snapshot = dispatchAt(engine, actionEvent("demo-modify-1", "MEDICATION_PROPOSAL_MODIFIED", {
    medicationId: "med-ketorolac-proposal",
    dose: 24,
    doseUnit: "mg",
    route: "IV",
    alertId: "alert-medication-safety-demo",
  }, actionTime));
  const proposal = snapshot.medications.find((item) => item.id === "med-ketorolac-proposal");
  const alert = snapshot.alerts.find((item) => item.sourceModule === "UC03");

  assert.equal(proposal.dose, 24);
  assert.equal(proposal.status, "PROPOSED");
  assert.equal(alert.status, "RESOLVED");
  assert.equal(snapshot.events.some((event) => event.eventType === "MEDICATION_ADMINISTERED" && event.payload.medicationId === proposal.id), false);
  assert.equal(adaptUc02(snapshot).evidenceEvents.filter((event) => event.id === "demo-modify-1").length, 1);
});

test("Override stores reason, event time, and OVERRIDDEN status while preserving history", () => {
  const { engine } = dueEngine();
  const actionTime = proposalTime + 3_000;
  const snapshot = dispatchAt(engine, actionEvent("demo-override-1", "MEDICATION_DEMO_ALERT_OVERRIDDEN", {
    medicationId: "med-ketorolac-proposal",
    alertId: "alert-medication-safety-demo",
    reason: "Demonstration workflow choice",
    comment: "Synthetic override test",
    timestamp: actionTime,
    status: "OVERRIDDEN",
  }, actionTime));
  const alert = snapshot.alerts.find((item) => item.sourceModule === "UC03");

  assert.equal(alert.status, "OVERRIDDEN");
  assert.equal(alert.override.reason, "Demonstration workflow choice");
  assert.equal(alert.override.timestamp, actionTime);
  assert.equal(alert.override.status, "OVERRIDDEN");
  assert.equal(snapshot.events.filter((event) => event.id === "demo-override-1").length, 1);
  assert.ok(adaptUc02(snapshot).evidenceEvents.some((event) => event.id === "demo-override-1"));
});

test("Continue without decision is audited and leaves the alert active", () => {
  const { engine } = dueEngine();
  const actionTime = proposalTime + 4_000;
  const snapshot = dispatchAt(engine, actionEvent("demo-continue-1", "MEDICATION_DEMO_REVIEW_CONTINUED", {
    medicationId: "med-ketorolac-proposal",
    alertId: "alert-medication-safety-demo",
    decision: "NONE",
  }, actionTime));

  assert.equal(snapshot.alerts.find((item) => item.sourceModule === "UC03").status, "ACTIVE");
  assert.equal(snapshot.alerts.find((item) => item.sourceModule === "UC03").action, "Continued without decision");
  assert.match(snapshot.alerts.find((item) => item.sourceModule === "UC03").message, /no clinician decision recorded/i);
  assert.equal(snapshot.events.find((event) => event.id === "demo-continue-1").payload.decision, "NONE");
  assert.ok(snapshot.auditEntries.some((entry) => entry.eventId === "demo-continue-1"));
});

test("resolved exposure can recur after the refractory interval as a new alert", () => {
  const { engine } = dueEngine();
  const firstAlertId = engine.getSnapshot().alerts.find((item) => item.sourceModule === "UC03").id;
  const resolvedAt = proposalTime + 2_000;
  dispatchAt(engine, actionEvent("demo-modify-resolve", "MEDICATION_PROPOSAL_MODIFIED", {
    medicationId: "med-ketorolac-proposal",
    dose: 24,
    doseUnit: "mg",
    route: "IV",
    alertId: firstAlertId,
  }, resolvedAt));
  const repeatAt = resolvedAt + simulation.UC03_RULE_DEDUP_REFRACTORY_MS + 1;
  const proposal = fullCase.events.find((event) => event.id === "medication-ketorolac-proposed");
  const repeated = dispatchAt(engine, {
    ...proposal,
    id: "medication-ketorolac-proposed-recurrence",
    eventTime: repeatAt,
    recordedTime: repeatAt,
  });
  const medicationAlerts = repeated.alerts.filter((item) => item.sourceModule === "UC03");

  assert.equal(medicationAlerts.length, 2);
  assert.equal(medicationAlerts.find((item) => item.id === firstAlertId).status, "RESOLVED");
  assert.equal(medicationAlerts.find((item) => item.id !== firstAlertId).status, "ACTIVE");
});

test("canonical medication events project one history across UC02 and UC03", () => {
  const engine = new SimulationEngine(fullCase);
  const snapshot = engine.seek(at(10, 33) + 1_000).snapshot;
  const administeredEvent = snapshot.events.filter((event) => event.id === "medication-phenylephrine-rescue");

  assert.equal(administeredEvent.length, 1);
  assert.equal(adaptUc02(snapshot).evidenceEvents.filter((event) => event.id === "medication-phenylephrine-rescue").length, 1);
  assert.equal(adaptUc03(snapshot).medications.filter((medication) => medication.id === "med-phenylephrine").length, 1);
  assert.equal(adaptUc03(snapshot).medicationEvents.filter((event) => event.id === "medication-phenylephrine-rescue").length, 1);
});

test("medication temporal states distinguish order, proposal, administration, rate changes, and stop", () => {
  const engine = new SimulationEngine(fullCase);
  const actionBase = 62_000;
  let snapshot = dispatchAt(engine, actionEvent("med-order", "MEDICATION_ORDERED", {
    medicationId: "demo-infusion",
    name: "Demo infusion",
    dose: 1,
    doseUnit: "mg",
    route: "IV",
  }, actionBase));
  assert.equal(snapshot.medications.find((item) => item.id === "demo-infusion").status, "ORDERED");
  snapshot = dispatchAt(engine, actionEvent("med-infusion-start", "MEDICATION_INFUSION_STARTED", {
    medicationId: "demo-infusion",
    name: "Demo infusion",
    rate: 1,
    rateUnit: "mg/h",
  }, actionBase + 100));
  assert.equal(snapshot.medications.find((item) => item.id === "demo-infusion").status, "INFUSING");
  snapshot = dispatchAt(engine, actionEvent("med-rate-change", "MEDICATION_RATE_CHANGED", {
    medicationId: "demo-infusion",
    rate: 2,
    rateUnit: "mg/h",
  }, actionBase + 200));
  assert.equal(snapshot.medications.find((item) => item.id === "demo-infusion").status, "RATE_CHANGED");
  assert.equal(snapshot.medications.find((item) => item.id === "demo-infusion").rate, 2);
  snapshot = dispatchAt(engine, actionEvent("med-stop", "MEDICATION_STOPPED", {
    medicationId: "demo-infusion",
  }, actionBase + 300));
  assert.equal(snapshot.medications.find((item) => item.id === "demo-infusion").status, "STOPPED");
});
