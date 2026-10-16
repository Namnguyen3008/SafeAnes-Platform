/**
 * Dedicated Web Worker for OffscreenCanvas clinical waveform rendering.
 * Runs the 60fps continuous sweep clock and canvas path rasterization
 * isolated from the React DOM reconciliation and main-thread network tasks.
 */

import {
  createPaintScheduler,
  createWaveformPresentationTransition,
  projectSweepTraceSegments,
  projectTraceSegments,
  timeToX,
  waveformPresentationRenderTime,
  WaveformStream,
} from "./waveformEngine";
import type { ClinicalWaveformSource, WaveformWindow, WaveformPresentationTransition } from "./waveformEngine";

export interface WaveformWorkerInitPayload {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  ratio: number;
  source: ClinicalWaveformSource;
  color: string;
  grid: boolean;
  showCursor: boolean;
  sweepMode: boolean;
  waitingLabel: string;
}

export interface WaveformWorkerUpdatePayload {
  source: ClinicalWaveformSource;
}

export interface WaveformWorkerConfigPayload {
  color?: string;
  grid?: boolean;
  showCursor?: boolean;
  sweepMode?: boolean;
  waitingLabel?: string;
}

export interface WaveformWorkerResizePayload {
  width: number;
  height: number;
  ratio: number;
}

export type WaveformWorkerMessage =
  | { type: "INIT"; payload: WaveformWorkerInitPayload }
  | { type: "UPDATE_SOURCE"; payload: WaveformWorkerUpdatePayload }
  | { type: "UPDATE_CONFIG"; payload: WaveformWorkerConfigPayload }
  | { type: "RESIZE"; payload: WaveformWorkerResizePayload }
  | { type: "DISPOSE" };

interface PresentationState {
  targetTimeMs: number;
  transition: WaveformPresentationTransition;
}

interface SweepPresentationState {
  mode: "HISTORY" | "SWEEP";
  cycleStartMs: number;
  lastCanonicalTimeMs: number;
  playbackStatus: ClinicalWaveformSource["playbackStatus"];
  windowMs: number;
}

interface WaveformPlotRange {
  startTimeMs: number;
  endTimeMs: number;
  cursorTimeMs: number;
}

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let width = 300;
let height = 150;
let ratio = 1;
let source: ClinicalWaveformSource | null = null;
let color = "#FFE800";
let showCursor = false;
let sweepMode = false;
let waitingLabel = "Awaiting waveform samples";

let stream: WaveformStream | null = null;
let streamKey = "";
let currentWindow: WaveformWindow = { startTime: 0, endTime: 0, samples: [] };
let presentation: PresentationState | null = null;
let sweep: SweepPresentationState | null = null;
let lastCanonicalTime: number | null = null;
let lastRenderTime = 0;
let scheduler: ReturnType<typeof createPaintScheduler> | null = null;

function paint(): void {
  if (!context || !canvas || !source) return;
  const now = performance.now();
  const renderTimeMs = presentation
    ? waveformPresentationRenderTime(presentation.transition, now)
    : source.simulationTimeMs;
  lastRenderTime = renderTimeMs;

  const nextWindow = source.recordedSamples
    ? {
        startTime: renderTimeMs - source.windowMs,
        endTime: renderTimeMs,
        samples: source.recordedSamples,
      }
    : stream?.updateTo(renderTimeMs, source.qualityStates) ?? currentWindow;
  currentWindow = nextWindow;

  const sweepRange = sweepMode && sweep?.mode === "SWEEP"
    ? resolveSweepPlotRange(sweep, source, renderTimeMs)
    : null;

  drawWaveformOffscreen(
    context,
    canvas,
    width,
    height,
    ratio,
    source,
    currentWindow,
    color,
    sweepRange,
    renderTimeMs,
    showCursor,
    sweepMode,
    waitingLabel
  );

  if (source.playbackStatus === "PLAYING") {
    scheduler?.schedule();
  } else if (
    presentation &&
    presentation.transition.durationMs > 0 &&
    now < presentation.transition.startedAt + presentation.transition.durationMs
  ) {
    scheduler?.schedule();
  }
}

function handleInit(payload: WaveformWorkerInitPayload): void {
  canvas = payload.canvas;
  context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  width = payload.width;
  height = payload.height;
  ratio = payload.ratio;
  source = payload.source;
  color = payload.color;
  showCursor = payload.showCursor;
  sweepMode = payload.sweepMode;
  waitingLabel = payload.waitingLabel;

  sweep = createInitialSweepState(source);
  lastRenderTime = source.simulationTimeMs;
  lastCanonicalTime = source.simulationTimeMs;
  updateStreamIfNeeded(source);

  presentation = {
    targetTimeMs: source.simulationTimeMs,
    transition: createWaveformPresentationTransition(
      source.simulationTimeMs,
      source.simulationTimeMs,
      source.playbackSpeed,
      source.playbackStatus,
      performance.now()
    ),
  };

  scheduler = createPaintScheduler(
    (cb) => self.requestAnimationFrame(cb),
    (id) => self.cancelAnimationFrame(id),
    paint
  );

  scheduler.schedule();
}

function handleUpdateSource(payload: WaveformWorkerUpdatePayload): void {
  if (!source) return;
  const newSource = payload.source;
  const now = performance.now();
  const previousCanonical = lastCanonicalTime ?? newSource.simulationTimeMs;
  const currentRendered = lastRenderTime;

  const elapsedSimMs = newSource.simulationTimeMs - previousCanonical;
  const seekThresholdMs = Math.max(newSource.windowMs * 2, (newSource.playbackSpeed || 1) * 2_000);
  const isDiscontinuous = elapsedSimMs < 0 || elapsedSimMs > seekThresholdMs;
  const isPlaying = newSource.playbackStatus === "PLAYING";

  let fromTimeMs: number;
  if (isDiscontinuous || !isPlaying) {
    fromTimeMs = newSource.simulationTimeMs;
    lastRenderTime = newSource.simulationTimeMs;
  } else {
    const drift = currentRendered - newSource.simulationTimeMs;
    if (Math.abs(drift) <= 1_500 && currentRendered < newSource.simulationTimeMs) {
      fromTimeMs = currentRendered;
    } else {
      fromTimeMs = newSource.simulationTimeMs;
    }
  }

  presentation = {
    targetTimeMs: newSource.simulationTimeMs,
    transition: createWaveformPresentationTransition(
      fromTimeMs,
      Math.max(fromTimeMs, newSource.simulationTimeMs),
      newSource.playbackSpeed,
      newSource.playbackStatus,
      now
    ),
  };
  lastCanonicalTime = newSource.simulationTimeMs;
  source = newSource;
  updateStreamIfNeeded(newSource);
  updateSweepState(sweep, newSource);
  scheduler?.schedule();
}

function handleUpdateConfig(payload: WaveformWorkerConfigPayload): void {
  if (payload.color !== undefined) color = payload.color;
  if (payload.showCursor !== undefined) showCursor = payload.showCursor;
  if (payload.sweepMode !== undefined) sweepMode = payload.sweepMode;
  if (payload.waitingLabel !== undefined) waitingLabel = payload.waitingLabel;
  scheduler?.schedule();
}

function handleResize(payload: WaveformWorkerResizePayload): void {
  width = payload.width;
  height = payload.height;
  ratio = payload.ratio;
  scheduler?.schedule();
}

function handleDispose(): void {
  scheduler?.dispose();
  scheduler = null;
  canvas = null;
  context = null;
  stream = null;
}

function updateStreamIfNeeded(src: ClinicalWaveformSource): void {
  const recorded = Boolean(src.recordedSamples);
  const key = [
    recorded ? "recorded" : "synthetic",
    src.seed,
    src.signal,
    src.sourceDevice,
    src.qualitySignal,
    src.sampleRateHz,
    src.windowMs,
    src.receiptDelayMs,
  ].join(":");
  if (!recorded && (!stream || streamKey !== key)) {
    streamKey = key;
    stream = new WaveformStream(src);
  }
}

function createInitialSweepState(src: ClinicalWaveformSource): SweepPresentationState {
  const playing = src.playbackStatus === "PLAYING";
  return {
    mode: playing ? "SWEEP" : "HISTORY",
    cycleStartMs: playing ? src.simulationTimeMs : Math.max(0, src.simulationTimeMs - src.windowMs),
    lastCanonicalTimeMs: src.simulationTimeMs,
    playbackStatus: src.playbackStatus,
    windowMs: src.windowMs,
  };
}

function updateSweepState(state: SweepPresentationState | null, src: ClinicalWaveformSource): void {
  if (!state) return;
  const elapsedMs = src.simulationTimeMs - state.lastCanonicalTimeMs;
  const seekThresholdMs = Math.max(src.windowMs * 2, src.playbackSpeed * 1_500);
  const seeked = elapsedMs < 0 || elapsedMs > seekThresholdMs || state.windowMs !== src.windowMs;
  const resumed = src.playbackStatus === "PLAYING" && state.playbackStatus !== "PLAYING";

  if (seeked) {
    state.mode = src.playbackStatus === "PLAYING" ? "SWEEP" : "HISTORY";
    state.cycleStartMs = src.playbackStatus === "PLAYING"
      ? src.simulationTimeMs
      : Math.max(0, src.simulationTimeMs - src.windowMs);
  } else if (resumed) {
    state.mode = "SWEEP";
    state.cycleStartMs = src.simulationTimeMs;
  }

  state.lastCanonicalTimeMs = src.simulationTimeMs;
  state.playbackStatus = src.playbackStatus;
  state.windowMs = src.windowMs;
}

function resolveSweepPlotRange(
  state: SweepPresentationState | null,
  src: ClinicalWaveformSource,
  renderTimeMs: number
): WaveformPlotRange {
  if (!state) return getWaveformPlotRange(src, null, renderTimeMs);
  if (state.mode === "SWEEP") {
    if (renderTimeMs < state.cycleStartMs) {
      state.cycleStartMs = src.playbackStatus === "PLAYING"
        ? renderTimeMs
        : Math.max(0, renderTimeMs - src.windowMs);
    } else if (renderTimeMs > state.cycleStartMs + src.windowMs) {
      const completedCycles = Math.floor((renderTimeMs - state.cycleStartMs) / src.windowMs);
      state.cycleStartMs += completedCycles * src.windowMs;
    }
    return {
      startTimeMs: state.cycleStartMs,
      endTimeMs: state.cycleStartMs + src.windowMs,
      cursorTimeMs: Math.max(state.cycleStartMs, Math.min(renderTimeMs, state.cycleStartMs + src.windowMs)),
    };
  }
  return getWaveformPlotRange(src, null, renderTimeMs);
}

function getWaveformPlotRange(
  src: ClinicalWaveformSource,
  state: SweepPresentationState | null,
  renderTimeMs: number
): WaveformPlotRange {
  if (state?.mode === "SWEEP") {
    const endTimeMs = state.cycleStartMs + src.windowMs;
    return {
      startTimeMs: state.cycleStartMs,
      endTimeMs,
      cursorTimeMs: Math.max(state.cycleStartMs, Math.min(renderTimeMs, endTimeMs)),
    };
  }
  const endTimeMs = Math.max(0, renderTimeMs);
  return {
    startTimeMs: Math.max(0, endTimeMs - src.windowMs),
    endTimeMs,
    cursorTimeMs: endTimeMs,
  };
}

function drawWaveformOffscreen(
  ctx: OffscreenCanvasRenderingContext2D,
  cvs: OffscreenCanvas,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  src: ClinicalWaveformSource,
  win: WaveformWindow,
  strokeColor: string,
  sweepPlotRange: WaveformPlotRange | null,
  renderTimeMs: number,
  cursor: boolean,
  isSweep: boolean,
  waitLabel: string
): void {
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (cvs.width !== pixelWidth || cvs.height !== pixelHeight) {
    cvs.width = pixelWidth;
    cvs.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cssWidth, cssHeight);
  ctx.clip();

  const range = sweepPlotRange ?? getWaveformPlotRange(src, null, renderTimeMs);
  const plotEnd = range.endTimeMs;
  const plotStart = range.startTimeMs;
  const projectionOptions = {
    startTime: plotStart,
    endTime: plotEnd,
    simulationTime: renderTimeMs,
    width: cssWidth,
    height: cssHeight,
    yMin: src.yMin,
    yMax: src.yMax,
    maxGapMs: src.recordedSamples ? Math.max(250, (1_000 / src.sampleRateHz) * 6) : undefined,
    maxPointsPerSegment: Math.max(4, Math.ceil(cssWidth * dpr * 2)),
  };

  const segments = sweepPlotRange
    ? projectSweepTraceSegments(win.samples, {
        ...projectionOptions,
        windowMs: src.windowMs,
        eraseGapMs: 80,
      })
    : projectTraceSegments(win.samples, projectionOptions);

  ctx.lineWidth = 1.75;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = strokeColor;
  for (const segment of segments) {
    if (segment.points.length < 2) {
      if (segment.points.length === 1) {
        ctx.beginPath();
        ctx.arc(segment.points[0].x, segment.points[0].y, 1, 0, 2 * Math.PI);
        ctx.stroke();
      }
      continue;
    }
    ctx.globalAlpha = segment.quality === "GOOD" ? 0.98 : 0.72;
    ctx.setLineDash(segment.quality === "GOOD" ? [] : [4, 2]);
    ctx.beginPath();
    ctx.moveTo(segment.points[0].x, segment.points[0].y);
    for (let index = 1; index < segment.points.length; index += 1) {
      ctx.lineTo(segment.points[index].x, segment.points[index].y);
    }
    ctx.stroke();
  }

  if (!segments.some((segment) => segment.points.length >= 2)) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#7F8C94";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(waitLabel, cssWidth / 2, cssHeight / 2, Math.max(0, cssWidth - 12));
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  if (isSweep && sweepPlotRange) {
    const cursorX = timeToX(
      positiveModulo(renderTimeMs, src.windowMs),
      0,
      src.windowMs,
      cssWidth
    );
    drawSweepEraseBar(ctx, cursorX, cssWidth, cssHeight);
  }

  if (cursor && (!isSweep || !sweepPlotRange) && renderTimeMs >= plotStart && renderTimeMs <= plotEnd) {
    const cursorX = timeToX(renderTimeMs, plotStart, plotEnd, cssWidth);
    ctx.strokeStyle = "rgba(244, 246, 247, 0.82)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, cssHeight);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSweepEraseBar(
  ctx: OffscreenCanvasRenderingContext2D,
  cursorX: number,
  width: number,
  height: number
): void {
  const x = Math.max(0, Math.min(width, cursorX));
  ctx.save();
  ctx.strokeStyle = "rgba(244, 246, 247, 0.42)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(Math.min(width - 0.5, x), 0);
  ctx.lineTo(Math.min(width - 0.5, x), height);
  ctx.stroke();
  ctx.restore();
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

// Global Worker message router
self.onmessage = (event: MessageEvent<WaveformWorkerMessage>) => {
  const msg = event.data;
  if (!msg) return;
  switch (msg.type) {
    case "INIT":
      handleInit(msg.payload);
      break;
    case "UPDATE_SOURCE":
      handleUpdateSource(msg.payload);
      break;
    case "UPDATE_CONFIG":
      handleUpdateConfig(msg.payload);
      break;
    case "RESIZE":
      handleResize(msg.payload);
      break;
    case "DISPOSE":
      handleDispose();
      break;
  }
};
