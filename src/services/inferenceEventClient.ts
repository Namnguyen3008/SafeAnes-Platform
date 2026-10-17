import type { ReplaySessionResponse } from "@/lib/api/safeanesClient";

export interface LiveInferencePredictionItem {
  horizon_minutes_or_null?: number | null;
  raw_output?: number | null;
  interpreted_output?: {
    value: number;
    kind: string;
    calibrated?: boolean;
    [key: string]: unknown;
  };
  prediction_time?: number;
  data_coverage?: number;
  missing_features?: string[];
  [key: string]: unknown;
}

export interface LiveInferenceResultPayload {
  event: "inference_result";
  session_id: string;
  generation: number;
  case_id: string;
  model_id: string;
  prediction_time: number;
  predictions: LiveInferencePredictionItem[];
  source: "LIVE_INFERENCE";
  coverage: number | null;
  missing_features: string[];
  latency_ms: number;
}


export interface LiveInferenceErrorPayload {
  event: "inference_error";
  session_id: string;
  generation: number;
  case_id: string;
  model_id: string;
  prediction_time: number;
  code: string;
}

export type LiveInferenceEventPayload =
  | LiveInferenceResultPayload
  | LiveInferenceErrorPayload;

export function parseInferenceEvent(
  eventName: "inference_result" | "inference_error",
  raw: string,
): LiveInferenceEventPayload | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !isRecord(data)
      || (eventName !== "inference_result" && eventName !== "inference_error")
      || !isNonEmptyString(data.session_id)
      || !isNonEmptyString(data.case_id)
      || !Number.isInteger(data.generation)
      || typeof data.generation !== "number"
      || data.generation < 0
      || !isNonEmptyString(data.model_id)
      || !isFiniteNumber(data.prediction_time)
      || (data.event !== undefined && data.event !== eventName)
    ) {
      return null;
    }

    if (eventName === "inference_result") {
      if (
        data.source !== "LIVE_INFERENCE"
        || !Array.isArray(data.predictions)
        || !data.predictions.every(isRecord)
        || (data.coverage !== null && !isFiniteNumber(data.coverage))
        || !Array.isArray(data.missing_features)
        || !data.missing_features.every((feature) => typeof feature === "string")
        || !isFiniteNumber(data.latency_ms)
      ) {
        return null;
      }
      return { ...data, event: eventName } as LiveInferenceResultPayload;
    }

    if (
      !isStableErrorCode(data.code)
    ) {
      return null;
    }
    return { ...data, event: eventName } as LiveInferenceErrorPayload;
  } catch {
    return null;
  }
}


export function isCurrentReplayEvent(
  payload: LiveInferenceEventPayload,
  session: ReplaySessionResponse | null,
): boolean {
  return Boolean(
    session
    && typeof session.generation === "number"
    && payload.session_id === session.session_id
    && payload.case_id === session.case_id
    && payload.generation === session.generation
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStableErrorCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value);
}
