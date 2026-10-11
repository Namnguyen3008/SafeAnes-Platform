/**
 * Unified Clinical Data Models for SafeAnes Workstation
 */

export type PerioperativePhase =
  | "PREOPERATIVE"
  | "INDUCTION"
  | "MAINTENANCE"
  | "EMERGENCE"
  | "PACU";

export type SignalQuality = "GOOD" | "DEGRADED" | "UNAVAILABLE";

export type ProvenanceStatus =
  | "DIRECT"
  | "DERIVED"
  | "INFERRED"
  | "CLINICIAN_CONFIRMED"
  | "REJECTED";

export type AlertSeverity = "CRITICAL" | "HIGH" | "WARNING" | "INFO";

export interface PatientAllergy {
  substance: string;
  reaction: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
}

export interface PatientContext {
  id: string;
  mrn: string;
  fullName: string;
  ageYears: number;
  sex: "Male" | "Female" | "Other";
  weightKg: number;
  heightCm?: number;
  bmi: number | null;
  asaStatus: "ASA I" | "ASA II" | "ASA III" | "ASA IV" | "ASA V" | "ASA VI";
  allergies: PatientAllergy[];
  comorbidities: string[];
}

export interface CaseContext {
  caseId: string;
  orRoom: string;
  procedureName: string;
  primarySurgeon: string;
  leadAnesthesiologist: string;
  anesthesiaPlan: string;
  caseStatus: "LIVE" | "STANDBY" | "COMPLETED";
  startTime: string;
  scheduledDurationMin: number;
  activePhase: PerioperativePhase;
}

export interface DeviceStatus {
  systemClock: string;
  elapsedSeconds: number;
  isTelemetryOnline: boolean;
  isWifiConnected: boolean | null;
  batteryPercent: number | null;
  batteryBars: number | null;
  signalQuality: SignalQuality;
  syncOffsetMs: number;
}

export interface ClinicalVitals {
  map: number | null;
  sbp: number | null;
  dbp: number | null;
  hr: number | null;
  spo2: number | null;
  etco2: number | null;
  rr: number | null;
  temperature: number | null;
  ci?: number | null;
  svv?: number | null;
  hpi?: number | null;
  timestamp: string;
}

export type AlertSourceModule =
  | "SITUATION"
  | "RECORD"
  | "MEDICATION"
  | "HEMODYNAMICS"
  | "RESPIRATORY"
  | "DATA_QUALITY"
  | "RECORD_VALIDATION";

export interface ClinicalAlert {
  id: string;
  code: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: string;
  sourceModule: AlertSourceModule;
  acknowledged?: boolean;
}

export interface SafeAnesCaseState {
  patient: PatientContext;
  caseContext: CaseContext;
  devices: DeviceStatus;
  vitals: ClinicalVitals;
  activeAlerts: ClinicalAlert[];
}
