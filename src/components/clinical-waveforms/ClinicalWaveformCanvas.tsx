"use client";

import React, { useEffect, useRef } from "react";
import {
  createPaintScheduler,
  createWaveformPresentationTransition,
  projectSweepTraceSegments,
  projectTraceSegments,
  timeToX,
  waveformPresentationTimeAt,
  WaveformStream,
} from "./waveformEngine";
import type { ClinicalWaveformSource, WaveformWindow } from "./waveformEngine";
import type { WaveformPresentationTransition } from "./waveformEngine";

export interface ClinicalWaveformCanvasProps {
  source: ClinicalWaveformSource;
  color: string;
  accessibleLabel: string;
  className?: string;
  grid?: boolean;
  showCursor?: boolean;
  /** Moves a clock-bound sweep head through the visible sample window while playback is running. */
  sweepMode?: boolean;
  waitingLabel?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onTimeSelect?: (timeMs: number) => void;
}

interface StreamEntry {
  key: string;
  stream: WaveformStream;
}

interface DrawState {
  source: ClinicalWaveformSource;
  window: WaveformWindow;
  color: string;
  grid: boolean;
  showCursor: boolean;
  sweepMode: boolean;
  waitingLabel: string;
  renderTimeMs: number;
}

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

/** Shared high-density Canvas renderer for the synthetic clinical monitor signals. */
export function ClinicalWaveformCanvas({
  source,
  color,
  accessibleLabel,
  className = "",
  grid = true,
  showCursor = false,
  sweepMode = false,
  waitingLabel = "Awaiting waveform samples",
  onClick,
  onTimeSelect,
}: ClinicalWaveformCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<StreamEntry | null>(null);
  const currentWindowRef = useRef<WaveformWindow>({ startTime: 0, endTime: 0, samples: [] });
  const drawStateRef = useRef<DrawState | null>(null);
  const scheduleRef = useRef<ReturnType<typeof createPaintScheduler> | null>(null);
  const presentationRef = useRef<PresentationState | null>(null);
  const sweepRef = useRef<SweepPresentationState | null>(null);
  const lastCanonicalTimeRef = useRef<number | null>(null);

  if (!sweepRef.current) sweepRef.current = createInitialSweepState(source);

  const recorded = Boolean(source.recordedSamples);
  const streamKey = [recorded ? "recorded" : "synthetic", source.seed, source.signal, source.sourceDevice, source.qualitySignal,
    source.sampleRateHz, source.windowMs, source.receiptDelayMs].join(":");
  if (!recorded && (!streamRef.current || streamRef.current.key !== streamKey)) {
    streamRef.current = {
      key: streamKey,
      stream: new WaveformStream(source),
    };
  }
  drawStateRef.current = {
    source,
    window: currentWindowRef.current,
    color,
    grid,
    showCursor,
    sweepMode,
    waitingLabel,
    renderTimeMs: source.simulationTimeMs,
  };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!host || !canvas || !context) return;

    let scheduler: ReturnType<typeof createPaintScheduler>;
    const paint = () => {
      const state = drawStateRef.current;
      if (!state) return;
      const now = window.performance.now();
      const presentation = presentationRef.current;
      const renderTimeMs = presentation
        ? waveformPresentationTimeAt(presentation.transition, now)
        : state.source.simulationTimeMs;
      const stream = streamRef.current?.stream;
      const nextWindow = state.source.recordedSamples
        ? {
          startTime: renderTimeMs - state.source.windowMs,
          endTime: renderTimeMs,
          samples: state.source.recordedSamples,
        }
        : stream?.updateTo(renderTimeMs, state.source.qualityStates) ?? currentWindowRef.current;
      currentWindowRef.current = nextWindow;
      const drawState = {
        ...state,
        window: nextWindow,
        renderTimeMs,
        sweep: state.sweepMode && sweepRef.current?.mode === "SWEEP"
          ? resolveSweepPlotRange(sweepRef.current, state.source, renderTimeMs)
          : null,
      };
      drawStateRef.current = drawState;
      drawWaveform(context, canvas, drawState);

      if (presentation && presentation.transition.durationMs > 0 &&
          now < presentation.transition.startedAt + presentation.transition.durationMs) {
        scheduler.schedule();
      }
    };
    scheduler = createPaintScheduler(
      (callback) => window.requestAnimationFrame(callback),
      (handle) => window.cancelAnimationFrame(handle),
      paint
    );
    scheduleRef.current = scheduler;

    let observer: ResizeObserver | null = null;
    const requestPaint = () => scheduler.schedule();
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(requestPaint);
      observer.observe(host);
    } else {
      window.addEventListener("resize", requestPaint);
    }
    scheduler.schedule();

    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", requestPaint);
      scheduler.dispose();
      if (scheduleRef.current === scheduler) scheduleRef.current = null;
    };
  }, [streamKey]);

  useEffect(() => {
    const previousTime = lastCanonicalTimeRef.current ?? source.simulationTimeMs;
    presentationRef.current = {
      targetTimeMs: source.simulationTimeMs,
      transition: createWaveformPresentationTransition(
        previousTime,
        source.simulationTimeMs,
        source.playbackSpeed,
        source.playbackStatus,
        window.performance.now()
      ),
    };
    lastCanonicalTimeRef.current = source.simulationTimeMs;
    drawStateRef.current = {
      source,
      window: currentWindowRef.current,
      color,
      grid,
      showCursor,
      sweepMode,
      waitingLabel,
      renderTimeMs: source.simulationTimeMs,
    };
    updateSweepState(sweepRef, source);
    scheduleRef.current?.schedule();
  }, [source, color, grid, showCursor, sweepMode, waitingLabel]);

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (onTimeSelect) {
      const host = hostRef.current;
      const state = drawStateRef.current;
      if (host && state) {
        const bounds = host.getBoundingClientRect();
        const ratio = bounds.width > 0
          ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
          : 1;
        const now = window.performance.now();
        const presentation = presentationRef.current;
        const renderTimeMs = presentation
          ? waveformPresentationTimeAt(presentation.transition, now)
          : state.source.simulationTimeMs;
        const sweepActive = state.sweepMode && sweepRef.current?.mode === "SWEEP";
        onTimeSelect(sweepActive
          ? sweepTimeAtRatio(renderTimeMs, state.source.windowMs, ratio)
          : getWaveformPlotRange(state.source, null, renderTimeMs).startTimeMs +
            ratio * state.source.windowMs);
      }
    }
    onClick?.(event);
  };

  return (
    <div
      ref={hostRef}
      className={`relative h-full min-h-0 min-w-0 w-full overflow-hidden ${className}`}
      data-waveform-signal={source.signal}
      data-waveform-time={source.simulationTimeMs}
      data-waveform-sweep={sweepMode ? "enabled" : "disabled"}
      data-waveform-sample-count={source.recordedSamples?.length ?? 0}
      data-waveform-sample-first-time={source.recordedSamples?.[0]?.eventTime ?? ""}
      data-waveform-sample-last-time={source.recordedSamples?.[source.recordedSamples.length - 1]?.eventTime ?? ""}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        role="img"
        aria-label={`${accessibleLabel}, ${source.unit}`}
      />
    </div>
  );
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: DrawState & { sweep: WaveformPlotRange | null }
): void {
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;

  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(bounds.width * ratio);
  const pixelHeight = Math.round(bounds.height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#03070A";
  context.fillRect(0, 0, bounds.width, bounds.height);

  context.save();
  context.beginPath();
  context.rect(0, 0, bounds.width, bounds.height);
  context.clip();
  if (state.grid) drawGrid(context, bounds.width, bounds.height);

  const range = state.sweep ?? getWaveformPlotRange(state.source, null, state.renderTimeMs);
  const plotEnd = range.endTimeMs;
  const plotStart = range.startTimeMs;
  const projectionOptions = {
    startTime: plotStart,
    endTime: plotEnd,
    simulationTime: state.renderTimeMs,
    width: bounds.width,
    height: bounds.height,
    yMin: state.source.yMin,
    yMax: state.source.yMax,
    maxGapMs: state.source.recordedSamples ? Math.max(250, (1_000 / state.source.sampleRateHz) * 6) : undefined,
    // Bound Canvas path construction to visible pixel density while retaining
    // first/last and min/max samples per horizontal bucket.
    maxPointsPerSegment: Math.max(4, Math.ceil(bounds.width * ratio * 2)),
  };
  const segments = state.sweep
    ? projectSweepTraceSegments(state.window.samples, {
      ...projectionOptions,
      windowMs: state.source.windowMs,
      eraseGapMs: 80,
    })
    : projectTraceSegments(state.window.samples, projectionOptions);
  context.lineWidth = 1.65;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = state.color;
  for (const segment of segments) {
    if (segment.points.length < 2) {
      if (segment.points.length === 1) {
        context.beginPath();
        context.arc(segment.points[0].x, segment.points[0].y, 1, 0, 2 * Math.PI);
        context.stroke();
      }
      continue;
    }
    context.globalAlpha = segment.quality === "GOOD" ? 0.96 : 0.72;
    context.setLineDash(segment.quality === "GOOD" ? [] : [4, 2]);
    context.beginPath();
    context.moveTo(segment.points[0].x, segment.points[0].y);
    for (let index = 1; index < segment.points.length; index += 1) {
      context.lineTo(segment.points[index].x, segment.points[index].y);
    }
    context.stroke();
  }
  if (!segments.some((segment) => segment.points.length >= 2)) {
    context.globalAlpha = 0.9;
    context.fillStyle = "#7F8C94";
    context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(state.waitingLabel, bounds.width / 2, bounds.height / 2, Math.max(0, bounds.width - 12));
  }
  context.globalAlpha = 1;
  context.setLineDash([]);

  if (state.sweepMode && state.sweep) {
    const cursorX = timeToX(
      positiveModulo(state.renderTimeMs, state.source.windowMs),
      0,
      state.source.windowMs,
      bounds.width,
    );
    drawSweepEraseBar(context, cursorX, bounds.width, bounds.height, state.source.windowMs);
  }

  if (state.showCursor && (!state.sweepMode || !state.sweep) &&
      state.renderTimeMs >= plotStart && state.renderTimeMs <= plotEnd) {
    const cursorX = timeToX(state.renderTimeMs, plotStart, plotEnd, bounds.width);
    context.strokeStyle = "rgba(244, 246, 247, 0.82)";
    context.lineWidth = 1;
    context.setLineDash([3, 3]);
    context.beginPath();
    context.moveTo(cursorX, 0);
    context.lineTo(cursorX, bounds.height);
    context.stroke();
  }
  context.restore();
}

function createInitialSweepState(source: ClinicalWaveformSource): SweepPresentationState {
  const playing = source.playbackStatus === "PLAYING";
  return {
    mode: playing ? "SWEEP" : "HISTORY",
    cycleStartMs: playing ? source.simulationTimeMs : Math.max(0, source.simulationTimeMs - source.windowMs),
    lastCanonicalTimeMs: source.simulationTimeMs,
    playbackStatus: source.playbackStatus,
    windowMs: source.windowMs,
  };
}

function updateSweepState(
  ref: React.MutableRefObject<SweepPresentationState | null>,
  source: ClinicalWaveformSource,
): void {
  const previous = ref.current;
  if (!previous) {
    ref.current = createInitialSweepState(source);
    return;
  }

  const elapsedMs = source.simulationTimeMs - previous.lastCanonicalTimeMs;
  const seekThresholdMs = Math.max(source.windowMs * 2, source.playbackSpeed * 1_500);
  const seeked = elapsedMs < 0 || elapsedMs > seekThresholdMs || previous.windowMs !== source.windowMs;
  const resumed = source.playbackStatus === "PLAYING" && previous.playbackStatus !== "PLAYING";

  if (seeked) {
    previous.mode = source.playbackStatus === "PLAYING" ? "SWEEP" : "HISTORY";
    previous.cycleStartMs = source.playbackStatus === "PLAYING"
      ? source.simulationTimeMs
      : Math.max(0, source.simulationTimeMs - source.windowMs);
  } else if (resumed) {
    previous.mode = "SWEEP";
    previous.cycleStartMs = source.simulationTimeMs;
  }

  previous.lastCanonicalTimeMs = source.simulationTimeMs;
  previous.playbackStatus = source.playbackStatus;
  previous.windowMs = source.windowMs;
}

function resolveSweepPlotRange(
  sweep: SweepPresentationState | null,
  source: ClinicalWaveformSource,
  renderTimeMs: number,
): WaveformPlotRange {
  if (!sweep) return getWaveformPlotRange(source, null, renderTimeMs);
  if (sweep.mode === "SWEEP") {
    if (renderTimeMs > sweep.cycleStartMs + source.windowMs) {
      const completedCycles = Math.floor((renderTimeMs - sweep.cycleStartMs) / source.windowMs);
      sweep.cycleStartMs += completedCycles * source.windowMs;
    }
    return {
      startTimeMs: sweep.cycleStartMs,
      endTimeMs: sweep.cycleStartMs + source.windowMs,
      cursorTimeMs: Math.max(sweep.cycleStartMs, Math.min(renderTimeMs, sweep.cycleStartMs + source.windowMs)),
    };
  }
  return getWaveformPlotRange(source, null, renderTimeMs);
}

function getWaveformPlotRange(
  source: ClinicalWaveformSource,
  sweep: SweepPresentationState | null,
  renderTimeMs: number,
): WaveformPlotRange {
  if (sweep?.mode === "SWEEP") {
    const endTimeMs = sweep.cycleStartMs + source.windowMs;
    return {
      startTimeMs: sweep.cycleStartMs,
      endTimeMs,
      cursorTimeMs: Math.max(sweep.cycleStartMs, Math.min(renderTimeMs, endTimeMs)),
    };
  }
  const endTimeMs = Math.max(0, renderTimeMs);
  return {
    startTimeMs: Math.max(0, endTimeMs - source.windowMs),
    endTimeMs,
    cursorTimeMs: endTimeMs,
  };
}

function drawSweepEraseBar(
  context: CanvasRenderingContext2D,
  cursorX: number,
  width: number,
  height: number,
  _windowMs: number,
): void {
  const x = Math.max(0, Math.min(width, cursorX));
  // A subtle sweep cursor line matching clinical bedside monitors
  context.strokeStyle = "rgba(244, 246, 247, 0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(Math.min(width - 0.5, x), 0);
  context.lineTo(Math.min(width - 0.5, x), height);
  context.stroke();
}

function sweepTimeAtRatio(renderTimeMs: number, windowMs: number, ratio: number): number {
  const phase = Math.max(0, Math.min(1, ratio)) * windowMs;
  let selectedTime = Math.floor(renderTimeMs / windowMs) * windowMs + phase;
  if (selectedTime > renderTimeMs) selectedTime -= windowMs;
  return Math.max(0, selectedTime);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.lineWidth = 1;
  for (let index = 0; index <= 8; index += 1) {
    const x = (width * index) / 8;
    context.strokeStyle = index % 4 === 0 ? "rgba(80, 160, 210, 0.14)" : "rgba(80, 160, 210, 0.035)";
    context.beginPath();
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, height);
    context.stroke();
  }
  for (let index = 0; index <= 4; index += 1) {
    const y = (height * index) / 4;
    context.strokeStyle = index === 0 || index === 4
      ? "rgba(80, 160, 210, 0.11)"
      : "rgba(80, 160, 210, 0.05)";
    context.beginPath();
    context.moveTo(0, Math.round(y) + 0.5);
    context.lineTo(width, Math.round(y) + 0.5);
    context.stroke();
  }
}
