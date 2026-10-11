import type { SimulationAlert } from "./alerts";
import type { RecordClaim } from "./claims";
import type { SimulationDevice } from "./devices";
import type { SimulationEpisode } from "./episodes";
import type { SimulationEvent } from "./events";
import type { MedicationRecord } from "./medications";
import type { Observation } from "./observations";
import type { PatientContext, EncounterContext, ProcedureContext } from "./patient";
import type { PredictionEvent } from "./predictions";
import type { SignalQualityState } from "./quality";
import type { SafeAnesScenarioManifest } from "./scenarioManifest";
import type { WaveformSegment } from "./waveforms";

export interface SimulationMetadata {
  synthetic: true;
  clinicalUse: false;
  purpose: "SafeAnes UI and workflow demonstration";
}

export interface PerioperativePhase {
  id: string;
  label: string;
  startTime: number;
  endTime?: number;
  status: "COMPLETED" | "CURRENT" | "FUTURE";
}

/** Canonical, UI-independent state shared by every SafeAnes use case. */
export interface SafeAnesSimulationCase {
  scenarioId: string;
  seed: number;
  simulationMetadata: SimulationMetadata;
  scenarioManifest: SafeAnesScenarioManifest;
  /** Current replay cursor, elapsed milliseconds from encounter.startedAt. */
  simulationTime: number;
  patient: PatientContext;
  encounter: EncounterContext;
  procedure: ProcedureContext;
  perioperativePhases: PerioperativePhase[];
  devices: SimulationDevice[];
  observations: Observation[];
  waveforms: WaveformSegment[];
  medications: MedicationRecord[];
  events: SimulationEvent[];
  episodes: SimulationEpisode[];
  predictions: PredictionEvent[];
  alerts: SimulationAlert[];
  recordClaims: RecordClaim[];
  qualityStates: SignalQualityState[];
}
