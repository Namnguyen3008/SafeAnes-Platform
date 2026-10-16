"use client";

import React, { useEffect, useRef } from "react";
import {
  createPaintScheduler,
  createWaveformPresentationTransition,
  projectSweepTraceSegments,
  projectTraceSegments,
  timeToX,
  waveformPresentationRenderTime,
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

/**
 * Shared high-density dual-layer Canvas renderer for clinical monitor signals.
 * Features Phase 2 OffscreenCanvas Worker thread isolation with automatic
 * main-thread progressive enhancement fallback, and Phase 3 phosphor glow
 * aesthetic modeling.
 */
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
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Phase 2 Worker thread isolation references
  const workerRef = useRef<Worker | null>(null);
  const isWorkerActiveRef = useRef<boolean>(false);
  const hasTransferredRef = useRef<boolean>(false);

  // In-thread fallback state (Phase 1)
  const streamRef = useRef<StreamEntry | null>(null);
  const currentWindowRef = useRef<WaveformWindow>({ startTime: 0, endTime: 0, samples: [] });
  const drawStateRef = useRef<DrawState | null>(null);
  const scheduleRef = useRef<ReturnType<typeof createPaintScheduler> | null>(null);
  const presentationRef = useRef<PresentationState | null>(null);
  const sweepRef = useRef<SweepPresentationState | null>(null);
  const lastCanonicalTimeRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(source.simulationTimeMs);
  const lastGridDimensionsRef = useRef<{ width: number; height: number; ratio: number; grid: boolean } | null>(null);

  if (!sweepRef.current) sweepRef.current = createInitialSweepState(source);

  const recorded = Boolean(source.recordedSamples);
  const streamKey = [
    recorded ? "recorded" : "synthetic",
    source.seed,
    source.signal,
    source.sourceDevice,
    source.qualitySignal,
    source.sampleRateHz,
    source.windowMs,
    source.receiptDelayMs,
  ].join(":");

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
    renderTimeMs: lastRenderTimeRef.current,
  };

  const renderGrid = () => {
    const gridCanvas = gridCanvasRef.current;
    const host = hostRef.current;
    if (!gridCanvas || !host) return;
    const bounds = host.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const last = lastGridDimensionsRef.current;
    if (
      last &&
      last.width === bounds.width &&
      last.height === bounds.height &&
      last.ratio === ratio &&
      last.grid === grid
    ) {
      return;
    }
    lastGridDimensionsRef.current = { width: bounds.width, height: bounds.height, ratio, grid };
    drawStaticGridCanvas(gridCanvas, bounds.width, bounds.height, ratio, grid);
  };

  // Phase 2: Initialize Web Worker and OffscreenCanvas on mount
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const canUseWorker =
      typeof window !== "undefined" &&
      typeof Worker !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function" &&
      !hasTransferredRef.current;

    if (canUseWorker) {
      try {
        const bounds = host.getBoundingClientRect();
        const width = bounds.width > 0 ? bounds.width : 300;
        const height = bounds.height > 0 ? bounds.height : 150;
        const ratio = Math.max(1, window.devicePixelRatio || 1);

        const offscreen = canvas.transferControlToOffscreen();
        hasTransferredRef.current = true;

        const worker = new Worker(new URL("./waveformWorker.ts", import.meta.url), {
          type: "module",
        });
        workerRef.current = worker;
        isWorkerActiveRef.current = true;

        worker.postMessage(
          {
            type: "INIT",
            payload: {
              canvas: offscreen,
              width,
              height,
              ratio,
              source,
              color,
              grid: false,
              showCursor,
              sweepMode,
              waitingLabel,
            },
          },
          [offscreen]
        );

        worker.onerror = (err) => {
          console.warn("[SafeAnes] Waveform Worker runtime error, falling back:", err);
        };
      } catch {
        isWorkerActiveRef.current = false;
        workerRef.current = null;
      }
    }

    return () => {
      if (workerRef.current) {
        try {
          workerRef.current.postMessage({ type: "DISPOSE" });
          workerRef.current.terminate();
        } catch {
          // ignore cleanup errors during unmount
        }
        workerRef.current = null;
        isWorkerActiveRef.current = false;
      }
    };
  }, []);

  // Main-thread in-thread fallback render loop (Phase 1)
  useEffect(() => {
    // When the dedicated worker is running, skip main-thread canvas 2D rendering
    if (isWorkerActiveRef.current) return;

    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!host || !canvas || !context) return;

    renderGrid();

    let scheduler: ReturnType<typeof createPaintScheduler>;
    const paint = () => {
      const state = drawStateRef.current;
      if (!state) return;
      const now = window.performance.now();
      const presentation = presentationRef.current;
      const renderTimeMs = presentation
        ? waveformPresentationRenderTime(presentation.transition, now)
        : state.source.simulationTimeMs;
      lastRenderTimeRef.current = renderTimeMs;

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
      drawWaveform(context, canvas, drawState, Boolean(gridCanvasRef.current));

      // Continuous 60fps pacing
      if (state.source.playbackStatus === "PLAYING") {
        scheduler.schedule();
      } else if (
        presentation &&
        presentation.transition.durationMs > 0 &&
        now < presentation.transition.startedAt + presentation.transition.durationMs
      ) {
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
    const handleResize = () => {
      renderGrid();
      scheduler.schedule();
    };
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleResize);
      observer.observe(host);
    } else {
      window.addEventListener("resize", handleResize);
    }
    scheduler.schedule();

    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", handleResize);
      scheduler.dispose();
      if (scheduleRef.current === scheduler) scheduleRef.current = null;
    };
  }, [streamKey]);

  // Synchronize state and trigger worker / in-thread scheduler
  useEffect(() => {
    renderGrid();
    const now = window.performance.now();
    const previousCanonical = lastCanonicalTimeRef.current ?? source.simulationTimeMs;
    const currentRendered = lastRenderTimeRef.current;

    const elapsedSimMs = source.simulationTimeMs - previousCanonical;
    const seekThresholdMs = Math.max(source.windowMs * 2, (source.playbackSpeed || 1) * 2_000);
    const isDiscontinuous = elapsedSimMs < 0 || elapsedSimMs > seekThresholdMs;
    const isPlaying = source.playbackStatus === "PLAYING";

    let fromTimeMs: number;
    if (isDiscontinuous || !isPlaying) {
      fromTimeMs = source.simulationTimeMs;
      lastRenderTimeRef.current = source.simulationTimeMs;
    } else {
      const drift = currentRendered - source.simulationTimeMs;
      if (Math.abs(drift) <= 1_500 && currentRendered < source.simulationTimeMs) {
        fromTimeMs = currentRendered;
      } else {
        fromTimeMs = source.simulationTimeMs;
      }
    }

    presentationRef.current = {
      targetTimeMs: source.simulationTimeMs,
      transition: createWaveformPresentationTransition(
        fromTimeMs,
        Math.max(fromTimeMs, source.simulationTimeMs),
        source.playbackSpeed,
        source.playbackStatus,
        now
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
      renderTimeMs: lastRenderTimeRef.current,
    };
    updateSweepState(sweepRef, source);

    // Forward updates to worker when active
    if (isWorkerActiveRef.current && workerRef.current) {
      workerRef.current.postMessage({
        type: "UPDATE_SOURCE",
        payload: { source },
      });
      workerRef.current.postMessage({
        type: "UPDATE_CONFIG",
        payload: { color, showCursor, sweepMode, waitingLabel },
      });
      return;
    }

    // Otherwise trigger in-thread scheduler
    scheduleRef.current?.schedule();
  }, [source, color, grid, showCursor, sweepMode, waitingLabel]);

  // Handle window and container resizing across Worker and DOM
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const handleResize = () => {
      renderGrid();
      const bounds = host.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const ratio = Math.max(1, window.devicePixelRatio || 1);

      if (isWorkerActiveRef.current && workerRef.current) {
        workerRef.current.postMessage({
          type: "RESIZE",
          payload: { width: bounds.width, height: bounds.height, ratio },
        });
      } else {
        scheduleRef.current?.schedule();
      }
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleResize);
      observer.observe(host);
    } else {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (onTimeSelect) {
      const host = hostRef.current;
      const state = drawStateRef.current;
      if (host && state) {
        const bounds = host.getBoundingClientRect();
        const ratio = bounds.width > 0
          ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
          : 1;
        const renderTimeMs = lastRenderTimeRef.current;
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
        ref={gridCanvasRef}
        className="absolute inset-0 block h-full w-full pointer-events-none"
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label={`${accessibleLabel}, ${source.unit}`}
      />
    </div>
  );
}

function drawStaticGridCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  ratio: number,
  grid: boolean
): void {
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#03070A";
  context.fillRect(0, 0, width, height);
  if (grid) {
    drawGrid(context, width, height);
  }
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: DrawState & { sweep: WaveformPlotRange | null },
  hasDualLayer: boolean = true
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

  if (hasDualLayer) {
    context.clearRect(0, 0, bounds.width, bounds.height);
  } else {
    context.fillStyle = "#03070A";
    context.fillRect(0, 0, bounds.width, bounds.height);
  }

  context.save();
  context.beginPath();
  context.rect(0, 0, bounds.width, bounds.height);
  context.clip();

  if (!hasDualLayer && state.grid) {
    drawGrid(context, bounds.width, bounds.height);
  }

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
    maxPointsPerSegment: Math.max(4, Math.ceil(bounds.width * ratio * 2)),
  };
  const segments = state.sweep
    ? projectSweepTraceSegments(state.window.samples, {
        ...projectionOptions,
        windowMs: state.source.windowMs,
        eraseGapMs: 80,
      })
    : projectTraceSegments(state.window.samples, projectionOptions);

  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = state.color;

  for (const segment of segments) {
    if (segment.points.length < 2) {
      if (segment.points.length === 1) {
        context.beginPath();
        context.arc(segment.points[0].x, segment.points[0].y, 1.5, 0, 2 * Math.PI);
        context.fillStyle = state.color;
        context.fill();
      }
      continue;
    }

    context.setLineDash(segment.quality === "GOOD" ? [] : [4, 2]);
    context.beginPath();
    context.moveTo(segment.points[0].x, segment.points[0].y);
    for (let index = 1; index < segment.points.length; index += 1) {
      context.lineTo(segment.points[index].x, segment.points[index].y);
    }

    // Phase 3: Pass 1 — Outer Phosphor Bloom
    context.lineWidth = 3.8;
    context.globalAlpha = segment.quality === "GOOD" ? 0.24 : 0.12;
    context.stroke();

    // Phase 3: Pass 2 — High-Intensity Focused Core Beam
    context.lineWidth = 1.65;
    context.globalAlpha = segment.quality === "GOOD" ? 0.98 : 0.72;
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
      bounds.width
    );
    drawSweepEraseBar(context, cursorX, bounds.width, bounds.height);

    // Phase 3: Leading Electron Beam Pip at the sweep head tip
    let headPoint: { x: number; y: number } | null = null;
    let minHeadDist = 16;
    for (const segment of segments) {
      if (segment.points.length > 0) {
        const lastPt = segment.points[segment.points.length - 1];
        const dist = Math.abs(lastPt.x - cursorX);
        if (dist < minHeadDist) {
          minHeadDist = dist;
          headPoint = lastPt;
        }
      }
    }
    if (headPoint) {
      context.save();
      context.fillStyle = state.color;
      context.globalAlpha = 0.38;
      context.beginPath();
      context.arc(headPoint.x, headPoint.y, 4.5, 0, 2 * Math.PI);
      context.fill();

      context.fillStyle = "#FFFFFF";
      context.globalAlpha = 0.96;
      context.beginPath();
      context.arc(headPoint.x, headPoint.y, 1.75, 0, 2 * Math.PI);
      context.fill();
      context.restore();
    }
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
  source: ClinicalWaveformSource
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
  renderTimeMs: number
): WaveformPlotRange {
  if (!sweep) return getWaveformPlotRange(source, null, renderTimeMs);
  if (sweep.mode === "SWEEP") {
    if (renderTimeMs < sweep.cycleStartMs) {
      sweep.cycleStartMs = source.playbackStatus === "PLAYING"
        ? renderTimeMs
        : Math.max(0, renderTimeMs - source.windowMs);
    } else if (renderTimeMs > sweep.cycleStartMs + sourceWindowMs(source)) {
      const windowMs = sourceWindowMs(source);
      const completedCycles = Math.floor((renderTimeMs - sweep.cycleStartMs) / windowMs);
      sweep.cycleStartMs += completedCycles * windowMs;
    }
    return {
      startTimeMs: sweep.cycleStartMs,
      endTimeMs: sweep.cycleStartMs + source.windowMs,
      cursorTimeMs: Math.max(sweep.cycleStartMs, Math.min(renderTimeMs, sweep.cycleStartMs + source.windowMs)),
    };
  }
  return getWaveformPlotRange(source, null, renderTimeMs);
}

function sourceWindowMs(src: ClinicalWaveformSource): number {
  return src.windowMs > 0 ? src.windowMs : 8_000;
}

function getWaveformPlotRange(
  source: ClinicalWaveformSource,
  sweep: SweepPresentationState | null,
  renderTimeMs: number
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
  height: number
): void {
  const x = Math.max(0, Math.min(width, cursorX));
  const eraseWidth = Math.min(28, width - x);

  context.save();
  // Phase 3: Soft trailing erase shadow in front of cursor (smoothly clears older cycle)
  if (eraseWidth > 1) {
    const gradient = context.createLinearGradient(x, 0, x + eraseWidth, 0);
    gradient.addColorStop(0, "rgba(3, 7, 10, 0.92)");
    gradient.addColorStop(0.35, "rgba(3, 7, 10, 0.65)");
    gradient.addColorStop(1, "rgba(3, 7, 10, 0)");
    context.fillStyle = gradient;
    context.fillRect(x, 0, eraseWidth, height);
  }

  // Crisp phosphor hairline indicator
  context.strokeStyle = "rgba(244, 246, 247, 0.45)";
  context.lineWidth = 1.25;
  context.beginPath();
  context.moveTo(Math.min(width - 0.5, x), 0);
  context.lineTo(Math.min(width - 0.5, x), height);
  context.stroke();
  context.restore();
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
  // Sub-division and major division vertical time ticks (16 columns = 4 major blocks, 12 minor sub-divisions)
  for (let index = 0; index <= 16; index += 1) {
    const x = (width * index) / 16;
    const isMajor = index % 4 === 0;
    context.strokeStyle = isMajor ? "rgba(80, 160, 210, 0.14)" : "rgba(80, 160, 210, 0.035)";
    context.beginPath();
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, height);
    context.stroke();
  }
  // Sub-division and major division horizontal amplitude lines (8 rows)
  for (let index = 0; index <= 8; index += 1) {
    const y = (height * index) / 8;
    const isMajor = index % 2 === 0;
    const isEdge = index === 0 || index === 8;
    context.strokeStyle = isEdge
      ? "rgba(80, 160, 210, 0.12)"
      : isMajor
        ? "rgba(80, 160, 210, 0.08)"
        : "rgba(80, 160, 210, 0.035)";
    context.beginPath();
    context.moveTo(0, Math.round(y) + 0.5);
    context.lineTo(width, Math.round(y) + 0.5);
    context.stroke();
  }
}
