import type { Observation, ClinicalSignal } from "../types/observations";
import type { QualityState } from "../types/quality";
import { SeededRandom } from "../core/SeededRandom";

const GOOD_QUALITY: QualityState = Object.freeze({ status: "GOOD" });

interface ReadingDefinition {
  signal: ClinicalSignal;
  value: number;
  unit: string;
  device: string;
  jitter?: number;
}

const routineReadings: readonly ReadingDefinition[] = [
  { signal: "HR", value: 78, unit: "bpm", device: "monitor-or2", jitter: 3 },
  { signal: "SBP", value: 126, unit: "mmHg", device: "arterial-line-or2", jitter: 4 },
  { signal: "DBP", value: 68, unit: "mmHg", device: "arterial-line-or2", jitter: 3 },
  { signal: "MAP", value: 86, unit: "mmHg", device: "arterial-line-or2", jitter: 3 },
  { signal: "SPO2", value: 99, unit: "%", device: "pulse-ox-or2", jitter: 0 },
  { signal: "ETCO2", value: 36, unit: "mmHg", device: "capnograph-or2", jitter: 2 },
  { signal: "RR", value: 12, unit: "/min", device: "capnograph-or2", jitter: 1 },
  { signal: "TEMPERATURE", value: 36.4, unit: "°C", device: "monitor-or2", jitter: 0.2 },
  { signal: "CI", value: 2.8, unit: "L/min/m²", device: "hemodynamic-monitor-or2", jitter: 0.15 },
  { signal: "SVV", value: 10, unit: "%", device: "hemodynamic-monitor-or2", jitter: 1 },
];

/** Deterministic fictional routine observations for a single synthetic snapshot. */
export function generateRoutineObservations(seed: number, eventTime: number): Observation[] {
  const random = new SeededRandom(seed, "full-case-physiology");
  return routineReadings.map((reading) => {
    const offset = reading.jitter ? random.between(-reading.jitter, reading.jitter) : 0;
    const value = round(reading.value + offset, reading.signal === "TEMPERATURE" || reading.signal === "CI" ? 1 : 0);
    return {
      id: `observation-${reading.signal.toLowerCase()}-${eventTime}`,
      signal: reading.signal,
      value,
      unit: reading.unit,
      sourceDevice: reading.device,
      eventTime,
      receivedTime: eventTime + 120,
      quality: { ...GOOD_QUALITY },
      provenance: "DIRECT",
      imputed: false,
    };
  });
}

/** Builds a direct device reading, keeping measured values distinct from model output. */
export function observation(
  id: string,
  signal: ClinicalSignal,
  value: number,
  unit: string,
  sourceDevice: string,
  eventTime: number,
  options: {
    receivedTime?: number;
    quality?: QualityState;
    provenance?: Observation["provenance"];
    imputed?: boolean;
  } = {}
): Observation {
  return {
    id,
    signal,
    value,
    unit,
    sourceDevice,
    eventTime,
    receivedTime: options.receivedTime ?? eventTime + 120,
    quality: options.quality ?? { status: "GOOD" },
    provenance: options.provenance ?? "DIRECT",
    imputed: options.imputed ?? false,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
