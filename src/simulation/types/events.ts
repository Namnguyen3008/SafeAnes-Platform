import type { QualityState } from "./quality";

export type EventSourceType =
  | "DEVICE"
  | "MANUAL"
  | "RULE"
  | "MODEL"
  | "SYSTEM";

export type EventProvenance =
  | "DIRECT"
  | "DERIVED"
  | "INFERRED"
  | "CLINICIAN_CONFIRMED";

/**
 * All numeric times are milliseconds elapsed from encounter.startedAt.
 * eventTime is when the simulated event happened; recordedTime is when it
 * entered the record. The case's simulationTime is the replay cursor.
 */
export type SimulationEvent<TPayload = unknown> = {
  id: string;
  eventTime: number;
  recordedTime?: number;
  source: string;
  sourceType: EventSourceType;
  eventType: string;
  payload: TPayload;
  quality?: QualityState;
  provenance: EventProvenance;
  relatedEventIds?: string[];
  evidenceRefs?: string[];
};

export type SimulationEventPayload = Record<string, string | number | boolean | null>;
