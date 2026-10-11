/**
 * SafeAnes — UC01 Perioperative Workflow & Situation Awareness
 * Core Clinical Domain Types
 */

export type PerioperativePhaseStatus = "COMPLETED" | "CURRENT" | "FUTURE";

export interface PerioperativePhase {
  id: string;
  label: string;
  startTime: string;
  status: PerioperativePhaseStatus;
  source?: string;
  details?: string;
}

export type WorkflowItemStatus =
  | "COMPLETED"
  | "IN_PROGRESS"
  | "PENDING"
  | "BLOCKED";

export interface WorkflowChecklistItem {
  id: string;
  sectionId: string;
  label: string;
  status: WorkflowItemStatus;
  timestamp?: string;
  completedBy?: string;
  role?: "RN" | "MD";
  source?: string;
  provenance?: string;
  details?: string;
}

export interface WorkflowChecklistSection {
  id: string;
  title: string;
  phaseTab: "Pre-induction" | "Intraoperative" | "Emergence" | "Postoperative";
  items: WorkflowChecklistItem[];
}

export type PhysiologicParameter = "MAP" | "HR" | "SPO2" | "ETCO2";
export type SignalQuality =
  | "GOOD"
  | "DEGRADED"
  | "TECHNICAL_DROPOUT"
  | "EXPECTED_INTERMITTENT"
  | "STRUCTURAL_NOT_MONITORED"
  | "INVALIDATED_ARTIFACT"
  | "UNKNOWN"
  | "UNAVAILABLE";

export interface PhysiologicObservation {
  id: string;
  parameter: PhysiologicParameter;
  label: string;
  value: number | null;
  unit: string;
  timestamp: string;
  source: string;
  quality: SignalQuality;
  highLimit: number;
  lowLimit: number;
  sparklinePoints?: string;
  fullTrendPoints?: string;
  meanValue?: number;
  minValue?: number;
  maxValue?: number;
}

export type AlertSeverity = "HIGH" | "ADVISORY" | "INFO";
export type AlertSourceType = "RULE" | "MODEL" | "REMINDER";

export interface ClinicalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  details: string;
  timestamp: string;
  firstTriggerTime: string;
  sourceType: AlertSourceType;
  patientData: string;
  source: string;
  provenance: string;
  ruleOrModel: string;
  currentStatus: string;
}

export interface PatientAllergy {
  allergen: string;
  reaction: string;
  severity?: "MILD" | "MODERATE" | "SEVERE";
}

export interface PatientContext {
  id: string;
  name: string;
  mrn: string;
  ageYears: number;
  sex: "Male" | "Female" | "Other";
  weightKg: number;
  bmi: number | null;
  asaStatus: string;
  procedureName: string;
  primarySurgeon: string;
  anesthesiaPlan: string;
  allergies: PatientAllergy[];
}

export interface CaseContext {
  caseId: string;
  patientId: string;
  orRoom: string;
  scheduledStartTime: string;
  estimatedDuration: string;
  surgicalTeam: {
    leadSurgeon: string;
    service: string;
  };
  anesthesiaTeam: {
    attending: string;
    crna: string;
  };
  patientPosition: string;
  specialEquipment: string[];
  bloodLossRisk: "Low" | "Moderate" | "High" | "Not assessed";
  bloodProducts: string;
  antibioticProphylaxis: {
    medication: string;
    timing: string;
  };
}

export interface SituationAwarenessState {
  hemodynamicStatus: {
    status: "Stable" | "Unstable" | "Guarded";
    details: string;
  };
  anesthesiaDepth: {
    status: "Adequate" | "Deep" | "Light";
    bisValue: number;
    targetRange: string;
  };
  surgicalProgress: {
    status: "On track" | "Delayed" | "Ahead";
    phaseDetail: string;
  };
  predictedRisk: {
    riskLevel: "Low" | "Moderate" | "High" | "Unavailable";
    primaryRisk: string;
    modelName: string;
    horizonMinutes: number;
    probabilityPercent: number;
    confidence: "High" | "Medium" | "Low";
    dataCoveragePercent: number;
    missingSignals: string[];
    isModelEstimate: boolean;
    available?: boolean;
  };
}

export interface ClinicalEvent {
  id: string;
  time: string;
  event: string;
  source: string;
  details: string;
}

export interface DeviceStatus {
  batteryPercent?: number;
  isAcConnected?: boolean;
  batterySegments?: number;
  networkConnected: boolean;
  externalDisplayActive?: boolean;
  telemetrySynced: boolean;
  systemTime: string;
  systemDate: string;
}

export interface PerioperativeCaseState {
  patient: PatientContext;
  caseContext: CaseContext;
  deviceStatus: DeviceStatus;
  phases: PerioperativePhase[];
  activePhaseId: string;
  estimatedEndTime: string;
  checklistSections: WorkflowChecklistSection[];
  observations: PhysiologicObservation[];
  situationAwareness: SituationAwarenessState;
  alerts: ClinicalAlert[];
  recentEvents: ClinicalEvent[];
  dataIntegrity: DataIntegrityState;
  simulationTime?: number;
}

export type SignalQualityStatus =
  | "GOOD"
  | "DEGRADED"
  | "TECHNICAL_DROPOUT"
  | "EXPECTED_INTERMITTENT"
  | "STRUCTURAL_NOT_MONITORED"
  | "INVALIDATED_ARTIFACT"
  | "UNKNOWN";

export type TransformationStatus = "RAW" | "NORMALIZED" | "DERIVED";

export interface SignalProvenance {
  signalId: string;
  signalName: string;
  sourceDevice: string;
  nativeSamplingRate: string;
  eventTime: string;
  receivedTime: string;
  clockUncertainty: string;
  qualityState: SignalQualityStatus;
  transformationStatus: TransformationStatus;
  isImputed?: boolean;
  imputationMethod?: string;
  gapDuration?: string;
  qualityNotes?: string;
  provenance?: "DIRECT" | "DERIVED" | "INFERRED" | "CLINICIAN_CONFIRMED";
}

export interface DeviceSource {
  id: string;
  name: string;
  model: string;
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  latencyMs?: number;
  clockOffsetMs?: number;
  lastMessageAt?: string;
  details?: string;
}

export interface ClockSynchronization {
  referenceClock: string;
  clockStatus: "Synchronized" | "Drifting" | "Unsynchronized";
  monitorOffset: string;
  anesthesiaMachineOffset: string;
  pumpGatewayOffset: string;
}

export interface DataIntegrityState {
  deviceSources: DeviceSource[];
  signals: SignalProvenance[];
  clockSync: ClockSynchronization;
}
