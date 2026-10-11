import type { SimulationAlert } from "./alerts";
import type { SimulationFaultActivation } from "./faults";
import type { SimulationAuditEntry } from "./audit";
import type { SafeAnesSimulationCase } from "./case";
import type { RecordClaim } from "./claims";
import type { SimulationDevice } from "./devices";
import type { SimulationEpisode } from "./episodes";
import type { SimulationEvent } from "./events";
import type { MedicationRecord } from "./medications";
import type { Observation } from "./observations";
import type { PredictionEvent } from "./predictions";
import type { SignalQualityState } from "./quality";
import type { WaveformSegment } from "./waveforms";
import type { TemporalRelationship } from "../engines/uc02";

import {
  SIMULATION_SPEEDS,
  type SimulationSpeed,
  type SimulationClockStatus,
  type SimulationClockSnapshot,
} from "./clock";

export {
  SIMULATION_SPEEDS,
  type SimulationSpeed,
  type SimulationClockStatus,
  type SimulationClockSnapshot,
};

export interface SimulationEventGraphEdge {
  eventId: string;
  relatedEventId: string;
  relationship: TemporalRelationship;
}

export interface SimulationSnapshot
  extends Omit<
    SafeAnesSimulationCase,
    | "events"
    | "observations"
    | "waveforms"
    | "medications"
    | "episodes"
    | "predictions"
    | "alerts"
    | "recordClaims"
    | "qualityStates"
    | "devices"
    | "perioperativePhases"
  > {
  status: SimulationClockStatus;
  speed: SimulationSpeed;
  perioperativePhases: SafeAnesSimulationCase["perioperativePhases"];
  devices: SimulationDevice[];
  observations: Observation[];
  waveforms: WaveformSegment[];
  medications: MedicationRecord[];
  events: SimulationEvent[];
  episodes: SimulationEpisode[];
  predictions: PredictionEvent[];
  alerts: SimulationAlert[];
  activeFaults: SimulationFaultActivation[];
  recordClaims: RecordClaim[];
  qualityStates: SignalQualityState[];
  eventGraph: SimulationEventGraphEdge[];
  auditEntries: SimulationAuditEntry[];
  processedEventCount: number;
}

/** A deterministic, synchronous pipeline extension point for future UC engines. */
export interface SimulationStageResult {
  stateChanges?: string[];
  rulesTriggered?: string[];
  observationsAdded?: Observation[];
  waveformsAdded?: WaveformSegment[];
  medicationsAdded?: MedicationRecord[];
  episodesAdded?: SimulationEpisode[];
  qualityStatesUpdated?: SignalQualityState[];
  predictionsGenerated?: PredictionEvent[];
  alertsCreated?: SimulationAlert[];
  alertsUpdated?: SimulationAlert[];
  claimsUpdated?: RecordClaim[];
}

export interface SimulationProcessingContext {
  event: SimulationEvent;
  simulationTime: number;
  /** Static identity only. Future event and case-state arrays are deliberately omitted. */
  caseInfo: Pick<
    SafeAnesSimulationCase,
    "scenarioId" | "seed" | "simulationMetadata" | "scenarioManifest" | "patient" | "encounter" | "procedure"
  >;
  snapshot: SimulationSnapshot;
}

export interface SimulationPipeline {
  ingestRawEvent?: (context: SimulationProcessingContext) => SimulationStageResult | void;
  updateCanonicalState?: (context: SimulationProcessingContext) => SimulationStageResult | void;
  updateQualityState?: (context: SimulationProcessingContext) => SimulationStageResult | void;
  runUseCaseEngines?: (context: SimulationProcessingContext) => SimulationStageResult | void;
  createPredictions?: (context: SimulationProcessingContext) => SimulationStageResult | void;
  runAlertPolicy?: (context: SimulationProcessingContext) => SimulationStageResult | void;
  updateEventGraphAndClaims?: (context: SimulationProcessingContext) => SimulationStageResult | void;
}

export interface SimulationEngineOptions {
  initialTime?: number;
  speed?: SimulationSpeed;
  pipeline?: SimulationPipeline;
}

export interface SimulationFrame {
  simulationTime: number;
  emittedEvents: SimulationEvent[];
  snapshot: SimulationSnapshot;
}

export type SimulationJumpTarget =
  | "PRE_OP"
  | "INDUCTION"
  | "MAINTENANCE"
  | "HEMODYNAMIC_EVENT"
  | "RESPIRATORY_EVENT"
  | "EMERGENCE";
