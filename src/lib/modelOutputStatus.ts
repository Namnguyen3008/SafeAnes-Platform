export type ModelOutputDisplayState =
  | "LOADING"
  | "MODEL_NOT_READY"
  | "ABSTAINED"
  | "INFERENCE_FAILED"
  | "PREDICTION_CACHE_NOT_READY"
  | "NO_OUTPUT"
  | "READY";

export type ModelOutputWindowEligibility = "ELIGIBLE" | "ABSTAINED" | "INSUFFICIENT_DATA" | "UNKNOWN";

export interface ModelOutputStateInput {
  loading: boolean;
  readinessStatus?: string | null;
  predictionCacheStatus?: string | null;
  windowEligibility?: ModelOutputWindowEligibility | string | null;
  hasOutput: boolean;
}

export interface ModelOutputStateProjection extends ModelOutputStateInput {
  state: ModelOutputDisplayState;
}

/**
 * Converts backend readiness and replay evidence into a small presentation
 * state. The UI must not turn an absent recorded output into a synthetic
 * score, confidence, or horizon.
 */
export function classifyModelOutputState({
  loading,
  readinessStatus,
  predictionCacheStatus,
  windowEligibility,
  hasOutput,
}: ModelOutputStateInput): ModelOutputDisplayState {
  if (loading) return "LOADING";

  const normalized = String(readinessStatus ?? "MODEL_NOT_READY").trim().toUpperCase();
  if (normalized === "ABSTAINED" || normalized === "INSUFFICIENT_DATA" || normalized === "INPUT_NOT_ELIGIBLE") {
    return "ABSTAINED";
  }
  if (normalized === "INFERENCE_FAILED" || normalized.includes("INFERENCE_FAILED")) {
    return "INFERENCE_FAILED";
  }
  if (
    normalized !== "INTEGRATION_READY" &&
    normalized !== "READY" &&
    normalized !== "AVAILABLE"
  ) {
    return "MODEL_NOT_READY";
  }
  const window = String(windowEligibility ?? "UNKNOWN").trim().toUpperCase();
  if (window === "ABSTAINED" || window === "INSUFFICIENT_DATA" || window === "INPUT_NOT_ELIGIBLE") {
    return "ABSTAINED";
  }
  const cache = String(predictionCacheStatus ?? "UNKNOWN").trim().toUpperCase();
  if (cache === "NOT_READY" || cache === "CACHE_NOT_READY" || cache === "UNAVAILABLE") {
    return "PREDICTION_CACHE_NOT_READY";
  }
  return hasOutput ? "READY" : "NO_OUTPUT";
}

/**
 * Shared projection used by every recorded-model surface. Keeping the source
 * evidence in this projection prevents secondary cards from collapsing cache,
 * readiness, and current-window eligibility into a generic empty state.
 */
export function projectModelOutputState(input: ModelOutputStateInput): ModelOutputStateProjection {
  return { ...input, state: classifyModelOutputState(input) };
}

export function modelOutputStateMessageKey(state: ModelOutputDisplayState): string {
  switch (state) {
    case "LOADING": return "modelLoading";
    case "MODEL_NOT_READY": return "modelNotReady";
    case "ABSTAINED": return "modelAbstained";
    case "INFERENCE_FAILED": return "modelInferenceFailed";
    case "PREDICTION_CACHE_NOT_READY": return "modelCacheNotReady";
    case "NO_OUTPUT": return "noEligibleOutput";
    case "READY": return "ready";
  }
}
