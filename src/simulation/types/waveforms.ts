import type { EventProvenance } from "./events";
import type { QualityState, SignalQualityState } from "./quality";
import type { SimulationClockStatus, SimulationSpeed } from "./clock";

export type WaveformSignal = "ABP" | "CAPNOGRAM" | "PLETH";

/** A deterministic synthetic waveform window, timestamped on the shared case clock. */
export interface WaveformSegment {
  id: string;
  signal: WaveformSignal;
  unit: string;
  sourceDevice: string;
  eventTime: number;
  recordedTime: number;
  sampleRateHz: number;
  samples: number[];
  quality: QualityState;
  provenance: EventProvenance;
  /** Fault overlays preserve raw samples while explicitly marking them unusable. */
  validity?: "VALID" | "INVALID";
  invalidReason?: string;
}

/** Replay-bound inputs for a derived waveform display window; not a clinical record. */
export interface WaveformRenderSource {
  seed: number;
  signal: WaveformSignal;
  sourceDevice: string;
  qualitySignal: string;
  sampleRateHz: number;
  windowMs: number;
  receiptDelayMs: number;
  simulationTimeMs: number;
  playbackStatus: SimulationClockStatus;
  playbackSpeed: SimulationSpeed;
  qualityStates: SignalQualityState[];
  unit: string;
  yMin: number;
  yMax: number;
}
