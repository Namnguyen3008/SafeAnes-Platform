import {
  CLINICAL_WAVEFORM_RECEIPT_DELAY_MS,
  CLINICAL_WAVEFORM_SAMPLE_RATE_HZ,
  CLINICAL_WAVEFORM_WINDOW_MS,
} from "../generators/clinicalWaveforms";
import type { SimulationSnapshot } from "../types/replay";
import type { WaveformRenderSource, WaveformSignal } from "../types/waveforms";

export function createClinicalWaveformSource(
  snapshot: SimulationSnapshot,
  signal: WaveformSignal,
  sourceDevice: string,
  qualitySignal: string,
  unit: string,
  yMin: number,
  yMax: number
): WaveformRenderSource {
  return {
    seed: snapshot.seed,
    signal,
    sourceDevice,
    qualitySignal,
    sampleRateHz: CLINICAL_WAVEFORM_SAMPLE_RATE_HZ,
    windowMs: CLINICAL_WAVEFORM_WINDOW_MS,
    receiptDelayMs: snapshot.simulationTime === 0 ? 0 : CLINICAL_WAVEFORM_RECEIPT_DELAY_MS,
    simulationTimeMs: snapshot.simulationTime,
    playbackStatus: snapshot.status,
    playbackSpeed: snapshot.speed,
    qualityStates: snapshot.qualityStates,
    unit,
    yMin,
    yMax,
  };
}
