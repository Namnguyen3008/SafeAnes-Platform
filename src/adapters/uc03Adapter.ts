/**
 * SafeAnes UC03 Frontend Adapter
 * Architecture: SafeAnes API → frontend adapter → UC03 typed model → UI components
 */

import {
  PatientContext,
  MedicationState,
  MedicationAlert,
  MedicationProposal,
  MedicationTimelineEvent,
  MedicationRiskSummaryItem,
  MedicationValueRow,
} from "@/types/uc03";

export interface UC03CaseViewModel {
  patient: PatientContext;
  medications: MedicationState[];
  alerts: MedicationAlert[];
  proposal: MedicationProposal;
  riskSummary: MedicationRiskSummaryItem[];
  recentValues: MedicationValueRow[];
  timelineEvents: MedicationTimelineEvent[];
}

import type { SimulationAlert, SimulationEvent, SimulationSnapshot } from "@/simulation";
import { formatCaseTime } from "@/simulation/formatTime";

/** Projects only replay-visible canonical medication records into UC03. */
export function getUC03SimulationViewModel(snapshot: SimulationSnapshot): UC03CaseViewModel {
  const medicationRecords = snapshot.medications;
  const activeProposal = [...medicationRecords]
    .filter((medication) => medication.status === "PROPOSED")
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const uc03Alerts = snapshot.alerts
    .filter((alert) => alert.sourceModule === "UC03")
    .sort((left, right) => right.eventTime - left.eventTime);

  const patient: PatientContext = {
    id: snapshot.patient.patientId,
    ageYears: snapshot.patient.ageYears,
    sex: snapshot.patient.sex === "Unknown" ? "Other" : snapshot.patient.sex,
    weightKg: snapshot.patient.weightKg,
    bmi: null,
    asaStatus: ("ASA " + snapshot.patient.asa) as PatientContext["asaStatus"],
    procedure: snapshot.procedure.name,
    room: snapshot.procedure.operatingRoom,
    anesthesiaType: snapshot.procedure.anesthesia,
    allergies: snapshot.patient.allergies.map((allergy) => ({
      substance: allergy.substance,
      reaction: allergy.reaction,
      severity: allergy.severity,
    })),
    renalFunction: {
      crClMlMin: null,
      serumCreatinineMgDl: null,
      staging: "Not assessed in the synthetic case",
      thresholdMlMin: null,
      crClDirection: "UNKNOWN",
      creatinineDirection: "UNKNOWN",
    },
    liverFunction: {
      astUl: null,
      altUl: null,
      status: "Not assessed",
    },
  };

  const proposal: MedicationProposal = activeProposal
    ? {
        id: activeProposal.id,
        medicationId: activeProposal.id,
        genericName: activeProposal.name,
        indication: activeProposal.indication,
        dose: activeProposal.dose,
        doseUnit: activeProposal.doseUnit,
        route: activeProposal.route,
        givenOverMin: 0,
        plannedTime: displayCaseTime(snapshot, activeProposal.eventTime),
        comment: activeProposal.indication,
        recommendedDoseMin: null,
        recommendedDoseMax: null,
        recommendedDoseText: "No clinical recommendation",
        maxDailyCeilingMg: null,
        standardCeilingMg: null,
      }
    : {
        id: "",
        medicationId: "",
        genericName: "",
        indication: "",
        dose: 0,
        doseUnit: "",
        route: "",
        givenOverMin: 0,
        plannedTime: "",
        comment: "",
        recommendedDoseMin: null,
        recommendedDoseMax: null,
        recommendedDoseText: "No active proposal",
        maxDailyCeilingMg: null,
        standardCeilingMg: null,
      };

  const medications: MedicationState[] = medicationRecords.map((medication, index) => ({
    id: medication.id,
    name: medication.name,
    indication: medication.indication,
    status: toMedicationStateStatus(medication.status),
    dose: medication.dose,
    doseUnit: medication.doseUnit,
    rate: medication.rate,
    rateUnit: medication.rateUnit,
    route: medication.route,
    statusDetail: displayCaseTime(snapshot, medication.eventTime),
    colorBar: medicationColor(index),
    timelineTrack: index,
  }));

  const alerts: MedicationAlert[] = uc03Alerts.map((alert) => mapSimulationAlert(alert, snapshot));
  const timelineEvents: MedicationTimelineEvent[] = snapshot.events
    .map((event) => mapMedicationTimelineEvent(event, snapshot))
    .filter((event): event is MedicationTimelineEvent => event !== null);
  const recentValues: MedicationValueRow[] = snapshot.events
    .filter((event) => [
      "MEDICATION_ORDERED",
      "MEDICATION_PROPOSED",
      "MEDICATION_PROPOSAL_MODIFIED",
      "MEDICATION_ADMINISTERED",
      "MEDICATION_INFUSION_STARTED",
      "MEDICATION_RATE_CHANGED",
      "MEDICATION_STOPPED",
    ].includes(event.eventType))
    .map((event) => {
      const payload = eventPayload(event);
      const medication = medicationRecords.find((item) => item.id === payload.medicationId);
      const isInfusion = event.eventType.includes("INFUSION") || event.eventType.includes("RATE");
      return {
        id: event.id,
        medId: typeof payload.medicationId === "string" ? payload.medicationId : event.id,
        time: displayCaseTime(snapshot, event.eventTime),
        drug: medication?.name ?? (typeof payload.name === "string" ? payload.name : "Medication"),
        doseRate: typeof payload.rate === "number"
          ? String(payload.rate) + " " + (typeof payload.rateUnit === "string" ? payload.rateUnit : "")
          : typeof payload.dose === "number"
            ? String(payload.dose) + " " + (typeof payload.doseUnit === "string" ? payload.doseUnit : "")
            : "—",
        route: typeof payload.route === "string" ? payload.route : "—",
        status: medicationValueStatus(event.eventType, isInfusion),
      };
    })
    .reverse();

  const activeAlert = uc03Alerts.find((alert) => alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED");
  return {
    patient,
    medications,
    alerts,
    proposal,
    riskSummary: [{
      id: "demo-review",
      category: "Synthetic medication workflow review",
      count: activeAlert ? 1 : 0,
      severity: activeAlert ? "HIGH" : "NONE",
      statusText: activeAlert ? "Demo review active" : "No active demo review",
    }],
    recentValues,
    timelineEvents,
  };
}

function mapSimulationAlert(alert: SimulationAlert, snapshot: SimulationSnapshot): MedicationAlert {
  const severity: MedicationAlert["severity"] = alert.severity === "CRITICAL" || alert.severity === "HIGH"
    ? alert.severity
    : alert.severity === "MEDIUM"
      ? "ADVISORY"
      : "MONITORING";
  const timestamp = displayCaseTime(snapshot, alert.firstTriggerTime ?? alert.eventTime);
  const triggeringPatientData = (alert.triggeringPatientData ?? []).map((item) => ({
    name: item.label,
    value: String(item.value) + (item.unit ? " " + item.unit : ""),
  }));
  return {
    id: alert.id,
    severity,
    title: alert.title,
    subtitle: alert.ruleLabel,
    why: [alert.why ?? alert.message],
    medicationId: alert.medicationId ?? "",
    proposedDoseText: alert.proposedDoseText,
    triggeringPatientData,
    rule: {
      id: alert.rule?.id ?? alert.ruleId ?? "—",
      version: alert.rule?.version ?? "—",
      source: alert.rule?.evidenceSource ?? "—",
    },
    status: alert.status,
    timestamp,
    time: timestamp,
    priority: alert.severity === "HIGH" || alert.severity === "CRITICAL" ? "High" : "Info",
    alert: alert.title,
    action: alert.action ?? alert.status,
    value: alert.value ?? "—",
    metric: alert.suppressionReason ?? undefined,
    details: alert.override
      ? alert.message + " Demo override: " + alert.override.reason + "."
      : alert.message,
    isRedAlert: alert.status === "ACTIVE",
  };
}

function mapMedicationTimelineEvent(event: SimulationEvent, snapshot: SimulationSnapshot): MedicationTimelineEvent | null {
  const type = event.eventType === "MEDICATION_ORDERED"
    ? "ORDERED"
    : event.eventType === "MEDICATION_ADMINISTERED"
    ? "BOLUS"
    : event.eventType === "MEDICATION_INFUSION_STARTED"
      ? "INFUSION_START"
      : event.eventType === "MEDICATION_RATE_CHANGED"
        ? "RATE_CHANGE"
        : event.eventType === "MEDICATION_STOPPED"
          ? "INFUSION_STOP"
          : event.eventType === "MEDICATION_PROPOSED" || event.eventType === "MEDICATION_PROPOSAL_MODIFIED"
            ? "PROPOSED"
            : null;
  if (!type) return null;
  const payload = eventPayload(event);
  return {
    id: event.id,
    medicationId: typeof payload.medicationId === "string" ? payload.medicationId : event.id,
    timestamp: displayCaseTime(snapshot, event.eventTime),
    eventTime: event.eventTime,
    eventType: type,
    value: typeof payload.rate === "number" ? payload.rate : typeof payload.dose === "number" ? payload.dose : undefined,
    unit: typeof payload.rateUnit === "string" ? payload.rateUnit : typeof payload.doseUnit === "string" ? payload.doseUnit : undefined,
    label: typeof payload.name === "string" ? payload.name : undefined,
    secondaryText: event.provenance,
  };
}

function eventPayload(event: SimulationEvent): Record<string, unknown> {
  return event.payload !== null && typeof event.payload === "object"
    ? event.payload as Record<string, unknown>
    : {};
}

function displayCaseTime(snapshot: SimulationSnapshot, eventTime: number): string {
  const value = formatCaseTime(snapshot.encounter.startedAt, eventTime);
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const suffix = hours >= 12 ? "PM" : "AM";
  return String(hours % 12 || 12).padStart(2, "0") + ":" + rawMinutes + " " + suffix;
}

function medicationColor(index: number): string {
  return ["bg-[#30E96B]", "bg-[#19BDF2]", "bg-[#A855F7]", "bg-[#FFD828]", "bg-[#FF334D]"][index % 5];
}

function toMedicationStateStatus(status: SimulationSnapshot["medications"][number]["status"]): MedicationState["status"] {
  if (status === "SCHEDULED" || status === "HELD") return "PENDING";
  if (status === "ADMINISTERED") return "GIVEN";
  return status;
}

function medicationValueStatus(eventType: string, isInfusion: boolean): MedicationValueRow["status"] {
  if (eventType === "MEDICATION_ORDERED") return "Ordered";
  if (eventType === "MEDICATION_PROPOSED" || eventType === "MEDICATION_PROPOSAL_MODIFIED") return "Proposed";
  if (eventType === "MEDICATION_STOPPED") return "Stopped";
  if (eventType === "MEDICATION_RATE_CHANGED") return "Rate changed";
  return isInfusion ? "Infusing" : "Given";
}
