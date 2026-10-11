/**
 * SafeAnes UC03 Clinical Domain Types
 * Strongly typed models for Medication Safety Workstation
 */

export interface PatientContext {
  id: string;
  ageYears: number;
  sex: "Female" | "Male" | "Other";
  weightKg: number;
  heightCm?: number;
  bmi: number | null;
  asaStatus: "ASA I" | "ASA II" | "ASA III" | "ASA IV" | "ASA V" | "ASA VI";
  procedure: string;
  room: string;
  anesthesiaType: string;
  allergies: {
    substance: string;
    reaction: string;
    severity?: "MILD" | "MODERATE" | "SEVERE";
  }[];
  renalFunction: {
    crClMlMin: number | null;
    serumCreatinineMgDl: number | null;
    staging: string;
    thresholdMlMin: number | null;
    crClDirection: "DOWN" | "UP" | "NORMAL" | "UNKNOWN";
    creatinineDirection: "UP" | "DOWN" | "NORMAL" | "UNKNOWN";
  };
  liverFunction: {
    astUl: number | null;
    altUl: number | null;
    status: "Normal" | "Elevated" | "Impaired" | "Not assessed";
  };
}

export interface MedicationDefinition {
  id: string;
  genericName: string;
  tradeName?: string;
  therapeuticClass: string;
  defaultRoute: string;
  isNsaid?: boolean;
  isHighAlert?: boolean;
}

export interface MedicationAdministration {
  id: string;
  medicationId: string;
  drugName: string;
  timestamp: string;
  dose: number;
  doseUnit: string;
  route: string;
  status: "Given" | "Infusing" | "Pending";
  givenOver?: string;
  administeredBy?: string;
}

export interface MedicationInfusion {
  id: string;
  medicationId: string;
  drugName: string;
  rate: number;
  rateUnit: string;
  volumetricRateMlHr?: number;
  status: "Infusing" | "Stopped" | "Paused";
  sinceTimestamp: string;
  concentration?: string;
  targetEndpoint?: string;
}

export interface MedicationProposal {
  id: string;
  medicationId: string;
  genericName: string;
  indication: string;
  dose: number;
  doseUnit: string;
  route: string;
  givenOverMin: number;
  plannedTime: string;
  comment: string;
  recommendedDoseMin: number | null;
  recommendedDoseMax: number | null;
  recommendedDoseText: string;
  maxDailyCeilingMg: number | null;
  standardCeilingMg: number | null;
}

export type MedicationState = {
  id: string;
  name: string;
  indication?: string;
  status: "ORDERED" | "PROPOSED" | "INFUSING" | "RATE_CHANGED" | "GIVEN" | "PENDING" | "STOPPED";
  dose?: number;
  doseUnit?: string;
  rate?: number;
  rateUnit?: string;
  route?: string;
  volumetricRate?: string;
  statusDetail?: string;
  colorBar?: string;
  timelineTrack?: number;
};

export type MedicationAlert = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "ADVISORY" | "MONITORING";
  title: string;
  subtitle?: string;
  why: string[];
  medicationId: string;
  proposedDoseText?: string;
  recommendedDoseText?: string;
  triggeringPatientData: {
    name: string;
    value: string;
    timestamp?: string;
    direction?: "UP" | "DOWN" | "NORMAL";
  }[];
  rule: {
    id: string;
    version: string;
    source: string;
  };
  status: "ACTIVE" | "ACKNOWLEDGED" | "OVERRIDDEN" | "RESOLVED";
  timestamp: string;
  time?: string;
  priority?: "High" | "Advisory" | "Info" | "Critical";
  alert?: string;
  action: string;
  value: string;
  metric?: string;
  details?: string;
  isRedAlert?: boolean;
};

export interface MedicationRule {
  id: string;
  name: string;
  version: string;
  classification: string;
  engine: string;
  confidence: "Deterministic" | "Probabilistic";
  status: "ACTIVE" | "INACTIVE";
  terminologyCode?: string;
}

export interface MedicationEvidence {
  ruleId: string;
  ruleVersion: string;
  summary: string;
  hemodynamicCalculation: {
    formula: string;
    result: string;
    clinicalStaging: string;
  };
  guidelineMatrix: {
    category: string;
    recommendedDose: string;
    maxDailyDose: string;
    source: string;
    isCurrentPatient?: boolean;
    isContraindicated?: boolean;
  }[];
  citations: string[];
  provenance: {
    type: "DIRECT" | "DERIVED" | "CLINICIAN REVIEW";
    description: string;
  }[];
  timestamps: {
    labDrawn: string;
    labVerified: string;
    orderPlaced: string;
    ruleTriggered: string;
    workstationLive: string;
  };
}

export type MedicationOverride = {
  alertId: string;
  reason:
    | "CLINICALLY_APPROPRIATE"
    | "PATIENT_SPECIFIC"
    | "ALREADY_ADDRESSED"
    | "DATA_INCORRECT"
    | "OTHER";
  reasonText: string;
  comment?: string;
  clinicianId: string;
  timestamp: string;
};

export type MedicationTimelineEvent = {
  id: string;
  medicationId: string;
  timestamp: string;
  /** Canonical event time in simulation milliseconds from the case start. */
  eventTime?: number;
  eventType:
    | "ORDERED"
    | "BOLUS"
    | "INFUSION_START"
    | "RATE_CHANGE"
    | "INFUSION_STOP"
    | "PROPOSED";
  value?: number;
  unit?: string;
  label?: string;
  color?: string;
  secondaryText?: string;
};

export interface MedicationRiskSummaryItem {
  id: string;
  category: string;
  count: number;
  severity: "CRITICAL" | "HIGH" | "ADVISORY" | "NONE";
  statusText: string;
}

export interface MedicationValueRow {
  id: string;
  medId: string;
  time: string;
  drug: string;
  doseRate: string;
  route: string;
  status: "Ordered" | "Proposed" | "Infusing" | "Rate changed" | "Stopped" | "Given";
}
