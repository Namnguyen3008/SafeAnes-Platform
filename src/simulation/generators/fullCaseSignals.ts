import { SeededRandom } from "../core/SeededRandom";
import type { ClinicalSignal, Observation } from "../types/observations";
import type { QualityState } from "../types/quality";

const MINUTE = 60_000;
const SAMPLE_INTERVAL = 30_000;
const ARTERIAL_ARTIFACT_START = 147 * MINUTE;
const ARTERIAL_ARTIFACT_END = ARTERIAL_ARTIFACT_START + 15_000;
const BIS_DEGRADED_START = 119 * MINUTE;
const BIS_DEGRADED_END = BIS_DEGRADED_START + 45_000;
const ETCO2_DROPOUT_START = 167 * MINUTE;
const ETCO2_DROPOUT_END = ETCO2_DROPOUT_START + 12_000;
const NO_BREATH_START = 217 * MINUTE;
const NO_BREATH_END = 218 * MINUTE;

type SignalDefinition = {
  signal: ClinicalSignal;
  unit: string;
  sourceDevice: string;
  decimals: number;
  noise: number;
};

const definitions: readonly SignalDefinition[] = [
  { signal: "HR", unit: "bpm", sourceDevice: "monitor-or2", decimals: 0, noise: 0.35 },
  { signal: "MAP", unit: "mmHg", sourceDevice: "arterial-line-or2", decimals: 0, noise: 0.45 },
  { signal: "SBP", unit: "mmHg", sourceDevice: "arterial-line-or2", decimals: 0, noise: 0.6 },
  { signal: "DBP", unit: "mmHg", sourceDevice: "arterial-line-or2", decimals: 0, noise: 0.45 },
  { signal: "SPO2", unit: "%", sourceDevice: "pulse-ox-or2", decimals: 0, noise: 0.2 },
  { signal: "ETCO2", unit: "mmHg", sourceDevice: "capnograph-or2", decimals: 0, noise: 0.35 },
  { signal: "RR", unit: "/min", sourceDevice: "capnograph-or2", decimals: 0, noise: 0.15 },
  { signal: "BIS", unit: "index", sourceDevice: "bis-monitor-or2", decimals: 0, noise: 0.3 },
  { signal: "CI", unit: "L/min/m²", sourceDevice: "hemodynamic-monitor-or2", decimals: 1, noise: 0.04 },
  { signal: "SV", unit: "mL/beat", sourceDevice: "hemodynamic-monitor-or2", decimals: 0, noise: 0.5 },
  { signal: "SVV", unit: "%", sourceDevice: "hemodynamic-monitor-or2", decimals: 0, noise: 0.2 },
  { signal: "SVR", unit: "dyn·s/cm⁵", sourceDevice: "hemodynamic-monitor-or2", decimals: 0, noise: 6 },
];

const MAP_KNOTS: readonly [number, number][] = [
  [0, 86], [30, 86], [50, 82], [60, 79], [70, 82], [115, 83],
  [147, 82], [167, 82], [188, 82], [190, 78], [192, 74], [194, 68],
  [196, 62], [197, 60], [198, 59], [199, 68], [202, 74], [207, 82],
  [212, 82], [218, 82], [245, 82], [270, 82], [290, 84], [300, 84],
];

const HR_KNOTS: readonly [number, number][] = [
  [0, 78], [30, 78], [50, 88], [60, 96], [70, 80], [115, 78],
  [188, 78], [196, 82], [198, 91], [199, 93], [200, 88], [207, 82],
  [213, 82], [217, 86], [218, 84], [245, 78], [270, 82], [300, 80],
];

const ETCO2_KNOTS: readonly [number, number][] = [
  [0, 34], [30, 35], [50, 31], [60, 33], [70, 35], [115, 36],
  [188, 36], [213, 36], [215, 40], [216, 43], [217, 45], [218, 37],
  [220, 36], [245, 36], [270, 35], [300, 35],
];

const RR_KNOTS: readonly [number, number][] = [
  [0, 14], [30, 14], [50, 10], [60, 12], [70, 12], [188, 12],
  [213, 12], [215, 9], [216, 6], [217, 0], [218, 7], [220, 11],
  [245, 12], [270, 14], [300, 14],
];

const BIS_KNOTS: readonly [number, number][] = [
  [0, 96], [30, 96], [50, 82], [55, 62], [60, 48], [70, 45],
  [115, 44], [188, 45], [245, 44], [270, 62], [280, 78], [290, 90], [300, 94],
];

const SPO2_KNOTS: readonly [number, number][] = [
  [0, 98], [30, 98], [50, 97], [60, 98], [70, 99], [115, 99],
  [188, 99], [213, 98], [217, 97], [218, 98], [245, 99], [300, 98],
];

/** Deterministic, smooth demo trends sampled on a shared 30-second case clock. */
export function generateFullCaseObservations(seed: number, durationMs: number): Observation[] {
  const times = new Set<number>();
  for (let time = 0; time < durationMs; time += SAMPLE_INTERVAL) times.add(time);
  times.add(NO_BREATH_START + 20_000);

  const observations: Observation[] = [];
  for (const eventTime of [...times].sort((left, right) => left - right)) {
    for (const definition of definitions) {
      if (definition.signal === "ETCO2" && isEtco2Unavailable(eventTime)) continue;

      const quality = qualityFor(definition.signal, eventTime);
      const value = round(
        getSignalValue(seed, definition.signal, eventTime, definition.noise),
        definition.decimals
      );
      observations.push({
        id: `observation-${definition.signal.toLowerCase()}-${eventTime}`,
        signal: definition.signal,
        value,
        unit: definition.unit,
        sourceDevice: definition.sourceDevice,
        eventTime,
        receivedTime: eventTime === 0 ? 0 : eventTime + 120,
        quality,
        provenance: "DIRECT",
        imputed: false,
      });
    }
  }
  return observations;
}

/** Shared baseline value used by waveform generators; noise is deterministic by signal and time. */
export function getSignalValue(seed: number, signal: ClinicalSignal, timeMs: number, noise = 0): number {
  const minute = timeMs / MINUTE;
  const noiseGenerator = new SeededRandom(seed, `full-case:${signal}:${timeMs}`);
  const noiseValue = noise ? noiseGenerator.between(-noise, noise) : 0;
  const slowOscillation = Math.sin((minute / 13) * Math.PI * 2 + phaseFor(signal)) * amplitudeFor(signal);

  if (signal === "MAP") return smoothValue(MAP_KNOTS, minute) + slowOscillation + noiseValue;
  if (signal === "SBP") {
    const map = smoothValue(MAP_KNOTS, minute);
    const pulsePressure = 54 + Math.sin(minute / 8) * 2;
    return map + pulsePressure * 2 / 3 + slowOscillation + noiseValue;
  }
  if (signal === "DBP") {
    const map = smoothValue(MAP_KNOTS, minute);
    const pulsePressure = 54 + Math.sin(minute / 8) * 2;
    return map - pulsePressure / 3 + slowOscillation + noiseValue;
  }
  if (signal === "HR") return smoothValue(HR_KNOTS, minute) + slowOscillation + noiseValue;
  if (signal === "ETCO2") return smoothValue(ETCO2_KNOTS, minute) + slowOscillation * 0.25 + noiseValue;
  if (signal === "RR") return smoothValue(RR_KNOTS, minute) + noiseValue;
  if (signal === "BIS") return smoothValue(BIS_KNOTS, minute) + slowOscillation + noiseValue;
  if (signal === "SPO2") return smoothValue(SPO2_KNOTS, minute) + noiseValue;
  if (signal === "CI") return 2.8 - Math.max(0, (smoothValue(MAP_KNOTS, minute) < 70 ? 70 - smoothValue(MAP_KNOTS, minute) : 0)) * 0.01 + noiseValue;
  if (signal === "SV") return 76 + (smoothValue(MAP_KNOTS, minute) - 82) * 0.28 + noiseValue;
  if (signal === "SVV") return 10 + Math.max(0, 70 - smoothValue(MAP_KNOTS, minute)) * 0.12 + noiseValue;
  if (signal === "SVR") return 960 + Math.max(0, 82 - smoothValue(MAP_KNOTS, minute)) * 16 + noiseValue;
  return 0;
}

export function isEtco2Unavailable(timeMs: number): boolean {
  return (
    (timeMs >= ETCO2_DROPOUT_START && timeMs < ETCO2_DROPOUT_END) ||
    (timeMs >= NO_BREATH_START && timeMs < NO_BREATH_END)
  );
}

export function isTechnicalEtco2Dropout(timeMs: number): boolean {
  return timeMs >= ETCO2_DROPOUT_START && timeMs < ETCO2_DROPOUT_END;
}

function qualityFor(signal: ClinicalSignal, timeMs: number): QualityState {
  if (signal === "BIS" && timeMs >= BIS_DEGRADED_START && timeMs < BIS_DEGRADED_END) {
    return { status: "DEGRADED", reason: "Synthetic BIS signal quality degradation." };
  }
  if (
    ["MAP", "SBP", "DBP"].includes(signal) &&
    timeMs >= ARTERIAL_ARTIFACT_START && timeMs < ARTERIAL_ARTIFACT_END
  ) {
    return { status: "INVALIDATED_ARTIFACT", reason: "Synthetic brief arterial-line artifact; raw observation retained." };
  }
  return { status: "GOOD" };
}

function smoothValue(knots: readonly [number, number][], minute: number): number {
  if (minute <= knots[0][0]) return knots[0][1];
  for (let index = 1; index < knots.length; index += 1) {
    const [endTime, endValue] = knots[index];
    if (minute > endTime) continue;
    const [startTime, startValue] = knots[index - 1];
    const linear = (minute - startTime) / (endTime - startTime);
    const eased = linear * linear * (3 - 2 * linear);
    return startValue + (endValue - startValue) * eased;
  }
  return knots[knots.length - 1][1];
}

function phaseFor(signal: ClinicalSignal): number {
  const phases: Partial<Record<ClinicalSignal, number>> = {
    HR: 0.2,
    MAP: 0.6,
    SBP: 0.8,
    DBP: 1.2,
    BIS: 1.6,
  };
  return phases[signal] ?? 0;
}

function amplitudeFor(signal: ClinicalSignal): number {
  const amplitudes: Partial<Record<ClinicalSignal, number>> = {
    HR: 0.8,
    MAP: 0.6,
    SBP: 0.8,
    DBP: 0.5,
    BIS: 0.4,
  };
  return amplitudes[signal] ?? 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
