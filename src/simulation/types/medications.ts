export type MedicationStatus =
  | "ORDERED"
  | "PROPOSED"
  | "ADMINISTERED"
  | "INFUSING"
  | "RATE_CHANGED"
  | "STOPPED"
  | "SCHEDULED"
  | "HELD";

export interface MedicationRecord {
  id: string;
  name: string;
  indication: string;
  dose: number;
  doseUnit: string;
  route: string;
  status: MedicationStatus;
  eventTime: number;
  source: string;
  rate?: number;
  rateUnit?: string;
  endTime?: number;
  synthetic?: true;
  clinicalUse?: false;
  /** Demo-only rule output, kept separate from an administered medication. */
  syntheticDoseRange?: {
    minimum: number;
    maximum: number;
    unit: string;
  };
}
