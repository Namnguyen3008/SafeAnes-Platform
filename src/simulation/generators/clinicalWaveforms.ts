import { SeededRandom } from "../core/SeededRandom";
import type { WaveformSegment, WaveformSignal } from "../types/waveforms";
import { getSignalValue, isTechnicalEtco2Dropout } from "./fullCaseSignals";

const MINUTE = 60_000;
const SAMPLE_RATE_HZ = 100;
const WINDOW_SECONDS = 10;
const WINDOW_MS = WINDOW_SECONDS * 1_000;
const SAMPLE_COUNT = SAMPLE_RATE_HZ * WINDOW_SECONDS;
export const CLINICAL_WAVEFORM_SAMPLE_RATE_HZ = SAMPLE_RATE_HZ;
export const CLINICAL_WAVEFORM_WINDOW_MS = WINDOW_MS;
export const CLINICAL_WAVEFORM_RECEIPT_DELAY_MS = 100;
const ARTERIAL_ARTIFACT_START = 147 * MINUTE;
const ARTERIAL_ARTIFACT_END = ARTERIAL_ARTIFACT_START + 15_000;
const NO_BREATH_START = 217 * MINUTE;
const NO_BREATH_END = 218 * MINUTE;
const DEFAULT_SEED = 20261007;
const MAX_CASE_SECONDS = 5 * 60 * 60;

type CycleSignal = "HR" | "RR";
interface CycleIntegral {
  values: number[];
}
const cycleIntegrals = new Map<string, CycleIntegral>();

const sources: Record<WaveformSignal, { device: string; unit: string }> = {
  ABP: { device: "arterial-line-or2", unit: "mmHg" },
  CAPNOGRAM: { device: "capnograph-or2", unit: "mmHg" },
  PLETH: { device: "pulse-ox-or2", unit: "relative amplitude" },
};

/** Short deterministic strips at routine and clinically relevant moments. */
export function generateFullCaseWaveforms(seed: number, durationMs: number): WaveformSegment[] {
  const windows = new Set<number>();
  for (let time = 0; time < durationMs; time += 5 * MINUTE) windows.add(time);
  for (const time of [147, 188, 196, 213, 215, 216, 217, 218].map((minute) => minute * MINUTE)) {
    windows.add(time);
  }
  // Short strips make the communication boundary explicit: no capnogram is
  // recorded during the technical dropout, then a fresh strip starts once the
  // channel is restored. The later strip captures the high-priority event.
  windows.add(167 * MINUTE + 12_000);
  windows.add(217 * MINUTE + 20_000);

  const waveforms: WaveformSegment[] = [];
  for (const eventTime of [...windows].sort((left, right) => left - right)) {
    for (const signal of ["ABP", "CAPNOGRAM", "PLETH"] as const) {
      if (signal === "CAPNOGRAM" && overlapsTechnicalDropout(eventTime)) continue;
      const values = createWaveformSamples(seed, signal, eventTime);
      const source = sources[signal];
      const quality = signal === "ABP" && overlapsArterialArtifact(eventTime)
        ? { status: "DEGRADED" as const, reason: "Synthetic brief arterial-line artifact." }
        : { status: "GOOD" as const };
      waveforms.push({
        id: `waveform-${signal.toLowerCase()}-${eventTime}`,
        signal,
        unit: source.unit,
        sourceDevice: source.device,
        eventTime,
        recordedTime: eventTime === 0 ? 0 : eventTime + CLINICAL_WAVEFORM_RECEIPT_DELAY_MS,
        sampleRateHz: SAMPLE_RATE_HZ,
        samples: values,
        quality,
        provenance: "DIRECT",
      });
    }
  }
  return waveforms;
}

/**
 * Returns one deterministic synthetic display sample on the shared case-time
 * axis. This is waveform morphology for the demo renderer, not an observed
 * clinical measurement or a research-grade physiology model.
 */
export function sampleClinicalWaveform(seed: number, signal: WaveformSignal, timeMs: number): number {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new RangeError("Waveform sample time must be a finite, non-negative case time.");
  }
  if (!Number.isFinite(seed)) {
    throw new TypeError("Waveform seed must be finite.");
  }

  const sampleIntervalMs = 1_000 / SAMPLE_RATE_HZ;
  const sampleTime = Math.floor(timeMs / sampleIntervalMs) * sampleIntervalMs;
  const noise = new SeededRandom(seed, `waveform:${signal}:${sampleTime}`);
  if (signal === "ABP") return arterialPressure(seed, sampleTime, noise.between(-0.2, 0.2));
  if (signal === "CAPNOGRAM") return capnogram(seed, sampleTime, noise.between(-0.025, 0.025));
  return plethysmograph(seed, sampleTime, noise.between(-0.004, 0.004));
}

/**
 * Integrated deterministic beat/breath phase on case time. The rate trajectory is
 * integrated once per seed and cached; fractional seconds use Simpson integration
 * so the phase remains continuous across changing scenario rates.
 */
export function getWaveformCycleCount(
  signal: WaveformSignal,
  timeMs: number,
  seed = DEFAULT_SEED
): number {
  if (!Number.isFinite(timeMs) || timeMs < 0 || !Number.isFinite(seed)) {
    throw new RangeError("Waveform phase requires a finite seed and non-negative case time.");
  }
  const rateSignal: CycleSignal = signal === "CAPNOGRAM" ? "RR" : "HR";
  const seconds = Math.min(timeMs / 1_000, MAX_CASE_SECONDS);
  const wholeSeconds = Math.floor(seconds);
  const fractionalSeconds = seconds - wholeSeconds;
  const key = `${seed}:${rateSignal}`;
  let integral = cycleIntegrals.get(key);
  if (!integral) {
    integral = { values: [0] };
    cycleIntegrals.set(key, integral);
    if (cycleIntegrals.size > 12) cycleIntegrals.delete(cycleIntegrals.keys().next().value as string);
  }

  while (integral.values.length <= wholeSeconds) {
    const startSeconds = integral.values.length - 1;
    const startRate = waveformRate(seed, rateSignal, startSeconds);
    const middleRate = waveformRate(seed, rateSignal, startSeconds + 0.5);
    const endRate = waveformRate(seed, rateSignal, startSeconds + 1);
    integral.values.push(integral.values[startSeconds] + (startRate + 4 * middleRate + endRate) / 6);
  }

  const wholeCycles = integral.values[wholeSeconds];
  if (fractionalSeconds === 0) return wholeCycles;
  const startRate = waveformRate(seed, rateSignal, wholeSeconds);
  const middleRate = waveformRate(seed, rateSignal, wholeSeconds + fractionalSeconds / 2);
  const endRate = waveformRate(seed, rateSignal, seconds);
  return wholeCycles + fractionalSeconds * (startRate + 4 * middleRate + endRate) / 6;
}

function createWaveformSamples(seed: number, signal: WaveformSignal, startTime: number): number[] {
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const timeMs = startTime + (index / SAMPLE_RATE_HZ) * 1_000;
    samples.push(sampleClinicalWaveform(seed, signal, timeMs));
  }
  return samples;
}

function arterialPressure(seed: number, timeMs: number, noise: number): number {
  const systolic = getSignalValue(seed, "SBP", timeMs);
  const diastolic = getSignalValue(seed, "DBP", timeMs);
  const phase = cyclePhase("ABP", seed, timeMs);
  const pulse = phase < 0.105
    ? smoothstep(phase / 0.105)
    : normalizedDiastolicDecay(phase, 0.105, 3.65);
  const notch = -0.045 * gaussian(phase, 0.625, 0.025);
  const rebound = 0.022 * gaussian(phase, 0.68, 0.027);
  return round(diastolic + (systolic - diastolic) * (pulse + notch + rebound) + noise, 1);
}

function capnogram(seed: number, timeMs: number, noise: number): number {
  if (timeMs >= NO_BREATH_START && timeMs < NO_BREATH_END) return 0;
  const minute = timeMs / MINUTE;
  const cyclePhase = cyclePhaseFor("CAPNOGRAM", seed, timeMs);
  const endTidal = getSignalValue(seed, "ETCO2", timeMs);
  const morphologyChanged = minute >= 213 && minute < 217;
  const riseStart = morphologyChanged ? 0.115 : 0.13;
  const riseEnd = morphologyChanged ? 0.245 : 0.205;
  const plateauEnd = morphologyChanged ? 0.835 : 0.79;
  const fallEnd = morphologyChanged ? 0.91 : 0.855;
  let fraction = 0;

  if (cyclePhase >= riseStart && cyclePhase < riseEnd) {
    fraction = (morphologyChanged ? 0.74 : 0.79) * smoothstep((cyclePhase - riseStart) / (riseEnd - riseStart));
  } else if (cyclePhase >= riseEnd && cyclePhase < plateauEnd) {
    const plateauProgress = (cyclePhase - riseEnd) / (plateauEnd - riseEnd);
    fraction = morphologyChanged
      ? 0.74 + 0.25 * smoothstep(plateauProgress)
      : 0.79 + 0.19 * smoothstep(plateauProgress);
  } else if (cyclePhase >= plateauEnd && cyclePhase < fallEnd) {
    const plateauLevel = morphologyChanged ? 0.995 : 0.985;
    fraction = plateauLevel * (1 - smoothstep((cyclePhase - plateauEnd) / (fallEnd - plateauEnd)));
  }
  return round(Math.max(0, endTidal * fraction + (fraction > 0 ? noise : 0)), 2);
}

function plethysmograph(seed: number, timeMs: number, noise: number): number {
  const phase = cyclePhase("PLETH", seed, timeMs);
  const rising = phase < 0.18
    ? smoothstep(phase / 0.18)
    : Math.exp(-3.35 * (phase - 0.18));
  const notch = 0.105 * gaussian(phase, 0.655, 0.022);
  const rebound = 0.085 * gaussian(phase, 0.715, 0.032);
  const respiratoryModulation = 1 + 0.05 * Math.sin((timeMs / 1_000) * 2 * Math.PI / 4.5);
  const beat = Math.floor(getWaveformCycleCount("PLETH", timeMs, seed));
  const beatVariation = new SeededRandom(seed, `pleth-beat:${beat}`).between(-0.012, 0.012);
  return round(Math.max(0, (0.15 + Math.max(0, rising - notch + rebound) * (0.68 + beatVariation)) * respiratoryModulation + noise), 3);
}

function cyclePhase(signal: WaveformSignal, seed: number, timeMs: number): number {
  return cyclePhaseFor(signal, seed, timeMs);
}

function cyclePhaseFor(signal: WaveformSignal, seed: number, timeMs: number): number {
  const cycles = getWaveformCycleCount(signal, timeMs, seed);
  return cycles - Math.floor(cycles);
}

function waveformRate(seed: number, signal: CycleSignal, timeSeconds: number): number {
  const rate = getSignalValue(seed, signal, timeSeconds * 1_000);
  // RR may trend very low before the explicit 10:52 demo apnea interval;
  // only that quality-good event is rendered as a true flat trace.
  return Math.max(signal === "RR" ? 5 : 45, rate) / 60;
}

function normalizedDiastolicDecay(phase: number, start: number, steepness: number): number {
  const span = 1 - start;
  const end = Math.exp(-steepness * span);
  return Math.max(0, (Math.exp(-steepness * (phase - start)) - end) / (1 - end));
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function gaussian(value: number, center: number, width: number): number {
  const z = (value - center) / width;
  return Math.exp(-0.5 * z * z);
}

function overlapsTechnicalDropout(startTime: number): boolean {
  const endTime = startTime + WINDOW_MS;
  const dropoutStart = 167 * MINUTE;
  const dropoutEnd = dropoutStart + 12_000;
  return startTime < dropoutEnd && endTime > dropoutStart || isTechnicalEtco2Dropout(startTime);
}

function overlapsArterialArtifact(startTime: number): boolean {
  return startTime < ARTERIAL_ARTIFACT_END && startTime + WINDOW_MS > ARTERIAL_ARTIFACT_START;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
