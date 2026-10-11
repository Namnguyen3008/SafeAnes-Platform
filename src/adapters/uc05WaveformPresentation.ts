export type UC05WaveformHeaderMode = "RECORDED_RATE" | "UNAVAILABLE" | "LIVE_SWEEP";

export function getWaveformHeaderMode(
  sourceMode: "SYNTHETIC_DEMO" | "VITALDB_REPLAY",
  hasRecordedWaveform: boolean,
): UC05WaveformHeaderMode {
  if (sourceMode === "VITALDB_REPLAY") return hasRecordedWaveform ? "RECORDED_RATE" : "UNAVAILABLE";
  return "LIVE_SWEEP";
}

export function getWaveformUnit(
  sourceMode: "SYNTHETIC_DEMO" | "VITALDB_REPLAY",
  recordedUnit: string | null,
  simulationUnit: string,
): string {
  if (sourceMode === "SYNTHETIC_DEMO") return simulationUnit;
  return recordedUnit?.trim() || "NOT_RECORDED";
}
