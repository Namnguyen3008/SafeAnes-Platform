import type { SimulationEngine } from "./SimulationEngine";
import type { SimulationSnapshot } from "../types/replay";
import { formatCaseTime } from "../formatTime";

export interface SafeAnesSimulationState {
  snapshot: SimulationSnapshot;
  clock: {
    simulationTime: number;
    currentTime: string;
    status: SimulationSnapshot["status"];
    speed: SimulationSnapshot["speed"];
    durationMs: number;
    progress: number;
    play: () => SimulationSnapshot;
    pause: () => SimulationSnapshot;
    resume: () => SimulationSnapshot;
    reset: () => SimulationSnapshot;
    seek: (time: number) => SimulationSnapshot;
    setSpeed: (speed: number) => SimulationSnapshot;
    seekToEvent: (eventId: string) => SimulationSnapshot;
  };
  patient: SimulationSnapshot["patient"];
  case: {
    scenarioId: string;
    caseId: string;
    encounter: SimulationSnapshot["encounter"];
    procedure: SimulationSnapshot["procedure"];
    phases: SimulationSnapshot["perioperativePhases"];
    metadata: SimulationSnapshot["simulationMetadata"];
    scenarioManifest: SimulationSnapshot["scenarioManifest"];
  };
  devices: SimulationSnapshot["devices"];
  observations: SimulationSnapshot["observations"];
  waveforms: SimulationSnapshot["waveforms"];
  quality: SimulationSnapshot["qualityStates"];
  medications: SimulationSnapshot["medications"];
  events: SimulationSnapshot["events"];
  episodes: SimulationSnapshot["episodes"];
  predictions: SimulationSnapshot["predictions"];
  alerts: SimulationSnapshot["alerts"];
  faults: SimulationSnapshot["activeFaults"];
  claims: SimulationSnapshot["recordClaims"];
}

/** A read-only, canonical projection plus controls bound to the same replay engine. */
export function createSafeAnesSimulationState(
  engine: SimulationEngine,
  snapshot: SimulationSnapshot,
): SafeAnesSimulationState {
  const durationMs = snapshot.encounter.scheduledDurationMs;
  return {
    snapshot,
    clock: {
      simulationTime: snapshot.simulationTime,
      currentTime: formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime),
      status: snapshot.status,
      speed: snapshot.speed,
      durationMs,
      progress: durationMs === 0 ? 1 : snapshot.simulationTime / durationMs,
      play: () => engine.play(),
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      reset: () => engine.reset(),
      seek: (time) => engine.seek(time).snapshot,
      setSpeed: (speed) => engine.setSpeed(speed),
      seekToEvent: (eventId) => engine.seekToEvent(eventId).snapshot,
    },
    patient: snapshot.patient,
    case: {
      scenarioId: snapshot.scenarioId,
      caseId: snapshot.encounter.caseId,
      encounter: snapshot.encounter,
      procedure: snapshot.procedure,
      phases: snapshot.perioperativePhases,
      metadata: snapshot.simulationMetadata,
      scenarioManifest: snapshot.scenarioManifest,
    },
    devices: snapshot.devices,
    observations: snapshot.observations,
    waveforms: snapshot.waveforms,
    quality: snapshot.qualityStates,
    medications: snapshot.medications,
    events: snapshot.events,
    episodes: snapshot.episodes,
    predictions: snapshot.predictions,
    alerts: snapshot.alerts,
    faults: snapshot.activeFaults,
    claims: snapshot.recordClaims,
  };
}
