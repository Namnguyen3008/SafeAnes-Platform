export interface VitalDbObservation {
  timestamp: number;
  value: number | null;
  unit: string;
  quality: string;
  is_missing: boolean;
}

export interface VitalDbSignalSeries {
  signal: string;
  track_name: string;
  unit: string;
  source: string;
  quality: string;
  observations: VitalDbObservation[];
}

export interface VitalDbPrediction {
  case_id: string;
  model_id: string;
  model_version: string;
  prediction_time: number;
  input_window_start: number;
  input_window_end: number;
  task: string;
  raw_output: number;
  interpreted_output: { kind: string; value: number; calibrated?: boolean };
  horizon_minutes_or_null: number | null;
  data_coverage: number;
  quality: string;
  missing_features?: string[];
  calibrated_or_not: boolean;
  threshold_if_verified: number | null;
  artifact_sha256: string;
  [key: string]: unknown;
}

export interface VitalDbPredictionCacheMetadata {
  case_id?: string;
  model_id?: string;
  model_version?: string | null;
  artifact_sha256?: string | null;
  cache_status?: "READY" | "NOT_READY" | string | null;
  prediction_count?: number | null;
  inference_window_count?: number | null;
  abstained_window_count?: number | null;
  abstained_windows?: Array<Record<string, unknown>>;
  window_eligibility?: string | null;
  window_status?: string | null;
  window_reason?: string | null;
  reason?: string | null;
  window_prediction_time_s?: number | null;
  window_start_s?: number | null;
  window_end_s?: number | null;
  [key: string]: unknown;
}

export interface UC04PredictionEnvelope {
  predictions: VitalDbPrediction[];
  cache_status?: "READY" | "NOT_READY" | string | null;
  prediction_count?: number | null;
  inference_window_count?: number | null;
  abstained_window_count?: number | null;
  abstained_windows?: Array<Record<string, unknown>>;
  window_eligibility?: string | null;
  window_status?: string | null;
  window_reason?: string | null;
  reason?: string | null;
  window_prediction_time_s?: number | null;
  window_start_s?: number | null;
  window_end_s?: number | null;
}

export interface UC04VitalDbView {
  case_id: string;
  dataset: string;
  dataset_version: string;
  as_of_s: number;
  window_start_s: number;
  window_end_s: number;
  available_tracks: string[];
  signals: VitalDbSignalSeries[];
  abp_waveform: {
    start_time_s: number;
    end_time_s: number;
    timestamps: number[];
    values: Array<number | null>;
    sample_rate_hz?: number;
    display_range?: { min: number; max: number } | null;
    missing_intervals?: Array<{ start_time_s: number; end_time_s: number }>;
    quality?: string;
    unit?: string;
    source?: string;
  } | null;
  events: Array<{ timestamp: number; event_type?: string; description: string; source?: string; quality?: string }>;
  predictions?: UC04PredictionEnvelope | null;
  prediction_cache_status: "READY" | "NOT_READY";
  prediction_cache?: VitalDbPredictionCacheMetadata | null;
  model: {
    model_id: string;
    model_version: string;
    artifact_sha256: string;
    task: string;
    output_semantics: string;
    calibration_status: string;
    calibration_method?: string | null;
    horizons_minutes: number[];
    readiness_status: string;
    inference_contract_mode: string;
    clinical_use: false;
  };
}

export interface UC04VitalDbProjection extends Omit<UC04VitalDbView, "predictions"> {
  asOfSeconds: number;
  latestBySignal: Record<string, VitalDbObservation | null>;
  predictions: VitalDbPrediction[];
  latestPredictions: VitalDbPrediction[];
  predictionCacheStatus: "READY" | "NOT_READY" | string;
  abstainedWindowCount: number | null;
  inferenceWindowCount: number | null;
  predictionCount: number | null;
  windowEligibility: string;
  windowReason: string | null;
  windowPredictionTimeSeconds: number | null;
  windowStartSeconds: number | null;
  windowEndSeconds: number | null;
}

const SUPPORTED_UC04_HORIZONS = new Set([5, 10, 15]);

/**
 * Projects the API view into one as-of UC04 snapshot. Missing newest values stay
 * missing; the adapter never carries a prior measurement forward or predicts an
 * observed event from model output.
 */
export function projectUC04VitalDbView(
  view: UC04VitalDbView,
  asOfSeconds: number
): UC04VitalDbProjection {
  if (!Number.isFinite(asOfSeconds) || asOfSeconds < 0) {
    throw new RangeError("UC04 VitalDB as-of time must be a finite non-negative case-relative time.");
  }
  if (asOfSeconds > view.as_of_s) {
    throw new RangeError("UC04 VitalDB response does not contain the requested as-of time.");
  }
  const signals = view.signals.map((series) => ({
    ...series,
    observations: series.observations.filter((sample) => sample.timestamp <= asOfSeconds),
  }));
  const latestBySignal: Record<string, VitalDbObservation | null> = {};
  for (const series of signals) {
    const latest = series.observations.reduce<VitalDbObservation | null>(
      (current, sample) => current === null || sample.timestamp > current.timestamp ? sample : current,
      null
    );
    latestBySignal[series.signal] = latest;
  }

  const duePredictions = (view.predictions?.predictions ?? [])
    .filter((prediction) => prediction.prediction_time <= asOfSeconds &&
      SUPPORTED_UC04_HORIZONS.has(Number(prediction.horizon_minutes_or_null)))
    .sort((left, right) => left.prediction_time - right.prediction_time ||
      Number(left.horizon_minutes_or_null) - Number(right.horizon_minutes_or_null));
  const latestPredictionTime = duePredictions.reduce(
    (latest, prediction) => Math.max(latest, prediction.prediction_time), -1
  );
  const latestPredictions = duePredictions.filter((prediction) => prediction.prediction_time === latestPredictionTime);
  const cache: UC04PredictionEnvelope = view.predictions ?? { predictions: [] };
  const cacheMetadata = view.prediction_cache ?? {};
  const predictionCacheStatus = String(cache.cache_status ?? view.prediction_cache_status ?? "NOT_READY").toUpperCase();
  const abstainedWindowCount = finiteOrNull(cache.abstained_window_count ?? cacheMetadata.abstained_window_count);
  const inferenceWindowCount = finiteOrNull(cache.inference_window_count ?? cacheMetadata.inference_window_count);
  const predictionCount = finiteOrNull(cache.prediction_count ?? cacheMetadata.prediction_count);
  const windowEligibility = String(
    cache.window_eligibility ?? cache.window_status ?? cacheMetadata.window_eligibility ?? cacheMetadata.window_status ?? "UNKNOWN"
  ).toUpperCase();
  const windowReason = (
    cache.window_reason ?? cache.reason ?? cacheMetadata.window_reason ?? cacheMetadata.reason ?? null
  ) as string | null;
  const windowPredictionTimeSeconds = finiteOrNull(
    cache.window_prediction_time_s ?? cacheMetadata.window_prediction_time_s,
  );
  const windowStartSeconds = finiteOrNull(cache.window_start_s ?? cacheMetadata.window_start_s);
  const windowEndSeconds = finiteOrNull(cache.window_end_s ?? cacheMetadata.window_end_s);

  const waveform = view.abp_waveform;
  let abpWaveform = null;
  if (waveform) {
    const length = Math.min(waveform.timestamps.length, waveform.values.length);
    const pairs = Array.from({ length }, (_, index) => ({
      timestamp: waveform.timestamps[index],
      value: waveform.values[index],
    })).filter((sample) => sample.timestamp <= asOfSeconds);
    abpWaveform = {
      ...waveform,
      timestamps: pairs.map((sample) => sample.timestamp),
      values: pairs.map((sample) => sample.value),
      end_time_s: Math.min(waveform.end_time_s, asOfSeconds),
    };
  }

  return {
    ...view,
    asOfSeconds,
    signals,
    latestBySignal,
    events: view.events.filter((event) => event.timestamp <= asOfSeconds),
    abp_waveform: abpWaveform,
    predictions: duePredictions,
    latestPredictions,
    predictionCacheStatus,
    abstainedWindowCount,
    inferenceWindowCount,
    predictionCount,
    windowEligibility,
    windowReason,
    windowPredictionTimeSeconds,
    windowStartSeconds,
    windowEndSeconds,
  };
}

function finiteOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
