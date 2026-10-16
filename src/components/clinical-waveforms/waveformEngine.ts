import {
  CLINICAL_WAVEFORM_RECEIPT_DELAY_MS,
  CLINICAL_WAVEFORM_SAMPLE_RATE_HZ,
  CLINICAL_WAVEFORM_WINDOW_MS,
  sampleClinicalWaveform,
} from "../../simulation/generators/clinicalWaveforms";
import type { WaveformRenderSource, WaveformSignal } from "../../simulation/types/waveforms";
import type { QualityStatus, SignalQualityState } from "../../simulation/types/quality";
import type { SimulationClockStatus, SimulationSpeed } from "../../simulation/types/replay";

export interface WaveformPoint {
  eventTime: number;
  receivedTime: number;
  sourceDevice: string;
  value: number | null;
  quality: QualityStatus;
  provenance: "DIRECT" | "DERIVED";
}

export interface WaveformWindow {
  startTime: number;
  endTime: number;
  samples: readonly WaveformPoint[];
}

export interface WaveformPresentationTransition {
  fromTimeMs: number;
  toTimeMs: number;
  speed: number;
  status: SimulationClockStatus;
  startedAt: number;
  durationMs: number;
}

/**
 * Interpolates presentation only between two already-published canonical clock
 * snapshots. Pause, seek, reset, and backward movement snap to the target.
 */
export function createWaveformPresentationTransition(
  fromTimeMs: number,
  toTimeMs: number,
  speed: SimulationSpeed | number,
  status: SimulationClockStatus,
  startedAt: number
): WaveformPresentationTransition {
  if (![fromTimeMs, toTimeMs, speed, startedAt].every(Number.isFinite) || fromTimeMs < 0 || toTimeMs < 0) {
    throw new RangeError("Waveform presentation times must be finite and non-negative.");
  }
  const canInterpolate = status === "PLAYING" && toTimeMs > fromTimeMs && speed > 0;
  return {
    fromTimeMs,
    toTimeMs,
    speed,
    status,
    startedAt,
    durationMs: canInterpolate ? (toTimeMs - fromTimeMs) / speed : 0,
  };
}

export function waveformPresentationTimeAt(
  transition: WaveformPresentationTransition,
  now: number
): number {
  if (!Number.isFinite(now)) throw new RangeError("Presentation frame time must be finite.");
  if (transition.durationMs <= 0) return transition.toTimeMs;
  const progress = Math.max(0, Math.min(1, (now - transition.startedAt) / transition.durationMs));
  return transition.fromTimeMs + (transition.toTimeMs - transition.fromTimeMs) * progress;
}

/**
 * Resolves continuous presentation time for canvas rendering.
 * During continuous playback, extrapolates smoothly through packet-arrival latency
 * so the monitor sweep head never stutters or freezes between network intervals.
 */
export function waveformPresentationRenderTime(
  transition: WaveformPresentationTransition,
  now: number,
  maxExtrapolationMs: number = 1_500
): number {
  if (!Number.isFinite(now)) throw new RangeError("Presentation frame time must be finite.");
  if (transition.status !== "PLAYING") {
    return transition.toTimeMs;
  }
  const elapsed = now - transition.startedAt;
  const durationMs = Math.max(0, transition.durationMs);
  if (durationMs > 0 && elapsed <= durationMs) {
    return waveformPresentationTimeAt(transition, now);
  }
  const overdueMs = Math.min(Math.max(0, elapsed - durationMs), Math.max(0, maxExtrapolationMs));
  const speed = transition.speed > 0 ? transition.speed : 1;
  return transition.toTimeMs + overdueMs * speed;
}

/**
 * Master presentation clock coordinating all clinical waveform channels (ECG, ABP, Pleth, Capno).
 * In clinical monitors (e.g. Mindray, Philips IntelliVue), all waveform channels on the same screen
 * sweep in 100% phase lockstep from a unified master time base.
 *
 * This singleton calculates and caches the single canonical transition per simulation tick,
 * ensuring all channels and their Web Worker threads evaluate identical `renderTimeMs` and `cursorX`
 * on every 60fps frame, eliminating inter-channel vertical sweep bar misalignment.
 */
export class WaveformMasterClock {
  private lastCanonicalTime: number | null = null;
  private activeTransition: WaveformPresentationTransition | null = null;
  private lastStatus: SimulationClockStatus = "PAUSED";
  private lastSpeed: number = 1;

  public synchronize(
    simulationTimeMs: number,
    playbackSpeed: number,
    playbackStatus: SimulationClockStatus,
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
    windowMs: number = 10_000
  ): WaveformPresentationTransition {
    if (
      this.activeTransition &&
      this.lastCanonicalTime === simulationTimeMs &&
      this.lastStatus === playbackStatus &&
      this.lastSpeed === playbackSpeed
    ) {
      return this.activeTransition;
    }

    const previousCanonical = this.lastCanonicalTime ?? simulationTimeMs;
    const elapsedSimMs = simulationTimeMs - previousCanonical;
    const seekThresholdMs = Math.max(windowMs * 2, (playbackSpeed || 1) * 2_000);
    const isDiscontinuous = elapsedSimMs < 0 || elapsedSimMs > seekThresholdMs;
    const isPlaying = playbackStatus === "PLAYING";

    let fromTimeMs: number;
    if (isDiscontinuous || !isPlaying || !this.activeTransition) {
      fromTimeMs = simulationTimeMs;
    } else {
      const currentRendered = waveformPresentationRenderTime(this.activeTransition, now);
      const drift = currentRendered - simulationTimeMs;
      if (Math.abs(drift) <= 1_500 && currentRendered < simulationTimeMs) {
        fromTimeMs = currentRendered;
      } else {
        fromTimeMs = simulationTimeMs;
      }
    }

    const transition = createWaveformPresentationTransition(
      fromTimeMs,
      Math.max(fromTimeMs, simulationTimeMs),
      playbackSpeed,
      playbackStatus,
      now
    );

    this.lastCanonicalTime = simulationTimeMs;
    this.lastStatus = playbackStatus;
    this.lastSpeed = playbackSpeed;
    this.activeTransition = transition;

    return transition;
  }

  public getCurrentTransition(
    simulationTimeMs: number,
    playbackSpeed: number,
    playbackStatus: SimulationClockStatus,
    now: number = typeof performance !== "undefined" ? performance.now() : 0,
    windowMs: number = 10_000
  ): WaveformPresentationTransition {
    if (
      this.activeTransition &&
      this.lastCanonicalTime === simulationTimeMs &&
      this.lastStatus === playbackStatus &&
      this.lastSpeed === playbackSpeed
    ) {
      return this.activeTransition;
    }
    return this.synchronize(simulationTimeMs, playbackSpeed, playbackStatus, now, windowMs);
  }

  public reset(): void {
    this.lastCanonicalTime = null;
    this.activeTransition = null;
    this.lastStatus = "PAUSED";
    this.lastSpeed = 1;
  }
}

export const waveformMasterClock = new WaveformMasterClock();

export interface WaveformStreamOptions {
  seed: number;
  signal: WaveformSignal;
  sourceDevice: string;
  qualitySignal: string;
  sampleRateHz?: number;
  windowMs?: number;
  receiptDelayMs?: number;
}

export type ClinicalWaveformSource = WaveformRenderSource & {
  /** Raw VitalDB samples passed through without generation, interpolation, or resampling. */
  recordedSamples?: readonly WaveformPoint[];
};

const NON_DRAWABLE_QUALITY = new Set<QualityStatus>([
  "TECHNICAL_DROPOUT",
  "EXPECTED_INTERMITTENT",
  "STRUCTURAL_NOT_MONITORED",
  "INVALIDATED_ARTIFACT",
  "UNKNOWN",
  "UNAVAILABLE",
]);

export function isDrawableQuality(status: QualityStatus): boolean {
  return !NON_DRAWABLE_QUALITY.has(status);
}

export class WaveformBuffer {
  private readonly points: WaveformPoint[] = [];

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Waveform buffer capacity must be a positive integer.");
    }
  }

  get size(): number {
    return this.points.length;
  }

  get newestTime(): number | null {
    return this.points.length === 0 ? null : this.points[this.points.length - 1].eventTime;
  }

  insert(point: WaveformPoint): void {
    if (!Number.isFinite(point.eventTime) || !Number.isFinite(point.receivedTime)) {
      throw new TypeError("Waveform timestamps must be finite.");
    }

    let low = 0;
    let high = this.points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.points[middle].eventTime < point.eventTime) low = middle + 1;
      else high = middle;
    }

    if (this.points[low]?.eventTime === point.eventTime) this.points[low] = point;
    else this.points.splice(low, 0, point);
    if (this.points.length > this.capacity) this.points.splice(0, this.points.length - this.capacity);
  }

  readWindow(startTime: number, endTime: number): WaveformPoint[] {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
      throw new RangeError("Waveform read window must have finite, ordered bounds.");
    }
    let low = 0;
    let high = this.points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.points[middle].eventTime < startTime) low = middle + 1;
      else high = middle;
    }
    const first = low;
    while (low < this.points.length && this.points[low].eventTime <= endTime) low += 1;
    return this.points.slice(first, low);
  }

  clear(): void {
    this.points.length = 0;
  }
}

/**
 * Builds only the currently visible sample window. A backward seek or changed
 * quality history clears the ring and reconstructs it from the selected case time.
 */
export class WaveformStream {
  private readonly options: Required<WaveformStreamOptions>;
  private readonly buffer: WaveformBuffer;
  private latestSimulationTime = -1;
  private nextSampleIndex = 0;
  private qualityFingerprint = "";

  constructor(options: WaveformStreamOptions) {
    const sampleRateHz = options.sampleRateHz ?? CLINICAL_WAVEFORM_SAMPLE_RATE_HZ;
    const windowMs = options.windowMs ?? CLINICAL_WAVEFORM_WINDOW_MS;
    const receiptDelayMs = options.receiptDelayMs ?? CLINICAL_WAVEFORM_RECEIPT_DELAY_MS;
    if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0 || !Number.isInteger(sampleRateHz)) {
      throw new RangeError("Waveform sample rate must be a positive integer.");
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isFinite(receiptDelayMs) || receiptDelayMs < 0) {
      throw new RangeError("Waveform window and receipt delay must be valid durations.");
    }
    if (!Number.isFinite(options.seed)) throw new TypeError("Waveform seed must be finite.");

    this.options = { ...options, sampleRateHz, windowMs, receiptDelayMs };
    const capacity = Math.ceil((windowMs * sampleRateHz) / 1_000) + 2;
    this.buffer = new WaveformBuffer(capacity);
  }

  updateTo(simulationTime: number, qualityStates: readonly SignalQualityState[]): WaveformWindow {
    if (!Number.isFinite(simulationTime) || simulationTime < 0) {
      throw new RangeError("Simulation time must be a finite, non-negative case time.");
    }

    const relevantQuality = qualityStates
      .filter((state) => state.signal === this.options.qualitySignal && state.sourceDevice === this.options.sourceDevice)
      .slice()
      .sort((left, right) => left.eventTime - right.eventTime || (left.recordedTime ?? left.eventTime) - (right.recordedTime ?? right.eventTime));
    const fingerprint = relevantQuality
      .map((state) => `${state.id}:${state.eventTime}:${state.recordedTime ?? ""}:${state.validUntilTime ?? ""}:${state.status}`)
      .join("|");
    const windowStart = Math.max(0, simulationTime - this.options.windowMs);
    const jumpedBack = simulationTime < this.latestSimulationTime;
    const jumpedFar = this.latestSimulationTime >= 0 && simulationTime - this.latestSimulationTime > this.options.windowMs;
    const qualityChanged = fingerprint !== this.qualityFingerprint;

    if (this.latestSimulationTime < 0 || jumpedBack || jumpedFar || qualityChanged) {
      this.buffer.clear();
      this.nextSampleIndex = Math.ceil(windowStart / this.sampleIntervalMs());
    }

    const lastReceivedTime = simulationTime - this.options.receiptDelayMs;
    const lastIndex = Math.floor(lastReceivedTime / this.sampleIntervalMs() + Number.EPSILON);
    for (let index = this.nextSampleIndex; index <= lastIndex; index += 1) {
      const eventTime = index * this.sampleIntervalMs();
      if (eventTime < windowStart) continue;
      const quality = qualityAt(
        relevantQuality,
        this.options.qualitySignal,
        this.options.sourceDevice,
        eventTime,
        simulationTime
      );
      this.buffer.insert({
        eventTime,
        receivedTime: eventTime + this.options.receiptDelayMs,
        sourceDevice: this.options.sourceDevice,
        value: isDrawableQuality(quality)
          ? sampleClinicalWaveform(this.options.seed, this.options.signal, eventTime)
          : null,
        quality,
        provenance: "DERIVED",
      });
    }
    this.nextSampleIndex = Math.max(this.nextSampleIndex, lastIndex + 1);
    this.latestSimulationTime = simulationTime;
    this.qualityFingerprint = fingerprint;

    return {
      startTime: windowStart,
      endTime: simulationTime,
      samples: this.buffer.readWindow(windowStart, simulationTime),
    };
  }

  reset(): void {
    this.buffer.clear();
    this.latestSimulationTime = -1;
    this.nextSampleIndex = 0;
    this.qualityFingerprint = "";
  }

  private sampleIntervalMs(): number {
    return 1_000 / this.options.sampleRateHz;
  }
}

function qualityAt(
  history: readonly SignalQualityState[],
  signal: string,
  sourceDevice: string,
  sampleTime: number,
  simulationTime: number
): QualityStatus {
  const active = history
    .filter((state) => state.signal === signal && state.sourceDevice === sourceDevice &&
      state.eventTime <= sampleTime &&
      (state.recordedTime === undefined || state.recordedTime <= simulationTime) &&
      (state.validUntilTime === undefined || sampleTime < state.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime || (right.recordedTime ?? 0) - (left.recordedTime ?? 0))[0];
  return active?.status ?? "GOOD";
}

export function timeToX(timestamp: number, startTime: number, endTime: number, width: number): number {
  if (![timestamp, startTime, endTime, width].every(Number.isFinite) || width < 0) {
    throw new RangeError("Time mapping requires finite coordinates and a non-negative width.");
  }
  if (endTime <= startTime) return 0;
  const fraction = Math.max(0, Math.min(1, (timestamp - startTime) / (endTime - startTime)));
  return fraction * width;
}

export function valueToY(value: number, yMin: number, yMax: number, height: number): number {
  if (![value, yMin, yMax, height].every(Number.isFinite) || yMax <= yMin || height < 0) {
    throw new RangeError("Value mapping requires a finite value range and non-negative height.");
  }
  const fraction = Math.max(0, Math.min(1, (value - yMin) / (yMax - yMin)));
  return (1 - fraction) * height;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export interface TraceSegment {
  quality: Extract<QualityStatus, "GOOD" | "DEGRADED" | "UNKNOWN">;
  points: PlotPoint[];
}

export interface TraceProjectionOptions {
  startTime: number;
  endTime: number;
  simulationTime: number;
  width: number;
  height: number;
  yMin: number;
  yMax: number;
  maxGapMs?: number;
  /** Upper bound on projected vertices per uninterrupted quality segment. */
  maxPointsPerSegment?: number;
}

export interface WaveformDisplayRange {
  min: number;
  max: number;
}

/**
 * Keeps the configured clinical range when samples fit it, then expands the
 * display range to include recorded samples instead of flattening them against
 * the canvas edge. Entirely offset raw channels are framed around their actual
 * recorded range so they remain visible without rewriting their values.
 */
export function resolveWaveformDisplayRange(
  values: Iterable<number | null | undefined>,
  preferredMin: number,
  preferredMax: number,
  targetTickCount = 4,
): WaveformDisplayRange {
  if (!Number.isFinite(preferredMin) || !Number.isFinite(preferredMax) || preferredMax <= preferredMin) {
    throw new RangeError("Waveform display range must be finite and ordered.");
  }

  const finite: number[] = [];
  let observedMin = Number.POSITIVE_INFINITY;
  let observedMax = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    observedMin = Math.min(observedMin, value);
    observedMax = Math.max(observedMax, value);
    finite.push(value);
  }
  if (!Number.isFinite(observedMin) || !Number.isFinite(observedMax)) {
    return { min: preferredMin, max: preferredMax };
  }

  const preferredSpan = preferredMax - preferredMin;
  const observedSpan = observedMax - observedMin;
  // If the observed samples fit well within the preferred range (at least 25% of preferred span),
  // retain preferred range.
  if (observedMin >= preferredMin && observedMax <= preferredMax && observedSpan >= preferredSpan * 0.25) {
    return { min: preferredMin, max: preferredMax };
  }

  // Otherwise, use 1% - 99% percentile auto-ranging with padding (matching webui and clinical bedside monitors)
  // to avoid squashing micro-scale or offset signals.
  let low = observedMin;
  let high = observedMax;
  if (finite.length >= 8) {
    const sorted = [...finite].sort((a, b) => a - b);
    low = getPercentile(sorted, 0.01);
    high = getPercentile(sorted, 0.99);
  }
  const span = Math.max(high - low, Math.abs(high) * 0.01, 1);
  const padding = span * 0.05;
  let lower = low - padding;
  let upper = high + padding;
  if (observedMin >= 0 && preferredMin >= 0) {
    lower = Math.max(0, lower);
  }
  if (upper <= lower) upper = lower + 1;

  const step = niceTickStep((upper - lower) / Math.max(1, targetTickCount));
  return {
    min: Math.floor(lower / step) * step,
    max: Math.ceil(upper / step) * step,
  };
}

function getPercentile(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function niceTickStep(rawStep: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rawStep, Number.MIN_VALUE)));
  const fraction = rawStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

export function projectTraceSegments(
  samples: readonly WaveformPoint[],
  options: TraceProjectionOptions
): TraceSegment[] {
  const writer = createTraceSegmentWriter(options.width, options.maxPointsPerSegment);
  let previousTime: number | null = null;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const drawable = sample.eventTime <= options.simulationTime &&
      sample.receivedTime <= options.simulationTime &&
      sample.eventTime >= options.startTime &&
      sample.eventTime <= options.endTime &&
      sample.value !== null && Number.isFinite(sample.value) &&
      (isDrawableQuality(sample.quality) || sample.quality === "UNKNOWN" && sample.provenance === "DIRECT");
    const tooWideGap = previousTime !== null && options.maxGapMs !== undefined &&
      sample.eventTime - previousTime > options.maxGapMs;
    if (!drawable || tooWideGap) {
      writer.breakSegment();
      if (!drawable) {
        previousTime = sample.eventTime;
        continue;
      }
    }
    writer.beginSegment(sample.quality as TraceSegment["quality"]);
    const x = timeToX(sample.eventTime, options.startTime, options.endTime, options.width);
    const y = valueToY(sample.value as number, options.yMin, options.yMax, options.height);
    writer.append(x, y, projectionBucketIndex(x, index, options.width, writer.bucketCount));
    previousTime = sample.eventTime;
  }
  return writer.finish();
}

/**
 * Projects a rolling monitor trace around a cyclic erase-bar sweep. The window
 * is fixed in case time, while the sweep phase is derived only from the shared
 * simulation/replay timestamp. Gaps and invalid samples always break the path.
 */
export function projectSweepTraceSegments(
  samples: readonly WaveformPoint[],
  options: TraceProjectionOptions & { windowMs: number; eraseGapMs?: number },
): TraceSegment[] {
  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new RangeError("Sweep window must be a finite positive duration.");
  }

  const startTime = Math.max(0, options.simulationTime - options.windowMs);
  const headPhase = positiveModulo(options.simulationTime, options.windowMs);
  const eraseGapMs = Math.min(options.windowMs, Math.max(0, options.eraseGapMs ?? 80));
  const writer = createTraceSegmentWriter(options.width, options.maxPointsPerSegment);
  let previousTime: number | null = null;
  let previousPhase: number | null = null;

  // Replay buffers are ordered by source timestamp. Skip retained history that
  // is outside the plot window instead of walking it on every animation frame.
  for (let index = lowerBoundEventTime(samples, startTime); index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.eventTime > options.simulationTime) break;
    const inWindow = sample.eventTime >= startTime && sample.eventTime <= options.simulationTime;
    const drawable = inWindow && sample.eventTime <= options.simulationTime &&
      sample.receivedTime <= options.simulationTime && sample.value !== null && Number.isFinite(sample.value) &&
      (isDrawableQuality(sample.quality) || sample.quality === "UNKNOWN" && sample.provenance === "DIRECT");
    const tooWideGap = previousTime !== null && options.maxGapMs !== undefined &&
      sample.eventTime - previousTime > options.maxGapMs;
    const phase = positiveModulo(sample.eventTime, options.windowMs);
    const isInEraseGap = positiveModulo(phase - headPhase, options.windowMs) < eraseGapMs;

    if (!drawable || tooWideGap || isInEraseGap) {
      writer.breakSegment();
      previousTime = inWindow ? sample.eventTime : previousTime;
      previousPhase = inWindow ? phase : previousPhase;
      continue;
    }

    const crossedSweepWrap = previousPhase !== null && phase < previousPhase;
    if (crossedSweepWrap) writer.breakSegment();
    writer.beginSegment(sample.quality as TraceSegment["quality"]);
    const x = timeToX(phase, 0, options.windowMs, options.width);
    const y = valueToY(sample.value as number, options.yMin, options.yMax, options.height);
    writer.append(x, y, projectionBucketIndex(x, index, options.width, writer.bucketCount));
    previousTime = sample.eventTime;
    previousPhase = phase;
  }

  return writer.finish();
}

interface IndexedPlotPoint {
  index: number;
  point: PlotPoint;
}

interface ProjectionBucket {
  id: number;
  first: IndexedPlotPoint;
  last: IndexedPlotPoint;
  minimum: IndexedPlotPoint;
  maximum: IndexedPlotPoint;
}

function createTraceSegmentWriter(_width: number, maxPointsPerSegment?: number) {
  const finiteBudget = Number.isFinite(maxPointsPerSegment) && (maxPointsPerSegment ?? 0) > 0;
  // Four retained representatives (first, min, max, last) preserve the shape
  // and extrema within each horizontal bucket.
  const bucketCount = finiteBudget
    ? Math.max(1, Math.floor(Math.max(4, maxPointsPerSegment as number) / 4))
    : Number.POSITIVE_INFINITY;
  const segments: TraceSegment[] = [];
  let segment: TraceSegment | null = null;
  let bucket: ProjectionBucket | null = null;
  let sequence = 0;

  const flushBucket = () => {
    if (!segment || !bucket) return;
    const candidates = [bucket.first, bucket.minimum, bucket.maximum, bucket.last]
      .sort((left, right) => left.index - right.index);
    let previousIndex = -1;
    for (const candidate of candidates) {
      if (candidate.index === previousIndex) continue;
      segment.points.push(candidate.point);
      previousIndex = candidate.index;
    }
    bucket = null;
  };

  return {
    bucketCount,
    beginSegment(quality: TraceSegment["quality"]) {
      if (segment?.quality === quality) return;
      flushBucket();
      segment = { quality, points: [] };
      segments.push(segment);
    },
    append(x: number, y: number, bucketId: number) {
      if (!segment) return;
      const candidate: IndexedPlotPoint = { index: sequence++, point: { x, y } };
      if (!bucket || bucket.id !== bucketId) {
        flushBucket();
        bucket = {
          id: bucketId,
          first: candidate,
          last: candidate,
          minimum: candidate,
          maximum: candidate,
        };
        return;
      }
      bucket.last = candidate;
      if (y < bucket.minimum.point.y) bucket.minimum = candidate;
      if (y > bucket.maximum.point.y) bucket.maximum = candidate;
    },
    breakSegment() {
      flushBucket();
      segment = null;
    },
    finish() {
      flushBucket();
      return segments.filter((item) => item.points.length > 0);
    },
  };
}

function projectionBucketIndex(x: number, sampleIndex: number, width: number, bucketCount: number): number {
  if (!Number.isFinite(bucketCount)) return sampleIndex;
  if (width <= 0) return 0;
  return Math.max(0, Math.min(bucketCount - 1, Math.floor((x / width) * bucketCount)));
}

function lowerBoundEventTime(samples: readonly WaveformPoint[], target: number): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (samples[middle].eventTime < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function createPaintScheduler(
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void,
  paint: () => void
): { schedule: () => void; dispose: () => void } {
  let frame: number | null = null;
  let disposed = false;

  return {
    schedule() {
      if (disposed || frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        if (!disposed) paint();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) cancelFrame(frame);
      frame = null;
    },
  };
}
