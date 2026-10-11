import type { EventProvenance } from "./events";

export type AlertSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertModule = "UC01" | "UC02" | "UC03" | "UC04" | "UC05";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "OVERRIDDEN";

export interface SyntheticMedicationRule {
  id: string;
  version: string;
  effectiveDate: string;
  severity: AlertSeverity;
  description: string;
  evidenceSource: "SafeAnes Synthetic Demo Knowledge Base";
  clinicalUse: false;
}

export interface MedicationTriggerDatum {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  source: "SYNTHETIC_CASE_CONTEXT" | "CANONICAL_MEDICATION_EVENT";
}

export interface MedicationAlertOverride {
  reason: string;
  timestamp: number;
  status: "OVERRIDDEN";
  comment?: string;
}

export interface SimulationAlert {
  id: string;
  alertId?: string;
  code: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  sourceModule: AlertModule;
  status: AlertStatus;
  eventTime: number;
  recordedTime?: number;
  relatedEventIds: string[];
  evidenceEventIds?: string[];
  provenance: EventProvenance;
  demoOnly?: true;
  clinicalUse?: false;
  ruleId?: string;
  ruleLabel?: string;
  medicationId?: string;
  proposedDoseText?: string;
  action?: string;
  value?: string;
  contextSnapshot?: {
    ageYears: number;
    weightKg: number;
    asa: string;
  };
  availableActions?: Array<"MODIFY" | "OVERRIDE">;
  safetyBoundary?: string;
  firstTriggerTime?: number;
  why?: string;
  triggeringPatientData?: MedicationTriggerDatum[];
  rule?: SyntheticMedicationRule;
  recommendedActionReference?: string;
  suppressionReason?: string | null;
  exposureId?: string;
  /** UC04's synthetic, manifest-driven estimate metadata. */
  riskProbability?: number;
  leadTimeMinutes?: number;
  modelId?: string;
  modelVersion?: string;
  thresholdMmHg?: number;
  lastEvaluatedTime?: number;
  resolvedTime?: number;
  override?: MedicationAlertOverride;
}
