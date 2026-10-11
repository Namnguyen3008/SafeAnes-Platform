import type { EventProvenance } from "./events";
import type { QualityState } from "./quality";

export type ClinicalSignal =
  | "MAP"
  | "SBP"
  | "DBP"
  | "HR"
  | "SPO2"
  | "ETCO2"
  | "RR"
  | "BIS"
  | "TEMPERATURE"
  | "CI"
  | "SV"
  | "SVV"
  | "SVR"
  | "PLETH_PI"
  | "CAPNOGRAM";

export type ObservationValidity = "VALID" | "INVALID" | "CONFLICTING";

/** Times are elapsed milliseconds from encounter.startedAt, never wall-clock values. */
export interface Observation<TValue extends number | string = number> {
  id: string;
  signal: ClinicalSignal;
  value: TValue;
  unit: string;
  sourceDevice: string;
  eventTime: number;
  receivedTime: number;
  quality: QualityState;
  provenance: EventProvenance;
  imputed: boolean;
  /** Fault overlays preserve the recorded value while explicitly marking it unusable. */
  validity?: ObservationValidity;
  invalidReason?: string;
}
