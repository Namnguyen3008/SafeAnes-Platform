import type { QualityStatus } from "@/simulation/types/quality";
import { takeReplayWaveformMergeLineage } from "./vitalDbReplayBuffer";

export interface UC05RecordedObservation {
  timestamp: number;
  value: number | null;
  unit: string;
  source: string;
  quality: string;
  is_missing: boolean;
  provenance?: Record<string, unknown>;
}

export interface UC05VitalDbSignal {
  signal: string;
  track_name: string;
  unit: string;
  source: string;
  quality: string;
  observed_update_rate_hz?: number | string;
  observations: UC05RecordedObservation[];
}

export interface UC05VitalDbWaveform {
  case_id: string;
  track_name: string;
  start_time_s: number;
  end_time_s: number;
  sample_rate_hz: number;
  unit: string;
  display_range?: { min: number; max: number } | null;
  source: string;
  quality: string;
  timestamps: number[];
  values: Array<number | null>;
  is_missing: boolean[];
  missing_intervals: Array<{ start_time_s: number; end_time_s: number }>;
  provenance: Record<string, unknown>;
}

export interface UC05VitalDbPrediction {
  case_id: string;
  model_id: string;
  model_version: string;
  prediction_time: number;
  input_window_start: number;
  input_window_end: number;
  task: string;
  raw_output: number;
  interpreted_output: { kind: string; value: number; calibrated?: boolean; threshold?: number | null; [key: string]: unknown };
  horizon_minutes_or_null: number | null;
  data_coverage: number;
  quality: string;
  missing_features?: string[];
  artifact_sha256: string;
  [key: string]: unknown;
}

export interface UC05PredictionCacheMetadata {
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

export interface UC05VitalDbEvent {
  id: string;
  timestamp: number;
  available_at_s?: number;
  start_time_s?: number;
  end_time_s?: number;
  event_type: string;
  description: string;
  definition: string;
  source: string;
  source_class: "OBSERVED" | "DERIVED";
  quality: string;
  provenance: Record<string, unknown>;
}

export interface UC05VitalDbView {
  case_id: string;
  dataset: string;
  dataset_version: string;
  as_of_s: number;
  window_start_s: number;
  window_end_s: number;
  time_basis: "seconds_since_case_start";
  available_tracks: string[];
  signals: UC05VitalDbSignal[];
  waveforms: Record<string, UC05VitalDbWaveform | null>;
  recorded_events: UC05VitalDbEvent[];
  derived_events: UC05VitalDbEvent[];
  predictions: {
    case_id: string;
    model_id: string;
    source: string;
    cache_status: string;
    as_of_s: number;
    available_horizons_minutes: number[];
    predictions: UC05VitalDbPrediction[];
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
  } | UC05VitalDbPrediction[] | null;
  prediction_cache_status: "READY" | "NOT_READY";
  prediction_cache?: UC05PredictionCacheMetadata | null;
  model: {
    model_id: string;
    model_version: string;
    artifact_sha256: string;
    task: string;
    horizons_minutes: number[];
    readiness_status: string;
    inference_contract_mode: string;
    clinical_use: false;
    output_semantics?: Record<string, unknown>;
    calibration_status?: string;
    calibration_method?: string | null;
    decision_threshold?: Record<string, number> | null;
  };
}

export interface UC05VitalDbProjection extends Omit<UC05VitalDbView, "predictions"> {
  predictions: UC05VitalDbPrediction[];
  latestBySignal: Record<string, UC05RecordedObservation | null>;
  latestPredictions: UC05VitalDbPrediction[];
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

export interface RecordedWaveformSample {
  eventTime: number;
  receivedTime: number;
  sourceDevice: string;
  value: number | null;
  quality: QualityStatus;
  provenance: "DIRECT";
}

const recordedSampleCache = new WeakMap<UC05VitalDbWaveform, Map<string, RecordedWaveformSample[]>>();

export function projectUC05VitalDbView(view: UC05VitalDbView, asOfSeconds: number): UC05VitalDbProjection {
  if (!Number.isFinite(asOfSeconds) || asOfSeconds < 0 || asOfSeconds > view.as_of_s) {
    throw new RangeError("UC05 VitalDB projection time must be within the returned as-of window.");
  }
  const signals = view.signals.map((series) => ({
    ...series,
    observations: series.observations.filter((sample) => sample.timestamp <= asOfSeconds),
  }));
  const latestBySignal: Record<string, UC05RecordedObservation | null> = {};
  for (const series of signals) {
    latestBySignal[series.signal] = series.observations.reduce<UC05RecordedObservation | null>(
      (latest, item) => latest === null || item.timestamp > latest.timestamp ? item : latest,
      null,
    );
  }
  const waveforms = Object.fromEntries(Object.entries(view.waveforms).map(([name, waveform]) => {
    if (!waveform) return [name, null];
    const arraysAligned = waveform.timestamps.length === waveform.values.length;
    const allSamplesAsOf = arraysAligned && waveform.timestamps.every((timestamp) =>
      Number.isFinite(timestamp) && timestamp <= asOfSeconds,
    );
    const allQualityIntervalsAsOf = waveform.missing_intervals.every((interval) =>
      interval.start_time_s <= asOfSeconds && interval.end_time_s <= asOfSeconds,
    );
    if (allSamplesAsOf && allQualityIntervalsAsOf && waveform.end_time_s <= asOfSeconds) {
      return [name, waveform];
    }

    const timestamps: number[] = [];
    const values: Array<number | null> = [];
    const isMissing: boolean[] = [];
    const length = Math.min(waveform.timestamps.length, waveform.values.length);
    const earliestAllowed = Math.max(0, asOfSeconds - 14.0);
    for (let index = 0; index < length; index += 1) {
      const timestamp = waveform.timestamps[index];
      if (!Number.isFinite(timestamp) || timestamp < earliestAllowed || timestamp > asOfSeconds) continue;
      const value = waveform.values[index];
      timestamps.push(timestamp);
      values.push(value);
      isMissing.push(waveform.is_missing[index] ?? value === null);
    }
    return [name, {
      ...waveform,
      timestamps,
      values,
      is_missing: isMissing,
      missing_intervals: waveform.missing_intervals
        .filter((interval) => interval.end_time_s >= earliestAllowed && interval.start_time_s <= asOfSeconds)
        .map((interval) => ({ ...interval, end_time_s: Math.min(interval.end_time_s, asOfSeconds) })),
      end_time_s: Math.min(waveform.end_time_s, asOfSeconds),
    }];
  }));
  const predictionRows = Array.isArray(view.predictions) ? view.predictions : (view.predictions?.predictions ?? []);
  const predictionEnvelope = Array.isArray(view.predictions) ? null : view.predictions;
  const cacheMetadata = view.prediction_cache ?? {};
  const predictionCacheStatus = String(
    predictionEnvelope?.cache_status ?? view.prediction_cache_status ?? "NOT_READY"
  ).toUpperCase();
  const abstainedWindowCount = finiteOrNull(predictionEnvelope?.abstained_window_count ?? cacheMetadata.abstained_window_count);
  const inferenceWindowCount = finiteOrNull(predictionEnvelope?.inference_window_count ?? cacheMetadata.inference_window_count);
  const predictionCount = finiteOrNull(predictionEnvelope?.prediction_count ?? cacheMetadata.prediction_count);
  const windowEligibility = String(
    predictionEnvelope?.window_eligibility ?? predictionEnvelope?.window_status ?? cacheMetadata.window_eligibility ?? cacheMetadata.window_status ?? "UNKNOWN"
  ).toUpperCase();
  const windowReason = (
    predictionEnvelope?.window_reason ?? predictionEnvelope?.reason ??
    cacheMetadata.window_reason ?? cacheMetadata.reason ?? null
  ) as string | null;
  const windowPredictionTimeSeconds = finiteOrNull(
    predictionEnvelope?.window_prediction_time_s ?? cacheMetadata.window_prediction_time_s,
  );
  const windowStartSeconds = finiteOrNull(
    predictionEnvelope?.window_start_s ?? cacheMetadata.window_start_s,
  );
  const windowEndSeconds = finiteOrNull(
    predictionEnvelope?.window_end_s ?? cacheMetadata.window_end_s,
  );
  const predictions = predictionRows
    .filter((item) => item.prediction_time <= asOfSeconds)
    .sort((left, right) => left.prediction_time - right.prediction_time ||
      horizonOrder(left.horizon_minutes_or_null) - horizonOrder(right.horizon_minutes_or_null));
  const latestTime = predictions.reduce((latest, item) => Math.max(latest, item.prediction_time), -1);
  const latestPredictions = predictions.filter((item) => item.prediction_time === latestTime);
  return {
    ...view,
    as_of_s: asOfSeconds,
    signals,
    waveforms,
    recorded_events: view.recorded_events.filter((event) => event.timestamp <= asOfSeconds),
    derived_events: view.derived_events.filter((event) => (event.end_time_s ?? event.timestamp) <= asOfSeconds),
    predictions,
    latestBySignal,
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

export function toRecordedWaveformSamples(
  waveform: UC05VitalDbWaveform | null,
  sourceDevice?: string,
): RecordedWaveformSample[] {
  if (!waveform) return [];
  const device = sourceDevice ?? waveform.source;
  const byDevice = recordedSampleCache.get(waveform);
  const cached = byDevice?.get(device);
  if (cached) {
    takeReplayWaveformMergeLineage(waveform);
    return cached;
  }
  const lineage = takeReplayWaveformMergeLineage(waveform);
  const previousSamples = lineage?.previous
    ? recordedSampleCache.get(lineage.previous)?.get(device)
    : undefined;
  if (previousSamples && lineage) {
    const incomingSamples = lineage.incoming
      ? buildRecordedWaveformSamples(lineage.incoming, device)
      : [];
    return cacheRecordedSamples(waveform, device, mergeRecordedWaveformChunks(
      previousSamples,
      incomingSamples,
      lineage.earliest_seconds * 1_000,
      lineage.as_of_seconds * 1_000,
      normalizeQuality(waveform.quality),
    ));
  }
  return cacheRecordedSamples(waveform, device, buildRecordedWaveformSamples(waveform, device));
}

function buildRecordedWaveformSamples(
  waveform: UC05VitalDbWaveform,
  sourceDevice: string,
): RecordedWaveformSample[] {
  const length = Math.min(waveform.timestamps.length, waveform.values.length);
  const cutoffTime = waveform.end_time_s - 14.0;
  let startIndex = 0;
  let low = 0;
  let high = length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (waveform.timestamps[mid] < cutoffTime) low = mid + 1;
    else high = mid;
  }
  startIndex = low;

  const result: RecordedWaveformSample[] = [];
  const quality = normalizeQuality(waveform.quality);
  for (let index = startIndex; index < length; index += 1) {
    const eventTime = waveform.timestamps[index] * 1_000;
    result.push({
      eventTime,
      receivedTime: eventTime,
      sourceDevice,
      value: waveform.is_missing[index] || waveform.values[index] === null ? null : waveform.values[index],
      quality,
      provenance: "DIRECT" as const,
    });
  }
  return result;
}

function cacheRecordedSamples(
  waveform: UC05VitalDbWaveform,
  device: string,
  recordedSamples: RecordedWaveformSample[],
): RecordedWaveformSample[] {
  const byDevice = recordedSampleCache.get(waveform) ?? new Map<string, RecordedWaveformSample[]>();
  byDevice.set(device, recordedSamples);
  recordedSampleCache.set(waveform, byDevice);
  return recordedSamples;
}

function mergeRecordedWaveformChunks(
  previous: readonly RecordedWaveformSample[],
  incoming: readonly RecordedWaveformSample[],
  earliestTime: number,
  asOfTime: number,
  quality: QualityStatus,
): RecordedWaveformSample[] {
  const result: RecordedWaveformSample[] = [];
  let previousIndex = lowerBoundRecordedTime(previous, earliestTime);
  let incomingIndex = lowerBoundRecordedTime(incoming, earliestTime);
  while (previousIndex < previous.length || incomingIndex < incoming.length) {
    const previousTime = previousIndex < previous.length
      ? previous[previousIndex].eventTime
      : Number.POSITIVE_INFINITY;
    const incomingTime = incomingIndex < incoming.length
      ? incoming[incomingIndex].eventTime
      : Number.POSITIVE_INFINITY;
    const eventTime = Math.min(previousTime, incomingTime);
    if (!Number.isFinite(eventTime) || eventTime > asOfTime) break;

    let previousSample: RecordedWaveformSample | undefined;
    while (previousIndex < previous.length && previous[previousIndex].eventTime === eventTime) {
      previousSample = previous[previousIndex];
      previousIndex += 1;
    }
    let incomingSample: RecordedWaveformSample | undefined;
    while (incomingIndex < incoming.length && incoming[incomingIndex].eventTime === eventTime) {
      incomingSample = incoming[incomingIndex];
      incomingIndex += 1;
    }
    const selected = incomingSample ?? previousSample;
    if (!selected) continue;
    result.push(selected.quality === quality ? selected : { ...selected, quality });
  }
  return result;
}

function lowerBoundRecordedTime(samples: readonly RecordedWaveformSample[], timestamp: number): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (samples[middle].eventTime < timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

function horizonOrder(horizon: number | null): number {
  return horizon === null ? 99 : horizon;
}

function normalizeQuality(value: string): QualityStatus {
  const upper = value.toUpperCase();
  if (["GOOD", "DEGRADED", "TECHNICAL_DROPOUT", "EXPECTED_INTERMITTENT", "STRUCTURAL_NOT_MONITORED", "INVALIDATED_ARTIFACT", "UNKNOWN", "UNAVAILABLE"].includes(upper)) {
    return upper as QualityStatus;
  }
  return "UNKNOWN";
}
