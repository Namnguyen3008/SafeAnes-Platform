/** Optional deterministic acquisition faults used only by the SafeAnes demo. */
export const SIMULATION_FAULTS_DEFAULT_ENABLED = false;

export const SIMULATION_FAULT_DEFINITIONS = [
  { id: "DEVICE_DISCONNECT", target: "Ventilator / capnograph source" },
  { id: "CLOCK_DRIFT", target: "Patient monitor clock (+5 seconds)" },
  { id: "PACKET_DROPOUT", target: "Capnograph EtCO₂ packets" },
  { id: "SIGNAL_ARTIFACT", target: "Arterial-line MAP" },
  { id: "MISSING_MODALITY", target: "Pulse-oximeter SpO₂" },
  { id: "DELAYED_MEDICATION_DOCUMENTATION", target: "Medication documentation (+5 minutes)" },
  { id: "CONFLICTING_SOURCE", target: "Secondary MAP source" },
  { id: "PUMP_GATEWAY_LATENCY", target: "Infusion pump gateway" },
] as const;

export type SimulationFaultId = (typeof SIMULATION_FAULT_DEFINITIONS)[number]["id"];

export interface SimulationFaultActivation {
  id: SimulationFaultId;
  enabledAt: number;
  eventId: string;
}

export function isSimulationFaultId(value: unknown): value is SimulationFaultId {
  return typeof value === "string" && SIMULATION_FAULT_DEFINITIONS.some((fault) => fault.id === value);
}
