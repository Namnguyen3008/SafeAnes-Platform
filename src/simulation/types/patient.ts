export type PatientSex = "Female" | "Male" | "Other" | "Unknown";
export type AsaStatus = "I" | "II" | "III" | "IV" | "V" | "VI";

export interface PatientAllergy {
  substance: string;
  reaction: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
}

export interface PatientContext {
  patientId: string;
  ageYears: number;
  sex: PatientSex;
  weightKg: number;
  heightCm?: number;
  asa: AsaStatus;
  allergies: PatientAllergy[];
  comorbidities: string[];
  /** Synthetic demo inputs only; not a clinical assessment. */
  syntheticFactors?: Record<string, number | string>;
}

export interface EncounterContext {
  caseId: string;
  patientId: string;
  startedAt: string;
  scheduledDurationMs: number;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
}

export interface ProcedureContext {
  name: string;
  operatingRoom: string;
  anesthesia: string;
  surgeon?: string;
  service?: string;
}
