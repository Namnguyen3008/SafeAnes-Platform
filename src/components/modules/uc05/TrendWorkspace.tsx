"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { Plus, Minus, Bell, LayoutGrid, RotateCcw } from "lucide-react";
import {
  interpolateAtTimestamp,
  TrendDataPoint,
} from "./visualization/respiratoryTimeScale";
import { useTrendSync } from "@/context/RespiratoryContext";
import { TimeRangeDropdown } from "./ui/TimeRangeDropdown";
import { useTranslation } from "@/context/LocalizationContext";
import { UC04VitalDbSourceControl } from "@/components/modules/uc04/UC04VitalDbSourceControl";

export function TrendWorkspace() {
  const [activeTab, setActiveTab] = useState<"graphical" | "tabular" | "alarm">("graphical");
  const {
    cursorTimestamp,
    simulationMode,
    setCursorTimestamp,
    timeRangeHours,
    zoomIn,
    zoomOut,
    highlightedEventId,
    setHighlightedEventId,
    setSelectedAlarm,
    caseData,
    caseStartTimestamp,
    caseEndTimestamp,
  } = useTrendSync();
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [previewTimestamp, setPreviewTimestamp] = useState<number | null>(null);
  const { t } = useTranslation("uc05");
  const { t: tCommon } = useTranslation("common");

  const containerRef = useRef<HTMLDivElement>(null);

  const activeCursorTimestamp = previewTimestamp ?? cursorTimestamp;
  const { startTime, endTime } = useMemo(() => {
    const rangeMs = Math.min(timeRangeHours * 60 * 60 * 1_000, caseEndTimestamp - caseStartTimestamp);
    const endTime = Math.min(caseEndTimestamp, Math.max(cursorTimestamp, caseStartTimestamp + rangeMs));
    return { startTime: Math.max(caseStartTimestamp, endTime - rangeMs), endTime };
  }, [timeRangeHours, caseStartTimestamp, caseEndTimestamp, cursorTimestamp]);

  const trendPoints = useMemo<TrendDataPoint[]>(() => caseData.trendSeries
    .filter((point) => point.timestampMs !== undefined && point.timestampMs >= startTime && point.timestampMs <= endTime)
    .map((point) => ({
      timestamp: point.timestampMs!,
      timeStr: point.timestamp,
      etco2: point.etco2,
      rr: point.respiratoryRate,
      spo2: point.spo2,
    })), [caseData.trendSeries, startTime, endTime]);
  const etco2AxisMax = simulationMode ? 60 : Math.max(60, Math.ceil(Math.max(0, ...trendPoints.map((point) => point.etco2 ?? 0)) / 10) * 10);
  const rrAxisMax = simulationMode ? 30 : Math.max(30, Math.ceil(Math.max(0, ...trendPoints.map((point) => point.rr ?? 0)) / 5) * 5);
  const spo2AxisMin = simulationMode ? 90 : Math.min(90, Math.floor(Math.min(100, ...trendPoints.map((point) => point.spo2 ?? 100)) / 5) * 5);

  const formatElapsed = (milliseconds: number) => {
    const total = Math.max(0, Math.floor(milliseconds / 1_000));
    return `${Math.floor(total / 3_600).toString().padStart(2, "0")}:${Math.floor((total % 3_600) / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
  };
  const timeAxisLabels = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
    const timestamp = startTime + (endTime - startTime) * fraction;
    return simulationMode
      ? new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Ho_Chi_Minh",
      })
      : formatElapsed(timestamp);
  }), [startTime, endTime, simulationMode]);

  // Shared coordinate mapping constants
  const SVG_WIDTH = 1000;
  const TRACK_HEIGHT = 58;
  const TOTAL_SVG_HEIGHT = TRACK_HEIGHT * 3; // 174px total

  // MANDATORY: timeToX(timestamp) single shared time scale function
  const timeToX = useCallback(
    (timestamp: number): number => {
      const clamped = Math.max(startTime, Math.min(endTime, timestamp));
      return endTime === startTime ? 0 : ((clamped - startTime) / (endTime - startTime)) * SVG_WIDTH;
    },
    [startTime, endTime, SVG_WIDTH]
  );

  // Inverse mapping: x to timestamp
  const xToTime = useCallback(
    (x: number): number => {
      const clampedX = Math.max(0, Math.min(SVG_WIDTH, x));
      return endTime === startTime ? startTime : startTime + (clampedX / SVG_WIDTH) * (endTime - startTime);
    },
    [startTime, endTime, SVG_WIDTH]
  );

  // Map Y values for each track:
  // Track 1: EtCO2 (0 to 60 mmHg) -> Y: [54, 4]
  const etco2ToY = useCallback((val: number): number => {
    const clamped = Math.max(0, Math.min(etco2AxisMax, val));
    return 54 - (clamped / etco2AxisMax) * 50;
  }, [etco2AxisMax]);

  // Track 2: RR (0 to 30 /min) -> Y: [114, 64]
  const rrToY = useCallback((val: number): number => {
    const clamped = Math.max(0, Math.min(rrAxisMax, val));
    return 114 - (clamped / rrAxisMax) * 50;
  }, [rrAxisMax]);

  // Track 3: SpO2 (90 to 100 %) -> Y: [174, 124]
  const spo2ToY = useCallback((val: number): number => {
    const clamped = Math.max(spo2AxisMin, Math.min(100, val));
    return 174 - ((clamped - spo2AxisMin) / Math.max(1, 100 - spo2AxisMin)) * 50;
  }, [spo2AxisMin]);

  // Compute SVG polyline paths using the single timeToX function
  const { etco2Path, rrPath, spo2Path } = useMemo(() => {
    const createPath = (select: (point: TrendDataPoint) => number | null, toY: (value: number) => number) => {
      let path = "";
      let isSegmentOpen = false;
      trendPoints.forEach((point) => {
        const value = select(point);
        if (value === null) {
          isSegmentOpen = false;
          return;
        }
        const coordinate = `${timeToX(point.timestamp).toFixed(1)},${toY(value).toFixed(1)}`;
        path += `${isSegmentOpen ? " L " : " M "}${coordinate}`;
        isSegmentOpen = true;
      });
      return path.trim();
    };
    return {
      etco2Path: createPath((point) => point.etco2, etco2ToY),
      rrPath: createPath((point) => point.rr, rrToY),
      spo2Path: createPath((point) => point.spo2, spo2ToY),
    };
  }, [trendPoints, timeToX, etco2ToY, rrToY, spo2ToY]);

  // Current interpolated values at the active cursor position
  const currentValues = useMemo(() => {
    const values = interpolateAtTimestamp(trendPoints, activeCursorTimestamp, startTime, endTime);
    return simulationMode ? values : { ...values, timeStr: formatElapsed(activeCursorTimestamp) };
  }, [trendPoints, activeCursorTimestamp, startTime, endTime, simulationMode]);

  // Current X position of the synchronized cursor
  const cursorX = useMemo(() => timeToX(activeCursorTimestamp), [timeToX, activeCursorTimestamp]);
  const markerYEtco2 = currentValues.etco2 === null ? null : etco2ToY(currentValues.etco2);
  const markerYRr = currentValues.rr === null ? null : rrToY(currentValues.rr);
  const markerYSpo2 = currentValues.spo2 === null ? null : spo2ToY(currentValues.spo2);

  // Mouse move handler for interactive scrubbing over the synchronized canvas
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || previewTimestamp === null) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, relativeX / rect.width));
      const svgX = fraction * SVG_WIDTH;
      setPreviewTimestamp(xToTime(svgX));
    },
    [xToTime, SVG_WIDTH, previewTimestamp]
  );

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setPreviewTimestamp(xToTime(fraction * SVG_WIDTH));
  }, [xToTime, SVG_WIDTH]);

  const commitPreview = useCallback(() => {
    if (previewTimestamp !== null) setCursorTimestamp(previewTimestamp);
    setPreviewTimestamp(null);
  }, [previewTimestamp, setCursorTimestamp]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    commitPreview();
  }, [commitPreview]);

  return (
    <section className="uc05-trend-workspace shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] flex flex-col p-2 rounded-[2px] relative select-none">
      {/* 1. TREND HEADER */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(80,160,210,0.45)]">
        {/* Compact Tabs */}
        <div className="flex items-center gap-1.5" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "graphical"}
            onClick={() => setActiveTab("graphical")}
            className={`px-3.5 py-1 text-[13px] font-semibold rounded-[2px] border transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer ${
              activeTab === "graphical"
                ? "bg-[#0284c7] text-[#F4F6F7] border-[#12B9F2]/60"
                : "bg-[#09151D] text-[#A7B0B6] border-[rgba(80,160,210,0.45)] hover:bg-[#0c1a24]"
            }`}
          >
            {t("trend.graphicalTab")}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "tabular"}
            onClick={() => setActiveTab("tabular")}
            className={`px-3.5 py-1 text-[13px] font-medium rounded-[2px] border transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer ${
              activeTab === "tabular"
                ? "bg-[#0284c7] text-[#F4F6F7] border-[#12B9F2]/60"
                : "bg-[#09151D] text-[#A7B0B6] border-[rgba(80,160,210,0.45)] hover:bg-[#0c1a24]"
            }`}
          >
            {t("trend.tabularTab")}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "alarm"}
            onClick={() => setActiveTab("alarm")}
            className={`px-3.5 py-1 text-[13px] font-medium rounded-[2px] border transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer ${
              activeTab === "alarm"
                ? "bg-[#0284c7] text-[#F4F6F7] border-[#12B9F2]/60"
                : "bg-[#09151D] text-[#A7B0B6] border-[rgba(80,160,210,0.45)] hover:bg-[#0c1a24]"
            }`}
          >
            {t("trend.alarmTab")}
          </button>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          <UC04VitalDbSourceControl />
          {/* Time Range Dropdown (1h, 2h, 4h, 8h, 12h) */}
          {simulationMode ? <TimeRangeDropdown /> : <span className="px-2 text-[10px] font-mono text-[#A7B0B6]">VitalDB · 1 h</span>}

          {/* Zoom Buttons */}
          <button
            onClick={zoomIn}
            disabled={timeRangeHours === 1}
            title={t("trend.zoomIn")}
            aria-label={t("trend.zoomIn")}
            className="p-1 text-[#F4F6F7] disabled:text-[#A7B0B6]/40 bg-[#09151D] hover:bg-[#0c1a24] disabled:hover:bg-[#09151D] border border-[rgba(80,160,210,0.45)] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={zoomOut}
            disabled={!simulationMode || timeRangeHours === 12}
            title={t("trend.zoomOut")}
            aria-label={t("trend.zoomOut")}
            className="p-1 text-[#F4F6F7] disabled:text-[#A7B0B6]/40 bg-[#09151D] hover:bg-[#0c1a24] disabled:hover:bg-[#09151D] border border-[rgba(80,160,210,0.45)] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer disabled:cursor-not-allowed"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Selected Timestamp Badge */}
          <div className="px-2.5 py-0.5 text-[13px] font-mono font-medium text-[#12B9F2] bg-[#09151D] border border-[#12B9F2] rounded-[2px] tabular-nums">
            {currentValues.timeStr}
          </div>
        </div>
      </div>

      {/* 2. TAB CONTENT */}
      {activeTab === "graphical" && (
        <div className="flex-1 min-h-0 flex flex-col justify-between py-0 relative">
          <div className="flex-1 flex">
            {/* Left Modality Labels & Scales */}
            <div className="w-[68px] flex flex-col justify-between select-none">
              {/* Track 1 Label (EtCO2) */}
              <div className="uc05-trend-track-row flex justify-between py-1 pr-1.5 text-[12px] font-mono leading-none border-b border-[rgba(80,160,210,0.3)]">
                <div className="flex flex-col justify-between">
                  <span className="text-[#FFE800] font-bold text-[15px]">EtCO₂</span>
                  <span className="text-[#A7B0B6] text-[11px]">mmHg</span>
                </div>
                <div className="flex flex-col justify-between items-end text-[10.5px] text-[#A7B0B6] tabular-nums">
                  <span className="leading-none">{etco2AxisMax}</span>
                  <span className="leading-none">0</span>
                </div>
              </div>

              {/* Track 2 Label (RR) */}
              <div className="uc05-trend-track-row flex justify-between py-1 pr-1.5 text-[12px] font-mono leading-none border-b border-[rgba(80,160,210,0.3)]">
                <div className="flex flex-col justify-between">
                  <span className="text-[#F4F6F7] font-bold text-[15px]">RR</span>
                  <span className="text-[#A7B0B6] text-[11px]">/min</span>
                </div>
                <div className="flex flex-col justify-between items-end text-[10.5px] text-[#A7B0B6] tabular-nums">
                  <span className="leading-none">{rrAxisMax}</span>
                  <span className="leading-none">0</span>
                </div>
              </div>

              {/* Track 3 Label (SpO2) */}
              <div className="uc05-trend-track-row flex justify-between py-1 pr-1.5 text-[12px] font-mono leading-none">
                <div className="flex flex-col justify-between">
                  <span className="text-[#12B9F2] font-bold text-[15px]">SpO₂</span>
                  <span className="text-[#A7B0B6] text-[11px]">%</span>
                </div>
                <div className="flex flex-col justify-between items-end text-[10.5px] text-[#A7B0B6] tabular-nums">
                  <span className="leading-none">100</span>
                  <span className="leading-none">{spo2AxisMin}</span>
                </div>
              </div>
            </div>

            {/* Unified SVG Canvas for all 3 Tracks + Event Regions + Cursor */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={commitPreview}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={handleMouseLeave}
              className="flex-1 h-full bg-[#03070A]/85 border-l border-[rgba(80,160,210,0.35)] relative cursor-crosshair overflow-hidden"
            >
              {/* TREND HOVER TOOLTIP */}
              {isHovering && (
                <div
                  className="absolute top-2 pointer-events-none z-30 transition-all duration-75"
                  style={{
                    left: `${Math.min(Math.max(2, (cursorX / SVG_WIDTH) * 100 - 8), 75)}%`,
                  }}
                >
                  <div className="bg-[#09151D]/95 border border-[rgba(80,160,210,0.7)] rounded-[2px] p-2 shadow-2xl backdrop-blur-md text-[11px] font-mono tabular-nums space-y-1">
                    <div className="text-[#12B9F2] font-semibold border-b border-[rgba(80,160,210,0.3)] pb-0.5">
                      {currentValues.timeStr}
                    </div>
                    <div className="flex justify-between gap-3 text-[#FFE800]">
                      <span>EtCO₂:</span>
                      <span className="font-bold">{currentValues.etco2 ?? "--"} {caseData.vitals.units?.etco2 ?? "mmHg"}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-[#F4F6F7]">
                      <span>RR:</span>
                      <span className="font-bold">{currentValues.rr ?? "--"} {caseData.vitals.units?.respiratoryRate ?? "/min"}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-[#12B9F2]">
                      <span>SpO₂:</span>
                      <span className="font-bold">{currentValues.spo2 ?? "--"} {caseData.vitals.units?.spo2 ?? "%"}</span>
                    </div>
                  </div>
                </div>
              )}

              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${TOTAL_SVG_HEIGHT}`}
                preserveAspectRatio="none"
                className="w-full h-full"
              >
                {/* A. Dashed horizontal reticle grid lines for each track */}
                <line x1="0" y1="29" x2={SVG_WIDTH} y2="29" stroke="rgba(160, 190, 205, 0.22)" strokeDasharray="3 3" />
                <line x1="0" y1="58" x2={SVG_WIDTH} y2="58" stroke="rgba(80, 160, 210, 0.35)" strokeWidth="1" />

                <line x1="0" y1="87" x2={SVG_WIDTH} y2="87" stroke="rgba(160, 190, 205, 0.22)" strokeDasharray="3 3" />
                <line x1="0" y1="116" x2={SVG_WIDTH} y2="116" stroke="rgba(80, 160, 210, 0.35)" strokeWidth="1" />

                <line x1="0" y1="145" x2={SVG_WIDTH} y2="145" stroke="rgba(160, 190, 205, 0.22)" strokeDasharray="3 3" />

                {/* Vertical dashed time grid lines */}
                {[0, 250, 500, 750, 1000].map((vx, i) => (
                  <line
                    key={`vt-${i}`}
                    x1={vx}
                    y1={0}
                    x2={vx}
                    y2={TOTAL_SVG_HEIGHT}
                    stroke="rgba(160, 190, 205, 0.16)"
                    strokeDasharray="3 3"
                  />
                ))}

                {/* B. EVENT REGIONS */}
                {caseData.eventRegions.map((event) => {
                  const startX = timeToX(event.startMs);
                  const endX = timeToX(event.endMs);
                  const width = Math.max(4, endX - startX);
                  const isHighlighted =
                    highlightedEventId === event.id ||
                    highlightedEventId === event.alarmId;
                  const isQuality = event.kind === "QUALITY";

                  return (
                    <g
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      aria-label={event.name}
                      className="event-band cursor-pointer"
                      onClick={() => {
                        setHighlightedEventId(event.alarmId ?? event.id);
                        const alarm = event.alarmId
                          ? caseData.alarmReview.find((item) => item.id === event.alarmId)
                          : undefined;
                        if (alarm) setSelectedAlarm(alarm);
                        else setCursorTimestamp(event.startMs);
                      }}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                          keyEvent.preventDefault();
                          setHighlightedEventId(event.alarmId ?? event.id);
                          const alarm = event.alarmId
                            ? caseData.alarmReview.find((item) => item.id === event.alarmId)
                            : undefined;
                          if (alarm) setSelectedAlarm(alarm);
                          else setCursorTimestamp(event.startMs);
                        }
                      }}
                    >
                      <rect
                        x={startX}
                        y={0}
                        width={width}
                        height={TOTAL_SVG_HEIGHT}
                        fill={isQuality
                          ? "rgba(255, 232, 0, 0.16)"
                          : caseData.sourceMode === "VITALDB_REPLAY"
                            ? isHighlighted ? "rgba(18, 185, 242, 0.28)" : "rgba(18, 185, 242, 0.12)"
                            : isHighlighted ? "rgba(224, 0, 20, 0.68)" : "rgba(224, 0, 20, 0.42)"}
                        stroke={isQuality
                          ? "rgba(255, 232, 0, 0.8)"
                          : caseData.sourceMode === "VITALDB_REPLAY"
                            ? isHighlighted ? "#12B9F2" : "rgba(18, 185, 242, 0.65)"
                            : isHighlighted ? "#FFE800" : "rgba(224, 0, 20, 0.85)"}
                        strokeWidth={isHighlighted ? "2" : "1"}
                        className={isHighlighted ? "animate-pulse" : ""}
                      />
                    </g>
                  );
                })}

                {/* C. TREND SIGNALS */}
                <path
                  d={etco2Path}
                  fill="none"
                  stroke="#FFE800"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                <path
                  d={rrPath}
                  fill="none"
                  stroke="#F4F6F7"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                <path
                  d={spo2Path}
                  fill="none"
                  stroke="#12B9F2"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {/* D. ONE SHARED VERTICAL WHITE TIME CURSOR */}
                <g className="shared-time-cursor pointer-events-none">
                  <line
                    x1={cursorX}
                    y1={0}
                    x2={cursorX}
                    y2={TOTAL_SVG_HEIGHT}
                    stroke="#FFFFFF"
                    strokeWidth="1.6"
                  />

                  {markerYEtco2 !== null && <circle
                    cx={cursorX}
                    cy={markerYEtco2}
                    r="4"
                    fill="#061019"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />}

                  {markerYRr !== null && <circle
                    cx={cursorX}
                    cy={markerYRr}
                    r="4"
                    fill="#061019"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />}

                  {markerYSpo2 !== null && <circle
                    cx={cursorX}
                    cy={markerYSpo2}
                    r="4"
                    fill="#061019"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />}
                </g>
              </svg>
            </div>

            {/* Right Live Numeric Readouts at Cursor Timestamp */}
            <div className="w-16 flex flex-col justify-between pl-2 select-none border-l border-[rgba(80,160,210,0.35)] bg-[#061019]">
              <div className="uc05-trend-track-row flex items-center border-b border-[rgba(80,160,210,0.3)]">
                <span className="font-mono font-bold text-[26px] text-[#FFE800] tabular-nums">
                  {currentValues.etco2}
                </span>
              </div>

              <div className="uc05-trend-track-row flex items-center border-b border-[rgba(80,160,210,0.3)]">
                <span className="font-mono font-bold text-[26px] text-[#F4F6F7] tabular-nums">
                  {currentValues.rr}
                </span>
              </div>

              <div className="uc05-trend-track-row flex items-center">
                <span className="font-mono font-bold text-[26px] text-[#12B9F2] tabular-nums">
                  {currentValues.spo2}
                </span>
              </div>
            </div>
          </div>

          {/* 3. TIME AXIS. The selected time remains in the panel header readout. */}
          <div className="h-6 flex items-center text-[12px] text-[#A7B0B6] font-mono tabular-nums pl-[68px] pr-16 border-t border-[rgba(80,160,210,0.35)] relative mt-1">
            <div className="w-full flex justify-between select-none">
              {timeAxisLabels.map((lbl, idx) => (
                <span key={idx}>{lbl}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* EXPANDED TABULAR TREND VIEW IN WORKSPACE */}
      {activeTab === "tabular" && (
        <div className="flex-1 flex flex-col justify-between py-2 text-[13px] overflow-hidden">
          <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(80,160,210,0.35)]">
            <span className="text-[#F4F6F7] font-semibold flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-[#12B9F2]" />
              {t("trend.expandedTabular", { hours: timeRangeHours })}
            </span>
            <button
              onClick={() => setActiveTab("graphical")}
              className="flex items-center gap-1 px-2.5 py-0.5 text-[12px] text-[#12B9F2] bg-[#09151D] border border-[#12B9F2]/50 hover:bg-[#0c1a24] rounded-[2px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t("waveforms.backToGraph")}</span>
            </button>
          </div>
          <div className="clinical-table-scroll clinical-table-sticky flex-1 min-w-0 overflow-auto mt-1">
            <table className="min-w-[640px] w-full text-[12.5px] text-center border-collapse">
              <thead className="bg-[#09151D] sticky top-0 z-10">
                <tr className="text-[#A7B0B6] border-b border-[rgba(80,160,210,0.35)] font-medium bg-[#09151D]/60">
                  <th className="py-1 px-2 text-left whitespace-nowrap">{tCommon("table.time")}</th>
                  <th className="py-1 px-2 text-[#FFE800] whitespace-nowrap">EtCO₂ ({caseData.vitals.units?.etco2 ?? "mmHg"})</th>
                  <th className="py-1 px-2 text-[#F4F6F7] whitespace-nowrap">RR ({caseData.vitals.units?.respiratoryRate ?? "/min"})</th>
                  <th className="py-1 px-2 text-[#12B9F2] whitespace-nowrap">SpO₂ ({caseData.vitals.units?.spo2 ?? "%"})</th>
                  <th className="py-1 px-2 text-[#39E336] whitespace-nowrap">PR ({caseData.vitals.units?.pulseRate ?? "bpm"})</th>
                  <th className="py-1 px-2 whitespace-nowrap">{t("trend.clinicalStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(80,160,210,0.2)] font-mono tabular-nums text-[#F4F6F7]">
                {caseData.tabularTrends.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setCursorTimestamp(row.timestamp)}
                    className="hover:bg-[#09151D] cursor-pointer"
                  >
                    <td className="py-1 px-2 text-left text-[#A7B0B6]">{row.timeStr}</td>
                    <td className="py-1 px-2 text-[#FFE800]">{row.etco2 ?? "--"}</td>
                    <td className="py-1 px-2 text-[#F4F6F7]">{row.rr ?? "--"}</td>
                    <td className="py-1 px-2 text-[#12B9F2]">{row.spo2 ?? "--"}</td>
                    <td className="py-1 px-2 text-[#39E336]">{row.pr ?? "--"}</td>
                    <td className="py-1 px-2 text-emerald-400 font-sans text-[11px]">
                      {[row.etco2, row.rr, row.spo2, row.pr].some((value) => value === null)
                        ? t("simulation.signalUnavailable")
                        : simulationMode ? t("trend.normal") : t("vitalDb.recordedValue")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXPANDED ALARM REVIEW VIEW IN WORKSPACE */}
      {activeTab === "alarm" && (
        <div className="flex-1 flex flex-col justify-between py-2 text-[13px] overflow-hidden">
          <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(80,160,210,0.35)]">
            <span className="text-[#F4F6F7] font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#FFE800]" />
              {t("trend.expandedAlarm", { hours: timeRangeHours })}
            </span>
            <button
              onClick={() => setActiveTab("graphical")}
              className="flex items-center gap-1 px-2.5 py-0.5 text-[12px] text-[#12B9F2] bg-[#09151D] border border-[#12B9F2]/50 hover:bg-[#0c1a24] rounded-[2px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t("waveforms.backToGraph")}</span>
            </button>
          </div>
          <div className="flex-1 overflow-auto mt-1 space-y-1.5">
            {caseData.alarmReview.length === 0 ? (
              <div className="p-3 text-sm text-[#A7B0B6]">{caseData.sourceMode === "VITALDB_REPLAY" ? t("vitalDb.noEvents") : t("simulation.noRespiratoryEvents")}</div>
            ) : caseData.alarmReview.map((event) => (
              <button
                type="button"
                key={event.id}
                title={event.provenance ? JSON.stringify(event.provenance) : undefined}
                onClick={() => {
                  setHighlightedEventId(event.id);
                  setSelectedAlarm(event);
                }}
                className={`w-full p-2 ${caseData.sourceMode === "VITALDB_REPLAY" ? "bg-[#09151D] border border-[rgba(80,160,210,0.3)]" : "bg-[#8A0E18]"} text-[#F4F6F7] rounded-[2px] flex items-center justify-between text-left`}
              >
                <span className="min-w-0 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-[14px]">{event.translationKey ? t(event.translationKey) : event.eventName}</span>
                  <span className="text-[#A7B0B6] text-[12px] font-mono">{event.timestamp} ({event.durationSeconds ?? "--"} sec)</span>
                  {event.sourceClass && <span className="w-full text-[10px] leading-snug text-[#A7B0B6]">{event.definition} · {event.source} · {t("vitalDb.eventQuality")}: {event.quality}</span>}
                </span>
                {event.sourceClass && <span className="shrink-0 px-2 py-0.5 text-[10px] font-mono border border-safe-border text-safe-text-muted rounded-sm">{t(event.sourceClass === "OBSERVED" ? "vitalDb.eventObserved" : "vitalDb.eventDerived")}</span>}
                {!event.sourceClass && <span className="shrink-0 px-2 py-0.5 text-[11px] font-bold bg-[#E00014] rounded-[2px]">{t("alarms.highPriority")}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Alias for backwards compatibility
export { TrendWorkspace as GraphicalTrendPanel };
export default TrendWorkspace;
