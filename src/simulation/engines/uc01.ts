import type { SimulationDevice } from "../types/devices";
import type { ClinicalSignal, Observation } from "../types/observations";
import type { SimulationSnapshot } from "../types/replay";
import type { QualityStatus, SignalQualityState } from "../types/quality";

const DISPLAY_SIGNALS: readonly ClinicalSignal[] = ["MAP", "HR", "SPO2", "ETCO2", "BIS", "RR"];
const MAX_OBSERVATION_AGE_MS = 35_000;

export interface UC01SignalState {
  signal: ClinicalSignal;
  value: number | null;
  unit: string;
  sourceDevice: string;
  eventTime: number | null;
  receivedTime: number | null;
  quality: QualityStatus;
  reason?: string;
  provenance: Observation["provenance"] | null;
  imputed: boolean;
  rawObservation: Observation | null;
}

export interface UC01SimulationState {
  simulationTime: number;
  devices: SimulationDevice[];
  signals: UC01SignalState[];
  activeQualityStates: SignalQualityState[];
  recentEvents: SimulationSnapshot["events"];
  perioperativePhases: SimulationSnapshot["perioperativePhases"];
}

/**
 * Projects the shared replay snapshot into UC01's acquisition view. Raw records
 * remain in the snapshot; this projection only marks values that are unsafe to
 * present as current measurements as missing.
 */
export function runUc01Engine(snapshot: SimulationSnapshot): UC01SimulationState {
  const activeQualityStates = snapshot.qualityStates.filter((state) =>
    state.eventTime <= snapshot.simulationTime &&
    (state.validUntilTime === undefined || snapshot.simulationTime < state.validUntilTime)
  );
  const signalNames = new Set<ClinicalSignal>(DISPLAY_SIGNALS);
  for (const observation of snapshot.observations) signalNames.add(observation.signal);
  for (const quality of activeQualityStates) {
    if (isClinicalSignal(quality.signal)) signalNames.add(quality.signal);
  }

  const signals = [...signalNames].map((signal) => {
    const rawObservation = latestObservation(snapshot.observations, signal, snapshot.simulationTime);
    const qualityState = latestQuality(activeQualityStates, signal, rawObservation?.sourceDevice);
    const stale = !rawObservation || snapshot.simulationTime - rawObservation.receivedTime > MAX_OBSERVATION_AGE_MS;
    const quality = qualityState?.status ?? (stale ? "UNKNOWN" : normalizeQuality(rawObservation.quality.status));
    const unavailableStatuses: QualityStatus[] = [
      "TECHNICAL_DROPOUT",
      "EXPECTED_INTERMITTENT",
      "STRUCTURAL_NOT_MONITORED",
      "INVALIDATED_ARTIFACT",
      "UNKNOWN",
      "UNAVAILABLE",
    ];
    const valueIsUnavailable = stale || unavailableStatuses.includes(quality);

    return {
      signal,
      value: valueIsUnavailable ? null : rawObservation.value,
      unit: rawObservation?.unit ?? signalUnit(signal),
      sourceDevice: rawObservation?.sourceDevice ?? qualityState?.sourceDevice ?? "",
      eventTime: rawObservation?.eventTime ?? null,
      receivedTime: rawObservation?.receivedTime ?? null,
      quality,
      reason: qualityState?.reason ?? (stale ? "No fresh observation is available at the current simulation time." : rawObservation?.quality.reason),
      provenance: rawObservation?.provenance ?? null,
      imputed: rawObservation?.imputed ?? false,
      rawObservation: rawObservation ?? null,
    } satisfies UC01SignalState;
  });

  const devices = snapshot.devices.map((device) => {
    const relatedSources = new Set([device.id, ...device.sourceIds]);
    const deviceQuality = activeQualityStates
      .filter((quality) => relatedSources.has(quality.sourceDevice))
      .sort((left, right) => right.eventTime - left.eventTime)[0];
    return {
      ...device,
      signalQuality: deviceQuality?.status ?? device.signalQuality,
    };
  });

  return {
    simulationTime: snapshot.simulationTime,
    devices,
    signals,
    activeQualityStates,
    recentEvents: snapshot.events,
    perioperativePhases: snapshot.perioperativePhases,
  };
}

export function latestObservation(
  observations: Observation[],
  signal: ClinicalSignal,
  simulationTime: number
): Observation | undefined {
  return observations
    .filter((observation) => observation.signal === signal && observation.eventTime <= simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime || right.receivedTime - left.receivedTime)[0];
}

function latestQuality(
  states: SignalQualityState[],
  signal: ClinicalSignal,
  sourceDevice?: string
): SignalQualityState | undefined {
  return states
    .filter((state) => state.signal === signal && (!sourceDevice || state.sourceDevice === sourceDevice))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
}

function normalizeQuality(status: QualityStatus): QualityStatus {
  return status === "UNAVAILABLE" ? "UNKNOWN" : status;
}

function isClinicalSignal(value: string): value is ClinicalSignal {
  return ["MAP", "SBP", "DBP", "HR", "SPO2", "ETCO2", "RR", "BIS", "TEMPERATURE", "CI", "SV", "SVV", "SVR", "PLETH_PI", "CAPNOGRAM"].includes(value);
}

function signalUnit(signal: ClinicalSignal): string {
  const units: Partial<Record<ClinicalSignal, string>> = {
    MAP: "mmHg", SBP: "mmHg", DBP: "mmHg", HR: "bpm", SPO2: "%", ETCO2: "mmHg",
    RR: "/min", BIS: "index", TEMPERATURE: "°C", CI: "L/min/m²", SV: "mL/beat", SVV: "%", SVR: "dyn·s/cm⁵", PLETH_PI: "index", CAPNOGRAM: "waveform",
  };
  return units[signal] ?? "";
}
