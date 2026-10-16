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
  coverage: number | null;
  missing_features: string[];
  latency_ms: number;
}

export function parseInferenceEvent(raw: string): LiveInferenceResultPayload | null {
  try {
    const data = JSON.parse(raw);
    if (data && data.event === "inference_result" && Array.isArray(data.predictions)) {
      return data as LiveInferenceResultPayload;
    }
    return null;
  } catch {
    return null;
  }
}
