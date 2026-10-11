/** Model outputs are estimates, never clinical facts or observations. */
export interface PredictionEvent {
  id: string;
  modelId: string;
  modelVersion: string;
  task: string;
  /** Model evaluation time in elapsed milliseconds from encounter.startedAt. */
  timestamp: number;
  horizonMinutes: number;
  /** Probability, confidence, and dataCoverage are normalized to [0, 1]. */
  probability: number;
  confidence: number;
  dataCoverage: number;
  missingModalities: string[];
  synthetic?: true;
  clinicalUse?: false;
  /** Canonical inputs used for this deterministic demonstration output. */
  inputSummary?: Array<{
    signal: string;
    value: number;
    unit: string;
    provenance: "DIRECT" | "DERIVED" | "INFERRED" | "CLINICIAN_CONFIRMED";
  }>;
  output?: {
    label: string;
    value?: number | string;
    unit?: string;
  };
  relatedEventIds?: string[];
}
