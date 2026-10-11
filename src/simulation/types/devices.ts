import type { QualityStatus } from "./quality";

export type DeviceKind =
  | "PATIENT_MONITOR"
  | "ANESTHESIA_MACHINE"
  | "BIS_MONITOR"
  | "INFUSION_PUMP_GATEWAY"
  | "VENTILATOR";

export interface SimulationDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  status: "CONNECTED" | "DEGRADED" | "DISCONNECTED";
  signalQuality: QualityStatus;
  sourceIds: string[];
  latencyMs: number;
  clockOffsetMs: number;
  /** Case-relative time of the last received message; null means none received. */
  lastMessageAt: number | null;
  batteryPercent?: number;
}
