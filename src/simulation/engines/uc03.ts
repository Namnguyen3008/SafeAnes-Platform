import type { SimulationAlert, SyntheticMedicationRule } from "../types/alerts";
import type { SimulationEvent } from "../types/events";
import type { SimulationProcessingContext, SimulationStageResult } from "../types/replay";

export const UC03_RULE_DEDUP_REFRACTORY_MS = 5 * 60_000;
const DEMO_RULE_EFFECTIVE_DATE = "2026-10-07";
const DEMO_EVIDENCE_SOURCE = "SafeAnes Synthetic Demo Knowledge Base" as const;

export const UC03_DEMO_RULES: readonly SyntheticMedicationRule[] = Object.freeze([
  Object.freeze({
    id: "DEMO-MED-001",
    version: "1.0.0",
    effectiveDate: DEMO_RULE_EFFECTIVE_DATE,
    severity: "HIGH" as const,
    description:
      "Raises a review prompt for a proposal explicitly tagged as a demonstration exposure. It does not assess dose, suitability, interaction, or clinical risk.",
    evidenceSource: DEMO_EVIDENCE_SOURCE,
    clinicalUse: false as const,
  }),
  Object.freeze({
    id: "DEMO-MED-002",
    version: "1.0.0",
    effectiveDate: DEMO_RULE_EFFECTIVE_DATE,
    severity: "INFO" as const,
    description:
      "Suppresses repeated evaluation of the same unresolved demonstration exposure into its existing alert.",
    evidenceSource: DEMO_EVIDENCE_SOURCE,
    clinicalUse: false as const,
  }),
]);

const REVIEW_RULE = UC03_DEMO_RULES[0];
const DEDUP_RULE = UC03_DEMO_RULES[1];
const SEVERITY_RANK: Record<SimulationAlert["severity"], number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Evaluates only explicit synthetic workflow markers; it never evaluates prescribing safety. */
export function runUc03Engine(context: SimulationProcessingContext): SimulationStageResult | void {
  const { event, snapshot, caseInfo, simulationTime } = context;
  const payload = asRecord(event.payload);

  if (event.eventType === "MEDICATION_PROPOSED" && payload.demoReviewRequired === true) {
    return evaluateProposal(event, payload, caseInfo.patient, snapshot.alerts, simulationTime);
  }

  if (event.eventType === "MEDICATION_PROPOSAL_MODIFIED") {
    const alert = findAlert(snapshot.alerts, payload);
    if (!alert || !isUnresolved(alert.status)) return;
    return {
      rulesTriggered: [REVIEW_RULE.id],
      alertsUpdated: [{
        ...alert,
        status: "RESOLVED",
        resolvedTime: simulationTime,
        lastEvaluatedTime: simulationTime,
        action: "Proposal modified in demo workflow",
        message: "The synthetic proposal was modified. No administration or clinical suitability decision was recorded.",
      }],
      stateChanges: ["demo-medication-alert-resolved:" + alert.id],
    };
  }

  if (event.eventType === "MEDICATION_DEMO_ALERT_OVERRIDDEN") {
    const alert = findAlert(snapshot.alerts, payload);
    if (!alert || !isUnresolved(alert.status)) return;
    const reason = typeof payload.reason === "string" ? payload.reason : "No reason supplied";
    const timestamp = typeof payload.timestamp === "number" ? payload.timestamp : simulationTime;
    return {
      rulesTriggered: [REVIEW_RULE.id],
      alertsUpdated: [{
        ...alert,
        status: "OVERRIDDEN",
        lastEvaluatedTime: simulationTime,
        action: "Demo override recorded",
        message: "A synthetic demo override was recorded; this does not represent a clinical authorization.",
        override: {
          reason,
          timestamp,
          status: "OVERRIDDEN",
          ...(typeof payload.comment === "string" && payload.comment.trim()
            ? { comment: payload.comment.trim() }
            : {}),
        },
      }],
      stateChanges: ["demo-medication-alert-overridden:" + alert.id],
    };
  }

  if (event.eventType === "MEDICATION_DEMO_REVIEW_CONTINUED") {
    const alert = findAlert(snapshot.alerts, payload);
    return {
      ...(alert && isUnresolved(alert.status)
        ? { alertsUpdated: [{
            ...alert,
            action: "Continued without decision",
            message: "The demo workflow continued with no clinician decision recorded. The alert remains active.",
            lastEvaluatedTime: simulationTime,
          }] }
        : {}),
      stateChanges: ["demo-medication-review-continued:" + String(payload.alertId ?? "unknown")],
    };
  }
}

function evaluateProposal(
  event: SimulationEvent,
  payload: Record<string, unknown>,
  patient: SimulationProcessingContext["caseInfo"]["patient"],
  alerts: SimulationAlert[],
  simulationTime: number
): SimulationStageResult {
  const medicationId = stringValue(payload.medicationId, event.id);
  const exposureId = stringValue(payload.exposureId, medicationId);
  const related = alerts
    .filter((alert) => alert.sourceModule === "UC03" && alert.ruleId === REVIEW_RULE.id && alert.exposureId === exposureId)
    .sort((left, right) => (right.firstTriggerTime ?? right.eventTime) - (left.firstTriggerTime ?? left.eventTime));
  const unresolved = related.find((alert) => isUnresolved(alert.status));

  if (unresolved) {
    const escalatedSeverity = SEVERITY_RANK[REVIEW_RULE.severity] > SEVERITY_RANK[unresolved.severity]
      ? REVIEW_RULE.severity
      : unresolved.severity;
    return {
      rulesTriggered: [DEDUP_RULE.id],
      alertsUpdated: [{
        ...unresolved,
        severity: escalatedSeverity,
        lastEvaluatedTime: simulationTime,
        suppressionReason: "Duplicate evaluation for the same unresolved exposure suppressed by " +
          DEDUP_RULE.id + " v" + DEDUP_RULE.version + ".",
      }],
      stateChanges: ["demo-medication-alert-deduplicated:" + unresolved.id],
    };
  }

  const lastResolved = related.find((alert) => alert.status === "RESOLVED" && alert.resolvedTime !== undefined);
  if (
    lastResolved?.resolvedTime !== undefined &&
    simulationTime - lastResolved.resolvedTime < UC03_RULE_DEDUP_REFRACTORY_MS
  ) {
    return {
      rulesTriggered: [DEDUP_RULE.id],
      alertsUpdated: [{
        ...lastResolved,
        lastEvaluatedTime: simulationTime,
        suppressionReason: "Recurrence suppressed within the " +
          (UC03_RULE_DEDUP_REFRACTORY_MS / 60_000) + "-minute demo refractory interval.",
      }],
      stateChanges: ["demo-medication-recurrence-suppressed:" + lastResolved.id],
    };
  }

  const id = createAlertId(exposureId, event.eventTime, related.length > 0);
  const patientData = [
    { key: "ageYears", label: "Age", value: patient.ageYears, unit: "years", source: "SYNTHETIC_CASE_CONTEXT" as const },
    { key: "weightKg", label: "Weight", value: patient.weightKg, unit: "kg", source: "SYNTHETIC_CASE_CONTEXT" as const },
    { key: "asa", label: "ASA", value: patient.asa, source: "SYNTHETIC_CASE_CONTEXT" as const },
  ];
  const medicationName = stringValue(payload.name, "Medication");
  const dose = typeof payload.dose === "number" && Number.isFinite(payload.dose)
    ? (String(payload.dose) + " " + stringValue(payload.doseUnit, "")).trim()
    : null;
  const alert: SimulationAlert = {
    id,
    alertId: id,
    code: REVIEW_RULE.id,
    title: "Synthetic medication proposal review",
    message: "Synthetic workflow review for proposed " + medicationName +
      (dose ? " (" + dose + ")" : "") + ". No prescribing guidance was evaluated.",
    severity: REVIEW_RULE.severity,
    sourceModule: "UC03",
    status: "ACTIVE",
    eventTime: event.eventTime,
    recordedTime: event.recordedTime,
    firstTriggerTime: event.eventTime,
    lastEvaluatedTime: simulationTime,
    relatedEventIds: [event.id],
    evidenceEventIds: [event.id],
    provenance: event.provenance,
    demoOnly: true,
    clinicalUse: false,
    ruleId: REVIEW_RULE.id,
    ruleLabel: "DEMO ONLY · NOT CLINICALLY VALIDATED",
    rule: REVIEW_RULE,
    why: "This synthetic proposal is explicitly marked to demonstrate the medication review workflow. The rule does not evaluate dose, indication, contraindications, or clinical risk.",
    triggeringPatientData: patientData,
    contextSnapshot: { ageYears: patient.ageYears, weightKg: patient.weightKg, asa: patient.asa },
    availableActions: ["MODIFY", "OVERRIDE"],
    recommendedActionReference: "uc03.demo-actions",
    suppressionReason: null,
    exposureId,
    safetyBoundary: "DEMO ONLY. Synthetic UI workflow demonstration; not validated clinical guidance and not for clinical use.",
    medicationId,
    proposedDoseText: dose ?? undefined,
    value: dose ?? medicationName,
    action: "Review pending",
  };

  return {
    rulesTriggered: [REVIEW_RULE.id],
    alertsCreated: [alert],
    stateChanges: ["demo-medication-alert-created:" + id],
  };
}

function findAlert(alerts: SimulationAlert[], payload: Record<string, unknown>): SimulationAlert | undefined {
  const alertId = typeof payload.alertId === "string" ? payload.alertId : undefined;
  const medicationId = typeof payload.medicationId === "string" ? payload.medicationId : undefined;
  return alerts.find((alert) =>
    alert.sourceModule === "UC03" &&
    (alertId ? alert.id === alertId : alert.medicationId === medicationId)
  );
}

function isUnresolved(status: SimulationAlert["status"]): boolean {
  return status === "ACTIVE" || status === "ACKNOWLEDGED";
}

function createAlertId(exposureId: string, eventTime: number, isRecurrence: boolean): string {
  const base = exposureId === "med-ketorolac-proposal"
    ? "alert-medication-safety-demo"
    : "alert-" + REVIEW_RULE.id.toLowerCase() + "-" + slug(exposureId);
  return isRecurrence ? base + "-recurrence-" + eventTime : base;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}
