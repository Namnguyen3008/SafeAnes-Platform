/**
 * Bounded client-side buffers for retrospective VitalDB replay.
 * Samples stay attached to their recorded case-relative timestamps. These
 * helpers never interpolate, carry values forward, or fill recording gaps.
 */

export interface TimedValue {
  timestamp: number;
  [key: string]: unknown;
}

export interface ReplayWaveformBuffer {
  start_time_s: number;
  end_time_s: number;
  timestamps: number[];
  values: Array<number | null>;
  is_missing?: boolean[];
  missing_intervals?: Array<{ start_time_s: number; end_time_s: number }>;
  [key: string]: unknown;
}

export interface ReplayWaveformMergeLineage<T = object> {
  previous: T | null;
  incoming: T | null;
  earliest_seconds: number;
  as_of_seconds: number;
}

const waveformMergeLineage = new WeakMap<object, ReplayWaveformMergeLineage<object>>();

/** One-step append lineage lets adapters reuse already-converted sample objects. */
export function takeReplayWaveformMergeLineage<T extends object>(
  waveform: T,
): ReplayWaveformMergeLineage<T> | null {
  const lineage = waveformMergeLineage.get(waveform);
  if (!lineage) return null;
  waveformMergeLineage.delete(waveform);
  return lineage as ReplayWaveformMergeLineage<T>;
}

export interface ReplayPrediction {
  model_id: string;
  prediction_time: number;
  horizon_minutes_or_null?: number | null;
  [key: string]: unknown;
}

export interface ReplaySnapshotFrame {
  case_id: string;
  as_of_s: number;
  duration_seconds: number;
  available_tracks: string[];
  track_metadata: Array<Record<string, unknown>>;
  uc04_view: Record<string, any>;
  uc05_view: Record<string, any>;
  medication_tracks: Array<Record<string, any>>;
}

export interface ReplayDeltaFrame {
  case_id: string;
  from_s: number;
  as_of_s: number;
  numeric_tracks: Array<Record<string, any>>;
  waveforms: Record<string, ReplayWaveformBuffer | null>;
  recorded_events: Array<Record<string, any>>;
  derived_events: Array<Record<string, any>>;
  medication_tracks: Array<Record<string, any>>;
  predictions: { uc04?: Record<string, any> | null; uc05?: Record<string, any> | null };
}

export interface VitalDbReplayBuffers {
  uc04View: Record<string, any> | null;
  uc05View: Record<string, any> | null;
  medicationTracks: Array<Record<string, any>>;
  trackMetadata: Array<Record<string, unknown>>;
  availableTracks: string[];
}

export const REPLAY_SIGNAL_WINDOW_SECONDS = 1_800;
export const REPLAY_WAVEFORM_WINDOW_SECONDS = 30;

export interface ReplaySessionCursorState {
  session_id: string;
  case_id: string;
  current_time_s: number;
  duration_seconds: number;
  status: string;
  speed: number;
  uc04_model_status?: string;
  uc05_model_status?: string;
}

/** Avoid React updates for identical SSE session heartbeats while paused. */
export function hasReplaySessionChanged(
  previous: ReplaySessionCursorState | null,
  next: ReplaySessionCursorState,
): boolean {
  if (!previous) return true;
  return previous.session_id !== next.session_id ||
    previous.case_id !== next.case_id ||
    previous.current_time_s !== next.current_time_s ||
    previous.duration_seconds !== next.duration_seconds ||
    previous.status !== next.status ||
    previous.speed !== next.speed ||
    previous.uc04_model_status !== next.uc04_model_status ||
    previous.uc05_model_status !== next.uc05_model_status;
}

export function mergeRecordedSamples<T extends TimedValue>(
  current: readonly T[],
  incoming: readonly T[],
  asOfSeconds: number,
  windowSeconds: number,
): T[] {
  if (!Number.isFinite(asOfSeconds) || !Number.isFinite(windowSeconds) || windowSeconds < 0) return [];
  const earliest = Math.max(0, asOfSeconds - windowSeconds);
  const byTimestamp = new Map<number, T>();
  for (const sample of [...current, ...incoming]) {
    if (!Number.isFinite(sample.timestamp) || sample.timestamp < earliest || sample.timestamp > asOfSeconds) continue;
    byTimestamp.set(sample.timestamp, sample);
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

export function mergeWaveformSamples<T extends ReplayWaveformBuffer>(
  current: T | null | undefined,
  incoming: T | null | undefined,
  asOfSeconds: number,
  windowSeconds: number,
): T | null {
  if (!Number.isFinite(asOfSeconds) || !Number.isFinite(windowSeconds) || windowSeconds < 0) return null;
  if (!current && !incoming) return null;

  const earliest = Math.max(0, asOfSeconds - windowSeconds);
  const canMergeInLinearTime = [current, incoming].every((waveform) =>
    !waveform || areWaveformTimestampsOrdered(waveform.timestamps, waveform.values.length),
  );
  const merged = canMergeInLinearTime
    ? mergeOrderedWaveformSamples(current, incoming, earliest, asOfSeconds)
    : mergeUnorderedWaveformSamples(current, incoming, earliest, asOfSeconds);
  const knownIntervals = [current, incoming]
    .filter((waveform): waveform is T => Boolean(waveform))
    .flatMap((waveform) => waveform.missing_intervals ?? [])
    .filter((interval) => Number.isFinite(interval.start_time_s) && Number.isFinite(interval.end_time_s) &&
      interval.end_time_s >= earliest && interval.start_time_s <= asOfSeconds)
    .map((interval) => ({
      start_time_s: Math.max(earliest, interval.start_time_s),
      end_time_s: Math.min(asOfSeconds, interval.end_time_s),
    }));
  const intervalMap = new Map<string, { start_time_s: number; end_time_s: number }>();
  for (const interval of knownIntervals) {
    intervalMap.set(`${interval.start_time_s}:${interval.end_time_s}`, interval);
  }

  const { timestamps, values, missingFlags } = merged;
  const firstTimestamp = timestamps[0] ?? Math.max(earliest, Math.min(asOfSeconds, incoming?.start_time_s ?? current?.start_time_s ?? asOfSeconds));
  const lastTimestamp = timestamps[timestamps.length - 1] ?? firstTimestamp;
  const metadata = incoming ?? current!;

  const result = {
    ...metadata,
    start_time_s: firstTimestamp,
    end_time_s: lastTimestamp,
    timestamps,
    values,
    ...(current?.is_missing || incoming?.is_missing
      ? { is_missing: missingFlags }
      : {}),
    ...(current?.missing_intervals || incoming?.missing_intervals
      ? { missing_intervals: [...intervalMap.values()].sort((left, right) => left.start_time_s - right.start_time_s) }
      : {}),
  } as T;
  // Keep only a single generation of parent references. A view that is not
  // currently mounted must not retain the entire replay history through a
  // chain of merge metadata.
  if (current) waveformMergeLineage.delete(current);
  waveformMergeLineage.set(result, {
    previous: current ?? null,
    incoming: incoming ?? null,
    earliest_seconds: earliest,
    as_of_seconds: asOfSeconds,
  });
  return result;
}

function areWaveformTimestampsOrdered(timestamps: readonly number[], valuesLength: number): boolean {
  const length = Math.min(timestamps.length, valuesLength);
  for (let index = 0; index < length; index += 1) {
    const timestamp = timestamps[index];
    if (!Number.isFinite(timestamp) || (index > 0 && timestamp < timestamps[index - 1])) return false;
  }
  return true;
}

function mergeOrderedWaveformSamples<T extends ReplayWaveformBuffer>(
  current: T | null | undefined,
  incoming: T | null | undefined,
  earliest: number,
  asOfSeconds: number,
): { timestamps: number[]; values: Array<number | null>; missingFlags: boolean[] } {
  const timestamps: number[] = [];
  const values: Array<number | null> = [];
  const missingFlags: boolean[] = [];
  let currentIndex = 0;
  let incomingIndex = 0;
  const currentLength = current ? Math.min(current.timestamps.length, current.values.length) : 0;
  const incomingLength = incoming ? Math.min(incoming.timestamps.length, incoming.values.length) : 0;

  while (currentIndex < currentLength || incomingIndex < incomingLength) {
    const currentTime = currentIndex < currentLength ? current!.timestamps[currentIndex] : Number.POSITIVE_INFINITY;
    const incomingTime = incomingIndex < incomingLength ? incoming!.timestamps[incomingIndex] : Number.POSITIVE_INFINITY;
    const timestamp = Math.min(currentTime, incomingTime);
    if (!Number.isFinite(timestamp)) break;
    if (timestamp > asOfSeconds) break;

    let currentValue: number | null | undefined;
    let currentMissing = false;
    while (currentIndex < currentLength && current!.timestamps[currentIndex] === timestamp) {
      currentValue = current!.values[currentIndex];
      currentMissing = current!.is_missing?.[currentIndex] ?? currentValue === null;
      currentIndex += 1;
    }
    let incomingValue: number | null | undefined;
    let incomingMissing = false;
    while (incomingIndex < incomingLength && incoming!.timestamps[incomingIndex] === timestamp) {
      incomingValue = incoming!.values[incomingIndex];
      incomingMissing = incoming!.is_missing?.[incomingIndex] ?? incomingValue === null;
      incomingIndex += 1;
    }

    if (timestamp < earliest) continue;
    const hasIncoming = incomingValue !== undefined || incomingMissing;
    const value = hasIncoming ? incomingValue ?? null : currentValue ?? null;
    timestamps.push(timestamp);
    values.push(value);
    missingFlags.push(hasIncoming ? incomingMissing : currentMissing);
  }
  return { timestamps, values, missingFlags };
}

function mergeUnorderedWaveformSamples<T extends ReplayWaveformBuffer>(
  current: T | null | undefined,
  incoming: T | null | undefined,
  earliest: number,
  asOfSeconds: number,
): { timestamps: number[]; values: Array<number | null>; missingFlags: boolean[] } {
  const samples = new Map<number, { value: number | null; isMissing: boolean }>();
  for (const waveform of [current, incoming]) {
    if (!waveform) continue;
    const length = Math.min(waveform.timestamps.length, waveform.values.length);
    for (let index = 0; index < length; index += 1) {
      const timestamp = waveform.timestamps[index];
      if (!Number.isFinite(timestamp) || timestamp < earliest || timestamp > asOfSeconds) continue;
      const value = waveform.values[index];
      samples.set(timestamp, { value, isMissing: waveform.is_missing?.[index] ?? value === null });
    }
  }
  const ordered = [...samples.entries()].sort(([left], [right]) => left - right);
  return {
    timestamps: ordered.map(([timestamp]) => timestamp),
    values: ordered.map(([, sample]) => sample.value),
    missingFlags: ordered.map(([, sample]) => sample.isMissing),
  };
}

export function mergeReplayPredictions<T extends Record<string, any>>(
  current: readonly T[],
  incoming: readonly T[],
  asOfSeconds: number,
): T[] {
  if (!Number.isFinite(asOfSeconds)) return [];
  const key = (prediction: T) => [
    prediction.model_id,
    prediction.prediction_time,
    prediction.horizon_minutes_or_null ?? "none",
  ].join("|");
  const byPrediction = new Map<string, T>();
  for (const prediction of [...current, ...incoming]) {
    if (typeof prediction.model_id !== "string" || !Number.isFinite(prediction.prediction_time) || prediction.prediction_time > asOfSeconds) continue;
    byPrediction.set(key(prediction), prediction);
  }
  return [...byPrediction.values()].sort((left, right) =>
    left.prediction_time - right.prediction_time ||
    Number(left.horizon_minutes_or_null ?? Number.MAX_SAFE_INTEGER) -
      Number(right.horizon_minutes_or_null ?? Number.MAX_SAFE_INTEGER));
}

export function isReplayCaseSwitch(previousCaseId: string | null, nextCaseId: string | null): boolean {
  return previousCaseId !== nextCaseId;
}

export function replaceVitalDbReplaySnapshot(frame: ReplaySnapshotFrame): VitalDbReplayBuffers {
  return {
    uc04View: frame.uc04_view,
    uc05View: frame.uc05_view,
    medicationTracks: frame.medication_tracks ?? [],
    trackMetadata: frame.track_metadata ?? [],
    availableTracks: frame.available_tracks ?? [],
  };
}

export function mergeVitalDbReplayDelta(
  current: VitalDbReplayBuffers,
  frame: ReplayDeltaFrame,
): VitalDbReplayBuffers {
  const uc04View = current.uc04View ? mergeUC04Delta(current.uc04View, frame) : null;
  const uc05View = current.uc05View ? mergeUC05Delta(current.uc05View, frame) : null;
  const medicationTracks = mergeTrackRows(
    current.medicationTracks,
    frame.medication_tracks ?? [],
    frame.as_of_s,
    REPLAY_SIGNAL_WINDOW_SECONDS,
  );
  return {
    ...current,
    uc04View,
    uc05View,
    medicationTracks,
  };
}

export function filterUC04ViewAsOf<T extends Record<string, any>>(view: T, asOfSeconds: number): T {
  const predictions = filterPredictionContainer(view.predictions, asOfSeconds);
  return {
    ...view,
    as_of_s: Math.min(Number(view.as_of_s ?? asOfSeconds), asOfSeconds),
    signals: (view.signals ?? []).map((series: Record<string, any>) => ({
      ...series,
      observations: (series.observations ?? []).filter((sample: TimedValue) => sample.timestamp <= asOfSeconds),
    })),
    abp_waveform: filterWaveformAsOf(view.abp_waveform, asOfSeconds),
    events: (view.events ?? []).filter((event: Record<string, any>) => event.timestamp <= asOfSeconds),
    predictions,
    ...(view.prediction_cache !== undefined
      ? { prediction_cache: filterPredictionCacheMetadata(view.prediction_cache, predictions, asOfSeconds) }
      : {}),
  };
}

export function filterUC05ViewAsOf<T extends Record<string, any>>(view: T, asOfSeconds: number): T {
  const predictions = filterPredictionContainer(view.predictions, asOfSeconds);
  const waveforms = Object.fromEntries(Object.entries(view.waveforms ?? {}).map(([name, waveform]) => [
    name,
    filterWaveformAsOf(waveform, asOfSeconds),
  ]));
  return {
    ...view,
    as_of_s: Math.min(Number(view.as_of_s ?? asOfSeconds), asOfSeconds),
    signals: (view.signals ?? []).map((series: Record<string, any>) => ({
      ...series,
      observations: (series.observations ?? []).filter((sample: TimedValue) => sample.timestamp <= asOfSeconds),
    })),
    waveforms,
    recorded_events: (view.recorded_events ?? []).filter((event: Record<string, any>) =>
      Number(event.available_at_s ?? event.timestamp) <= asOfSeconds),
    derived_events: (view.derived_events ?? []).filter((event: Record<string, any>) =>
      Number(event.available_at_s ?? event.end_time_s ?? event.timestamp) <= asOfSeconds),
    predictions,
    ...(view.prediction_cache !== undefined
      ? { prediction_cache: filterPredictionCacheMetadata(view.prediction_cache, predictions, asOfSeconds) }
      : {}),
  };
}

function mergeUC04Delta(view: Record<string, any>, frame: ReplayDeltaFrame): Record<string, any> {
  const incomingBySignal = new Map<string, Record<string, any>>();
  for (const row of frame.numeric_tracks ?? []) {
    for (const alias of row.module_aliases ?? []) {
      if (typeof alias === "string" && alias.startsWith("uc04:")) {
        incomingBySignal.set(alias.slice("uc04:".length), row);
      }
    }
  }
  const signals = mergeSignals(view.signals ?? [], incomingBySignal, "uc04", frame.as_of_s);
  const abpWaveform = frame.waveforms?.abp
    ? mergeWaveformSamples(view.abp_waveform, frame.waveforms.abp, frame.as_of_s, REPLAY_WAVEFORM_WINDOW_SECONDS)
    : filterWaveformAsOf(view.abp_waveform, frame.as_of_s);
  const incomingPredictions = predictionRows(frame.predictions?.uc04);
  const currentPredictions = predictionRows(view.predictions);
  const predictions = mergePredictionContainer(
    view.predictions,
    frame.predictions?.uc04,
    currentPredictions,
    incomingPredictions,
    frame.as_of_s,
  );
  const events = mergeEvents(view.events ?? [], frame.recorded_events ?? [], frame.as_of_s);
  return {
    ...view,
    as_of_s: frame.as_of_s,
    window_start_s: Math.max(0, frame.as_of_s - REPLAY_SIGNAL_WINDOW_SECONDS),
    window_end_s: frame.as_of_s,
    signals,
    abp_waveform: abpWaveform,
    events,
    predictions,
  };
}

function mergeUC05Delta(view: Record<string, any>, frame: ReplayDeltaFrame): Record<string, any> {
  const incomingBySignal = new Map<string, Record<string, any>>();
  for (const row of frame.numeric_tracks ?? []) {
    for (const alias of row.module_aliases ?? []) {
      if (typeof alias === "string" && alias.startsWith("uc05:")) {
        incomingBySignal.set(alias.slice("uc05:".length), row);
      }
    }
  }
  const signals = mergeSignals(view.signals ?? [], incomingBySignal, "uc05", frame.as_of_s);
  const waveforms = { ...(view.waveforms ?? {}) };
  const waveformAliases: Record<string, string> = { pleth: "ppg" };
  for (const [name, waveform] of Object.entries(frame.waveforms ?? {})) {
    const viewName = waveformAliases[name] ?? name;
    if (!waveform) continue;
    waveforms[viewName] = mergeWaveformSamples(
      waveforms[viewName], waveform, frame.as_of_s, REPLAY_WAVEFORM_WINDOW_SECONDS,
    );
  }
  for (const [name, waveform] of Object.entries(waveforms)) {
    if (waveform) waveforms[name] = filterWaveformAsOf(waveform, frame.as_of_s);
  }
  const predictions = mergePredictionContainer(
    view.predictions,
    frame.predictions?.uc05,
    predictionRows(view.predictions),
    predictionRows(frame.predictions?.uc05),
    frame.as_of_s,
  );
  return {
    ...view,
    as_of_s: frame.as_of_s,
    window_start_s: Math.max(0, frame.as_of_s - REPLAY_SIGNAL_WINDOW_SECONDS),
    window_end_s: frame.as_of_s,
    signals,
    waveforms,
    recorded_events: mergeEvents(view.recorded_events ?? [], frame.recorded_events ?? [], frame.as_of_s),
    derived_events: mergeEvents(view.derived_events ?? [], frame.derived_events ?? [], frame.as_of_s),
    predictions,
  };
}

function mergeSignals(
  current: Array<Record<string, any>>,
  incomingBySignal: Map<string, Record<string, any>>,
  module: "uc04" | "uc05",
  asOfSeconds: number,
): Array<Record<string, any>> {
  const currentBySignal = new Map(current.map((series) => [series.signal, series]));
  for (const [signal, row] of incomingBySignal) {
    const previous = currentBySignal.get(signal);
    const observations = mergeRecordedSamples(
      previous?.observations ?? [],
      row.observations ?? [],
      asOfSeconds,
      REPLAY_SIGNAL_WINDOW_SECONDS,
    );
    currentBySignal.set(signal, {
      ...row,
      signal,
      ...(module === "uc05" ? { observed_update_rate_hz: row.observed_update_rate_hz } : {}),
      observations,
    });
  }
  return [...currentBySignal.values()].map((series) => ({
    ...series,
    observations: mergeRecordedSamples(series.observations ?? [], [], asOfSeconds, REPLAY_SIGNAL_WINDOW_SECONDS),
  }));
}

function mergeTrackRows(
  current: Array<Record<string, any>>,
  incoming: Array<Record<string, any>>,
  asOfSeconds: number,
  windowSeconds: number,
): Array<Record<string, any>> {
  const rows = new Map(current.map((row) => [String(row.track_name), row]));
  for (const row of incoming) {
    const name = String(row.track_name);
    const previous = rows.get(name);
    rows.set(name, {
      ...previous,
      ...row,
      observations: mergeRecordedSamples(
        previous?.observations ?? [], row.observations ?? [], asOfSeconds, windowSeconds,
      ),
    });
  }
  return [...rows.values()];
}

function mergeEvents(
  current: Array<Record<string, any>>,
  incoming: Array<Record<string, any>>,
  asOfSeconds: number,
): Array<Record<string, any>> {
  const byId = new Map<string, Record<string, any>>();
  for (const event of [...current, ...incoming]) {
    const availableAt = Number(event.available_at_s ?? event.end_time_s ?? event.timestamp);
    if (!Number.isFinite(availableAt) || availableAt > asOfSeconds) continue;
    const id = String(event.id ?? `${event.event_type ?? "event"}:${event.timestamp}`);
    byId.set(id, event);
  }
  return [...byId.values()].sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
}

function predictionRows(container: any): Array<Record<string, any>> {
  if (Array.isArray(container)) return container;
  return Array.isArray(container?.predictions) ? container.predictions : [];
}

function mergePredictionContainer(
  template: any,
  incomingContainer: any,
  current: Array<Record<string, any>>,
  incoming: Array<Record<string, any>>,
  asOfSeconds: number,
): any {
  const predictions = mergeReplayPredictions(current, incoming, asOfSeconds);
  if (Array.isArray(template)) return predictions;
  if (!template && predictions.length === 0) return null;
  return {
    ...(template ?? {}),
    ...(incomingContainer && !Array.isArray(incomingContainer) ? incomingContainer : {}),
    as_of_s: asOfSeconds,
    predictions,
  };
}

function filterPredictionContainer(container: any, asOfSeconds: number): any {
  if (!container) return container;
  const rows = predictionRows(container).filter((prediction) => prediction.prediction_time <= asOfSeconds);
  if (Array.isArray(container)) return rows;
  return {
    ...container,
    as_of_s: Math.min(Number(container.as_of_s ?? asOfSeconds), asOfSeconds),
    predictions: rows,
    ...(Array.isArray(container.abstained_windows)
      ? { abstained_windows: container.abstained_windows.filter((row: Record<string, any>) => {
        const time = finiteReplayTime(row?.prediction_time);
        return time !== null && time <= asOfSeconds;
      }) }
      : {}),
    ...predictionWindowCounts(container, rows, asOfSeconds),
    ...predictionWindowEvidence(container, rows, asOfSeconds),
  };
}

function filterPredictionCacheMetadata(
  metadata: any,
  filteredContainer: any,
  asOfSeconds: number,
): any {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;
  const rows = predictionRows(filteredContainer);
  const evidenceSource = {
    ...(filteredContainer && typeof filteredContainer === "object" && !Array.isArray(filteredContainer)
      ? filteredContainer
      : {}),
    ...metadata,
  };
  return {
    ...metadata,
    ...predictionWindowCounts(evidenceSource, rows, asOfSeconds),
    ...predictionWindowEvidence(evidenceSource, rows, asOfSeconds),
  };
}

function predictionWindowEvidence(
  container: any,
  rows: Array<Record<string, any>>,
  asOfSeconds: number,
): Record<string, any> {
  const dueRows = rows.filter((prediction) => {
    const time = finiteReplayTime(prediction.prediction_time);
    return time !== null && time <= asOfSeconds;
  });
  const dueAbstentions = persistedAbstentionRows(container).filter((row) => {
    const time = finiteReplayTime(row.prediction_time);
    return time !== null && time <= asOfSeconds;
  });
  const candidateTimes = [
    ...dueRows.map((prediction) => finiteReplayTime(prediction.prediction_time)),
    ...dueAbstentions.map((row) => finiteReplayTime(row.prediction_time)),
  ].filter((time): time is number => time !== null);
  const latestTime = candidateTimes.reduce<number | null>((latest, time) => {
    return latest === null || time > latest ? time : latest;
  }, null);
  if (latestTime !== null) {
    const latestAbstention = dueAbstentions.find((row) => finiteReplayTime(row.prediction_time) === latestTime);
    if (latestAbstention) {
      const persistedStart = finiteReplayTime(
        latestAbstention.window_start_s ?? latestAbstention.input_window_start,
      );
      const persistedEnd = finiteReplayTime(
        latestAbstention.window_end_s ?? latestAbstention.input_window_end,
      );
      return {
        window_eligibility: "ABSTAINED",
        window_status: "ABSTAINED",
        window_reason: latestAbstention.window_reason
          ?? latestAbstention.reason
          ?? latestAbstention.message
          ?? null,
        window_prediction_time_s: latestTime,
        window_start_s: persistedStart === null ? null : Math.min(persistedStart, asOfSeconds),
        window_end_s: persistedEnd === null ? latestTime : Math.min(persistedEnd, asOfSeconds),
      };
    }
    const latestRows = dueRows.filter((prediction) => prediction.prediction_time === latestTime);
    const starts = latestRows
      .map((prediction) => finiteReplayTime(
        prediction.input_window_start ?? prediction.input_window?.start_time_s,
      ))
      .filter((time): time is number => time !== null && time <= asOfSeconds);
    return {
      window_eligibility: "ELIGIBLE",
      window_status: "ELIGIBLE",
      window_reason: null,
      window_prediction_time_s: latestTime,
      window_start_s: starts.length > 0 ? Math.min(...starts) : latestTime,
      window_end_s: latestTime,
    };
  }

  return {
    window_eligibility: "NOT_EVALUATED",
    window_status: "NOT_EVALUATED",
    window_reason: "No persisted model window is due at this replay time.",
    window_prediction_time_s: null,
    window_start_s: null,
    window_end_s: null,
  };
}

function predictionWindowCounts(
  container: any,
  rows: Array<Record<string, any>>,
  asOfSeconds: number,
): Record<string, number> {
  const dueRows = rows.filter((prediction) => {
    const time = finiteReplayTime(prediction.prediction_time);
    return time !== null && time <= asOfSeconds;
  });
  const dueAbstentions = persistedAbstentionRows(container).filter((row) => {
    const time = finiteReplayTime(row.prediction_time);
    return time !== null && time <= asOfSeconds;
  });
  const candidateTimes = new Set<number>();
  for (const row of dueRows) {
    const time = finiteReplayTime(row.prediction_time);
    if (time !== null) candidateTimes.add(time);
  }
  const abstainedTimes = new Set<number>();
  for (const row of dueAbstentions) {
    const time = finiteReplayTime(row.prediction_time);
    if (time !== null) {
      candidateTimes.add(time);
      abstainedTimes.add(time);
    }
  }
  return {
    prediction_count: dueRows.length,
    inference_window_count: candidateTimes.size,
    abstained_window_count: abstainedTimes.size,
  };
}

function persistedAbstentionRows(container: any): Array<Record<string, any>> {
  const rows: Array<Record<string, any>> = Array.isArray(container?.abstained_windows)
    ? container.abstained_windows.filter((row: any) => row && typeof row === "object")
    : [];
  const persistedTime = finiteReplayTime(container?.window_prediction_time_s);
  const persistedEligibility = String(
    container?.window_eligibility ?? container?.window_status ?? "NOT_EVALUATED",
  ).toUpperCase();
  if (
    persistedTime !== null
    && persistedEligibility === "ABSTAINED"
    && !rows.some((row) => finiteReplayTime(row.prediction_time) === persistedTime)
  ) {
    rows.push({
      prediction_time: persistedTime,
      window_start_s: container?.window_start_s,
      window_end_s: container?.window_end_s,
      window_reason: container?.window_reason ?? container?.reason ?? null,
    });
  }
  return rows;
}

function finiteReplayTime(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function filterWaveformAsOf(waveform: any, asOfSeconds: number): any {
  if (!waveform) return waveform ?? null;
  const length = Math.min(waveform.timestamps?.length ?? 0, waveform.values?.length ?? 0);
  const keep = Array.from({ length }, (_, index) => index)
    .filter((index) => Number.isFinite(waveform.timestamps[index]) && waveform.timestamps[index] <= asOfSeconds);
  return {
    ...waveform,
    timestamps: keep.map((index) => waveform.timestamps[index]),
    values: keep.map((index) => waveform.values[index]),
    ...(waveform.is_missing ? { is_missing: keep.map((index) => waveform.is_missing[index] ?? waveform.values[index] === null) } : {}),
    end_time_s: Math.min(Number(waveform.end_time_s ?? asOfSeconds), asOfSeconds),
  };
}
