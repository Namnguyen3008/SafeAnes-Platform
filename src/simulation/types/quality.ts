/** Synthetic signal quality labels; these are demonstration states, not clinical assessments. */
export type QualityStatus =
  | "GOOD"
  | "DEGRADED"
  | "TECHNICAL_DROPOUT"
  | "EXPECTED_INTERMITTENT"
  | "STRUCTURAL_NOT_MONITORED"
  | "INVALIDATED_ARTIFACT"
  | "UNKNOWN"
  /** Kept for older scenario data while it is migrated to UNKNOWN. */
  | "UNAVAILABLE";

export interface QualityState {
  status: QualityStatus;
  reason?: string;
  metrics?: Record<string, number>;
}

export interface SignalQualityState extends QualityState {
  id: string;
  signal: string;
  sourceDevice: string;
  eventTime: number;
  recordedTime?: number;
  validUntilTime?: number;
}
