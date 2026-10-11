export const SIMULATION_SPEEDS = [1, 2, 5, 10, 30, 60] as const;
export type SimulationSpeed = (typeof SIMULATION_SPEEDS)[number];
export type SimulationClockStatus = "STOPPED" | "PLAYING" | "PAUSED" | "COMPLETED";

export interface SimulationClockSnapshot {
  status: SimulationClockStatus;
  simulationTime: number;
  durationMs: number;
  speed: SimulationSpeed;
  progress: number;
}
