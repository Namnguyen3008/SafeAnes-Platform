"use client";

import React from "react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";
import { buildTimeLabels, timeToX, xToTime } from "./visualization/timeScale";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";

const WIDTH = 510;
const TRACK_HEIGHT = 72;

export function VitalDbHemodynamicTrendPanel() {
  const {
    cursorTime, setCursorTime, setIsLive, isLive, selectedEventId, events,
    trendWindow, vitalDbProjection,
  } = useHemodynamic();
  const vitalDb = useSafeAnesData();
  const { t } = useTranslation("uc04");
  const view = vitalDbProjection;
  const rangeStart = trendWindow.start;
  const rangeEnd = trendWindow.end;
  const cursorX = timeToX(cursorTime, WIDTH, rangeStart, rangeEnd);
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const eventX = selectedEvent ? timeToX(selectedEvent.timestamp, WIDTH, rangeStart, rangeEnd) : null;
  const primaryPrediction = view?.latestPredictions.find((item) => item.horizon_minutes_or_null !== null);
  const modelStatus = vitalDb.modelStatuses.find((item) => item.model_id.includes("UC04"));
  const modelProjection = projectModelOutputState({
    loading: vitalDb.isLoading,
    readinessStatus: modelStatus?.readiness_status ?? vitalDb.session?.uc04_model_status,
    predictionCacheStatus: view?.predictionCacheStatus,
    windowEligibility: view?.windowEligibility,
    hasOutput: primaryPrediction !== undefined,
  });
  const modelStateLabel = t(`vitaldb.${modelOutputStateMessageKey(modelProjection.state)}`);
  const modelHorizon = modelProjection.state === "READY" ? primaryPrediction?.horizon_minutes_or_null ?? null : null;
  const modelPoints = modelProjection.state === "READY" ? (view?.predictions ?? [])
    .filter((item) => modelHorizon !== null && item.horizon_minutes_or_null === modelHorizon)
    .map((item) => ({ time: item.prediction_time, value: item.interpreted_output.value })) : [];
  const mapPoints = numericPoints(view, "MAP");
  const hrPoints = numericPoints(view, "HR");
  const sbpPoints = numericPoints(view, "SBP");
  const dbpPoints = numericPoints(view, "DBP");
  const timeLabels = buildTimeLabels(rangeStart, rangeEnd, 6);

  const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = xToTime(event.clientX - rect.left, rect.width, rangeStart, rangeEnd);
    setCursorTime(time);
    setIsLive(false);
  };

  return (
    <section className="bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-hidden h-full select-none relative">
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[rgba(100,170,210,0.32)]">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="shrink-0 text-[15px] font-bold text-[#F4F6F7] tracking-tight">{t("header.trends")}</h2>
          <span className="truncate text-[10px] text-[#AAB4BB]">
            {t("vitaldb.recordedDataLabel")} · {t("vitaldb.signalQualityUnknown")}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-[180px] truncate rounded-sm border border-[#B392F0]/40 px-1 py-0.5 text-[9px] font-semibold text-[#B392F0]">
            {t("vitaldb.modelPrediction")} · {primaryPrediction
              && modelProjection.state === "READY"
              ? primaryPrediction.calibrated_or_not ? t("vitaldb.calibratedOutput") : t("vitaldb.uncalibratedOutput")
              : modelStateLabel}
          </span>
          <button
            type="button"
            onClick={() => setIsLive(true)}
            className={`px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1 rounded-[2px] border ${
              isLive ? "border-[#00C5FF] text-[#00C5FF] bg-[#00C5FF]/10" : "border-[rgba(100,170,210,0.2)] text-[#AAB4BB] bg-[#0A131B]"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[#00C5FF] animate-pulse" : "bg-[#AAB4BB]"}`} />
            Live
          </button>
          <span className="bg-[#0A131B] border border-[rgba(100,170,210,0.32)] px-2 py-0.5 rounded-[3px] text-[11px] font-mono text-[#F4F6F7] tabular-nums font-semibold">
            {cursorTime}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between py-0.5">
        <TrendTrack
          title={`${t("vitaldb.modelOutput")} · ${modelHorizon === null ? "—" : modelHorizon} ${t("vitaldb.minuteShort")}`}
          unit="0–1"
          maxLabel="1.00"
          minLabel="0.00"
          points={modelPoints}
          timeStart={rangeStart}
          timeEnd={rangeEnd}
          min={0}
          max={1}
          color="#B392F0"
          cursorX={cursorX}
          eventX={eventX}
          onClick={handleClick}
          emptyText={modelStateLabel}
          auxiliary={primaryPrediction && modelProjection.state === "READY"
            ? `${t("vitaldb.inputCoverage")}: ${(primaryPrediction.data_coverage * 100).toFixed(0)}% · ${primaryPrediction.calibrated_or_not ? t("vitaldb.calibratedOutput") : t("vitaldb.uncalibratedOutput")}`
            : modelStateLabel}
          prediction
        />
        <TrendTrack
          title={t("vitaldb.observedMap")}
          unit={signalUnit(view, "MAP", "mmHg")}
          maxLabel="120"
          minLabel="40"
          points={mapPoints}
          timeStart={rangeStart}
          timeEnd={rangeEnd}
          min={40}
          max={120}
          color="#F5E328"
          cursorX={cursorX}
          eventX={eventX}
          onClick={handleClick}
          emptyText={t("vitaldb.dataNotAvailable")}
        />
        <TrendTrack
          title={t("vitaldb.observedHr")}
          unit={signalUnit(view, "HR", "/min")}
          maxLabel="180"
          minLabel="40"
          points={hrPoints}
          timeStart={rangeStart}
          timeEnd={rangeEnd}
          min={40}
          max={180}
          color="#00C5FF"
          cursorX={cursorX}
          eventX={eventX}
          onClick={handleClick}
          emptyText={t("vitaldb.dataNotAvailable")}
        />
        <TrendTrack
          title={`${t("vitaldb.observedSbp")} / ${t("vitaldb.observedDbp")}`}
          unit={`${signalUnit(view, "SBP", "mmHg")} / ${signalUnit(view, "DBP", "mmHg")}`}
          maxLabel="200"
          minLabel="30"
          points={sbpPoints}
          secondaryPoints={dbpPoints}
          timeStart={rangeStart}
          timeEnd={rangeEnd}
          min={30}
          max={200}
          color="#FF8A65"
          secondaryColor="#6CC3A0"
          cursorX={cursorX}
          eventX={eventX}
          onClick={handleClick}
          emptyText={t("vitaldb.dataNotAvailable")}
          auxiliary={`${t("vitaldb.recordedDataLabel")} · SBP / DBP`}
        />
      </div>

      <div className="flex justify-between text-[10px] font-mono text-[#AAB4BB] px-1 pt-0.5 border-t border-[rgba(100,170,210,0.32)]">
        {timeLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
    </section>
  );
}

function TrendTrack({
  title, unit, maxLabel, minLabel, points, secondaryPoints = [], timeStart, timeEnd,
  min, max, color, secondaryColor = "#6CC3A0", cursorX, eventX, onClick, emptyText,
  auxiliary, prediction = false,
}: {
  title: string;
  unit: string;
  maxLabel: string;
  minLabel: string;
  points: Array<{ time: number; value: number }>;
  secondaryPoints?: Array<{ time: number; value: number }>;
  timeStart: string;
  timeEnd: string;
  min: number;
  max: number;
  color: string;
  secondaryColor?: string;
  cursorX: number;
  eventX: number | null;
  onClick: (event: React.MouseEvent<SVGSVGElement>) => void;
  emptyText: string;
  auxiliary?: string;
  prediction?: boolean;
}) {
  const path = linePath(points, timeStart, timeEnd, min, max);
  const secondaryPath = linePath(secondaryPoints, timeStart, timeEnd, min, max);
  const hasData = points.length > 0 || secondaryPoints.length > 0;
  return (
    <div className="h-[76px] min-h-0 border-b border-[rgba(100,170,210,0.15)] flex items-center justify-between">
      <div className="w-[88px] shrink-0 pr-2 leading-tight">
        <div className="truncate text-[11px] font-bold" style={{ color }}>{title}</div>
        <div className="text-[9px] font-mono text-[#AAB4BB]">{unit}</div>
        {auxiliary && <div className={`truncate text-[8px] ${prediction ? "text-[#B392F0]" : "text-[#AAB4BB]"}`}>{auxiliary}</div>}
      </div>
      <div className="flex h-full min-w-0 flex-1 items-center">
        <div className="flex h-[56px] shrink-0 flex-col justify-between pr-1 text-right font-mono text-[9px] leading-none tabular-nums text-[#74828B]">
          <span>{maxLabel}</span><span>{minLabel}</span>
        </div>
        <svg
          onClick={onClick}
          className="h-full w-full cursor-crosshair"
          viewBox={`0 0 ${WIDTH} ${TRACK_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title}, ${unit}`}
        >
          <line x1="0" y1="8" x2={WIDTH} y2="8" stroke="rgba(100,170,210,0.06)" strokeWidth="1" />
          <line x1="0" y1={TRACK_HEIGHT / 2} x2={WIDTH} y2={TRACK_HEIGHT / 2} stroke="rgba(100,170,210,0.06)" strokeWidth="1" />
          <line x1="0" y1={TRACK_HEIGHT - 8} x2={WIDTH} y2={TRACK_HEIGHT - 8} stroke="rgba(100,170,210,0.06)" strokeWidth="1" />
          {hasData && <path d={path} fill="none" stroke={color} strokeWidth={prediction ? 1.8 : 1.6} strokeLinecap="round" strokeLinejoin="round" />}
          {secondaryPath && <path d={secondaryPath} fill="none" stroke={secondaryColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
          {eventX !== null && <line x1={eventX} y1="0" x2={eventX} y2={TRACK_HEIGHT} stroke="#00C5FF" strokeWidth="1" strokeDasharray="2 2" />}
          <line x1={cursorX} y1="0" x2={cursorX} y2={TRACK_HEIGHT} stroke="#F4F6F7" strokeWidth="1" strokeDasharray="3 3" />
          {!hasData && <text x={WIDTH / 2} y={TRACK_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" fill="#AAB4BB" fontSize="10">{emptyText}</text>}
        </svg>
      </div>
    </div>
  );
}

function numericPoints(view: ReturnType<typeof useHemodynamic>["vitalDbProjection"], signal: string) {
  return (view?.signals.find((series) => series.signal === signal)?.observations ?? [])
    .filter((sample) => !sample.is_missing && typeof sample.value === "number" && Number.isFinite(sample.value))
    .map((sample) => ({ time: sample.timestamp, value: sample.value as number }));
}

function signalUnit(view: ReturnType<typeof useHemodynamic>["vitalDbProjection"], signal: string, fallback: string) {
  return view?.signals.find((series) => series.signal === signal)?.unit || fallback;
}

function linePath(points: Array<{ time: number; value: number }>, start: string, end: string, min: number, max: number): string {
  if (points.length === 0) return "";
  const deltas = points.slice(1).map((point, index) => point.time - points[index].time).filter((delta) => delta > 0).sort((a, b) => a - b);
  const typicalDelta = deltas.length ? deltas[Math.floor(deltas.length / 2)] : Number.POSITIVE_INFINITY;
  let path = "";
  let penDown = false;
  let lastTime: number | null = null;
  for (const point of points) {
    if (lastTime !== null && point.time - lastTime > typicalDelta * 2.5) penDown = false;
    const x = timeToX(formatRelativeTime(point.time), WIDTH, start, end);
    const y = TRACK_HEIGHT - Math.max(0, Math.min(1, (point.value - min) / (max - min))) * TRACK_HEIGHT;
    path += `${penDown ? " L" : " M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    penDown = true;
    lastTime = point.time;
  }
  return path;
}

function formatRelativeTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}
