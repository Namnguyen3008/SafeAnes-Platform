"use client";

import React from "react";
import { ClinicalWaveformCanvas } from "@/components/clinical-waveforms";
import { resolveWaveformDisplayRange, type ClinicalWaveformSource, type WaveformPoint } from "@/components/clinical-waveforms/waveformEngine";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { buildTimeLabels, timeToX, xToTime } from "./visualization/timeScale";
import { useTranslation } from "@/context/LocalizationContext";

export function MiniSignalTrendPanel() {
  const {
    cursorTime,
    setCursorTime,
    setIsLive,
    trendSamples,
    trendWindow,
    abpWaveform,
    abpWaveformSource,
    abpWaveformTimestamp,
    dataSourceMode,
    vitalDbProjection,
    vitalDbCurrentTimeSeconds,
  } = useHemodynamic();
  const replay = useSafeAnesData();
  const { t } = useTranslation("uc04");
  const isVitalDb = dataSourceMode === "VITALDB_REPLAY";

  const observedAbpSource = React.useMemo<ClinicalWaveformSource | null>(() => {
    const waveform = vitalDbProjection?.abp_waveform;
    if (!waveform || !waveform.sample_rate_hz || waveform.sample_rate_hz <= 0 || !waveform.timestamps.length) return null;
    const validValues = waveform.values.filter((value): value is number => value !== null && Number.isFinite(value));
    const range = resolveWaveformDisplayRange(
      validValues,
      waveform.display_range?.min ?? 0,
      waveform.display_range?.max ?? 200,
    );
    const sourceDevice = waveform.source || "VitalDB";
    const allowedQualities = new Set(["GOOD", "DEGRADED", "UNKNOWN"]);
    const normalizedQuality = waveform.quality?.toUpperCase() ?? "UNKNOWN";
    const quality = (allowedQualities.has(normalizedQuality) ? normalizedQuality : "UNKNOWN") as WaveformPoint["quality"];
    const sampleCount = Math.min(waveform.timestamps.length, waveform.values.length);
    const recordedSamples: WaveformPoint[] = Array.from({ length: sampleCount }, (_, index) => {
      const eventTime = waveform.timestamps[index] * 1_000;
      const value = waveform.values[index];
      return {
        eventTime,
        receivedTime: eventTime,
        sourceDevice,
        value: value !== null && Number.isFinite(value) ? value : null,
        quality,
        provenance: "DIRECT",
      };
    });
    return {
      seed: 0,
      signal: "ABP",
      sourceDevice,
      qualitySignal: "ABP",
      sampleRateHz: waveform.sample_rate_hz,
      windowMs: 10_000,
      receiptDelayMs: 0,
      simulationTimeMs: (vitalDbCurrentTimeSeconds ?? 0) * 1_000,
      playbackStatus: replay.session?.status ?? "PAUSED",
      playbackSpeed: replay.session?.speed ?? 1,
      qualityStates: [],
      unit: waveform.unit || "NOT_RECORDED",
      yMin: range.min,
      yMax: range.max,
      recorded: true,
      recordedSamples,
    };
  }, [replay.session?.speed, replay.session?.status, vitalDbCurrentTimeSeconds, vitalDbProjection?.abp_waveform]);

  // SVG dimensions for the plot areas
  const plotWidth = 405;
  const plotHeight = 44;

  const rangeStart = trendWindow.start;
  const rangeEnd = trendWindow.end;
  const cursorX = timeToX(cursorTime, plotWidth, rangeStart, rangeEnd);

  // Build MAP curve from typed trend samples
  const mapPoints = trendSamples.flatMap((s) => typeof s.map === "number" ? [{
    x: timeToX(s.timestamp, plotWidth, rangeStart, rangeEnd),
    y: plotHeight - (s.map / 150) * plotHeight,
  }] : []);
  const generateMapPath = () => {
    if (mapPoints.length === 0) return "";
    let d = `M ${mapPoints[0].x.toFixed(1)} ${mapPoints[0].y.toFixed(1)}`;
    for (let i = 1; i < mapPoints.length; i++) {
      d += ` L ${mapPoints[i].x.toFixed(1)} ${mapPoints[i].y.toFixed(1)}`;
    }
    return d;
  };

  // Build HPI curve from typed trend samples
  const hpiPoints = trendSamples.flatMap((s) => {
    const value = isVitalDb ? s.hr : s.hpi;
    if (typeof value !== "number") return [];
    const y = isVitalDb
      ? plotHeight - ((value - 40) / (180 - 40)) * plotHeight
      : plotHeight - (value / 100) * plotHeight;
    return [{
    x: timeToX(s.timestamp, plotWidth, rangeStart, rangeEnd),
    y,
  }];
  });
  const generateHpiPath = () => {
    if (hpiPoints.length === 0) return "";
    let d = `M ${hpiPoints[0].x.toFixed(1)} ${hpiPoints[0].y.toFixed(1)}`;
    for (let i = 1; i < hpiPoints.length; i++) {
      d += ` L ${hpiPoints[i].x.toFixed(1)} ${hpiPoints[i].y.toFixed(1)}`;
    }
    return d;
  };

  const hpiFillPath = hpiPoints.length ? `${generateHpiPath()} L ${plotWidth} ${plotHeight} L 0 ${plotHeight} Z` : "";
  const timeLabels = buildTimeLabels(rangeStart, rangeEnd, 6, true);

  // Click on track to update synchronized timeline cursor
  const handlePlotClick = (e: React.MouseEvent<SVGSVGElement | HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = Math.max(0, Math.min(1, clickX / rect.width));
    const nextTime = xToTime(clickRatio * rect.width, rect.width, rangeStart, rangeEnd);
    setCursorTime(nextTime);
    setIsLive(false);
  };

  const selectObservedWaveformTime = (timeMs: number) => {
    setCursorTime(formatRelativeTime(timeMs / 1_000));
    setIsLive(false);
  };

  const selectSyntheticWaveformTime = (timeMs: number) => {
    const referenceClock = abpWaveformTimestamp ?? cursorTime;
    setCursorTime(shiftClockTime(referenceClock, timeMs - abpWaveformSource.simulationTimeMs));
    setIsLive(false);
  };

  return (
    <div className="bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-hidden h-full select-none">
      {/* Top Header with Timestamp Badge */}
      <div className="flex items-center justify-end h-5">
        <div className="bg-[#0A131B] border border-[rgba(100,170,210,0.32)] px-2 py-0.5 rounded-[3px] text-[11px] font-mono text-[#F4F6F7] tabular-nums font-semibold leading-none">
          {cursorTime}
        </div>
      </div>

      {/* Synchronized 3-Channel Signal Tracks */}
      <div className="flex-1 flex flex-col justify-between py-1">
        {/* ==================================================== */}
        {/* TRACK 1: ABP (Arterial Blood Pressure)               */}
        {/* ==================================================== */}
        <div className="h-[48px] border-b border-[rgba(100,170,210,0.15)] flex items-center justify-between">
            <div className="w-[68px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[13px] font-bold text-[#FF3348] tracking-tight">ABP</div>
              <div className="text-[9px] text-[#AAB4BB] font-mono">{isVitalDb ? (vitalDbProjection?.abp_waveform?.unit || "NOT_RECORDED") : "mmHg"}</div>
            </div>
            <div className="flex flex-col justify-between h-[36px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>{isVitalDb ? formatAxisValue(observedAbpSource?.yMax) : "200"}</span>
              <span>{isVitalDb ? formatAxisValue(observedAbpSource?.yMin) : "0"}</span>
            </div>
          </div>

          <div className="flex-1 h-full min-w-0 relative overflow-hidden flex items-center">
            {isVitalDb ? observedAbpSource ? (
              <ClinicalWaveformCanvas
                source={observedAbpSource}
                color="#FF3348"
                sweepMode
                accessibleLabel={`${t("vitaldb.recordedDataLabel")} · ABP ${observedAbpSource.unit}`}
                className="cursor-crosshair"
                onTimeSelect={selectObservedWaveformTime}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-[#AAB4BB]">
                {vitalDbProjection?.available_tracks.includes("SNUADC/ART") ? t("simulation.noMeasurement") : t("vitaldb.dataNotAvailable")}
              </div>
            ) : (
              <ClinicalWaveformCanvas
                source={abpWaveformSource}
                color="#FF3348"
                sweepMode
                accessibleLabel={abpWaveform
                  ? t("simulation.abpStripAt", { time: abpWaveformTimestamp ?? cursorTime })
                  : t("simulation.noMeasurement")}
                showCursor
                className="cursor-pointer"
                onTimeSelect={selectSyntheticWaveformTime}
                waitingLabel={t("simulation.noMeasurement")}
              />
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* TRACK 2: MAP (Mean Arterial Pressure)                */}
        {/* ==================================================== */}
        <div className="h-[48px] border-b border-[rgba(100,170,210,0.15)] flex items-center justify-between">
          <div className="w-[68px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[13px] font-bold text-[#F5E328] tracking-tight">MAP</div>
              <div className="text-[9px] text-[#AAB4BB] font-mono">mmHg</div>
            </div>
            <div className="flex flex-col justify-between h-[36px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>150</span>
              <span>0</span>
            </div>
          </div>

          <div className="flex-1 h-full relative overflow-hidden flex items-center">
            <svg
              onClick={handlePlotClick}
              className="w-full h-full cursor-pointer"
              viewBox={`0 0 ${plotWidth} ${plotHeight}`}
              preserveAspectRatio="none"
            >
              <line x1="0" y1={plotHeight - 1} x2={plotWidth} y2={plotHeight - 1} stroke="rgba(100,170,210,0.12)" strokeWidth="1" />
              <path
                d={generateMapPath()}
                fill="none"
                stroke="#F5E328"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1={cursorX}
                y1="0"
                x2={cursorX}
                y2={plotHeight}
                stroke="#F4F6F7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </svg>
          </div>
        </div>

        {/* ==================================================== */}
        {/* TRACK 3: HPI in demo mode, recorded HR in VitalDB mode */}
        {/* ==================================================== */}
        <div className="h-[48px] flex items-center justify-between">
          <div className="w-[68px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[13px] font-bold text-[#F4F6F7] tracking-tight">{isVitalDb ? "HR" : "HPI"}</div>
              <div className="text-[9px] text-[#AAB4BB] font-mono">{isVitalDb ? "/min" : "/100"}</div>
            </div>
            <div className="flex flex-col justify-between h-[36px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>{isVitalDb ? "180" : "100"}</span>
              <span>{isVitalDb ? "40" : "0"}</span>
            </div>
          </div>

          <div className="flex-1 h-full relative overflow-hidden flex items-center">
            <svg
              onClick={handlePlotClick}
              className="w-full h-full cursor-pointer"
              viewBox={`0 0 ${plotWidth} ${plotHeight}`}
              preserveAspectRatio="none"
            >
              {!isVitalDb && <defs>
                <linearGradient id="miniHpiGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF3348" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#FF3348" stopOpacity="0.05" />
                </linearGradient>
              </defs>}
              <line x1="0" y1={plotHeight - 1} x2={plotWidth} y2={plotHeight - 1} stroke="rgba(100,170,210,0.12)" strokeWidth="1" />
              {!isVitalDb && <path d={hpiFillPath} fill="url(#miniHpiGrad2)" />}
              <path
                d={generateHpiPath()}
                fill="none"
                stroke={isVitalDb ? "#00C5FF" : "#F4F6F7"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1={cursorX}
                y1="0"
                x2={cursorX}
                y2={plotHeight}
                stroke="#F4F6F7"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Shared Time Axis Footer */}
      <div className="flex justify-between text-[10px] font-mono text-[#AAB4BB] px-1 pt-0.5 border-t border-[rgba(100,170,210,0.32)]">
        {timeLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
      </div>
    </div>
  );
}

function formatAxisValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function formatRelativeTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

function shiftClockTime(clockTime: string, deltaMs: number): string {
  const normalized = clockTime.replace(/\s*[AP]M/i, "").trim();
  const parts = normalized.split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return clockTime;
  const [hours, minutes, seconds = 0] = parts;
  const shiftedSeconds = ((hours * 3_600 + minutes * 60 + seconds + Math.round(deltaMs / 1_000)) % 86_400 + 86_400) % 86_400;
  const shiftedHours = Math.floor(shiftedSeconds / 3_600).toString().padStart(2, "0");
  const shiftedMinutes = Math.floor((shiftedSeconds % 3_600) / 60).toString().padStart(2, "0");
  const shiftedRemainder = (shiftedSeconds % 60).toString().padStart(2, "0");
  return `${shiftedHours}:${shiftedMinutes}:${shiftedRemainder}`;
}

export { MiniSignalTrendPanel as MiniHemodynamicTrends };
