"use client";

import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ArrowUpDown } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { TrackTooltip } from "./ui/Tooltip";
import { buildTimeLabels, timeToX, xToTime } from "./visualization/timeScale";
import { pointsToSmoothPath } from "./visualization/svgPaths";
import { mapY } from "./visualization/hemodynamicScales";
import { useTranslation } from "@/context/LocalizationContext";
import { VitalDbHemodynamicTrendPanel } from "./VitalDbHemodynamicTrendPanel";

export function HemodynamicTrendPanel() {
  const { dataSourceMode } = useHemodynamic();
  return dataSourceMode === "VITALDB_REPLAY"
    ? <VitalDbHemodynamicTrendPanel />
    : <SimulationHemodynamicTrendPanel />;
}

function SimulationHemodynamicTrendPanel() {
  const { t } = useTranslation("uc04");
  const {
    cursorTime,
    setCursorTime,
    isLive,
    setIsLive,
    selectedEventId,
    events,
    trendSamples,
    vitals,
    trendWindow,
    riskAlertThresholdPercent,
  } = useHemodynamic();

  const [hoverInfo, setHoverInfo] = useState<{
    visible: boolean;
    x: number;
    y: number;
    time: string;
    param: string;
    value: string | number;
    unit: string;
  } | null>(null);

  const plotWidth = 510;
  const trackHeight = 72;
  const rangeStart = trendWindow.start;
  const rangeEnd = trendWindow.end;
  const cursorX = timeToX(cursorTime, plotWidth, rangeStart, rangeEnd);

  // Derive time-series from typed trend samples with memoization
  const {
    rawHpi,
    rawSvv,
    rawSvr,
    rawCi,
    hpiPoints,
    svvPoints,
    svrPoints,
    ciPoints,
    hpiLinePath,
    svvLinePath,
    svrLinePath,
    ciLinePath,
  } = useMemo(() => {
    const series = (key: "hpi" | "svv" | "svr" | "ci") => trendSamples.flatMap((sample) =>
      typeof sample[key] === "number" ? [{ t: sample.timestamp, v: sample[key] as number }] : []
    );
    const rHpi = series("hpi");
    const rSvv = series("svv");
    const rSvr = series("svr");
    const rCi = series("ci");

    const ptsHpi = rHpi.map((d) => ({
      x: timeToX(d.t, plotWidth, rangeStart, rangeEnd),
      y: mapY(d.v, 0, 100, trackHeight),
    }));
    const ptsSvv = rSvv.map((d) => ({
      x: timeToX(d.t, plotWidth, rangeStart, rangeEnd),
      y: mapY(d.v, 0, 30, trackHeight),
    }));
    const ptsSvr = rSvr.map((d) => ({
      x: timeToX(d.t, plotWidth, rangeStart, rangeEnd),
      y: mapY(d.v, 500, 2000, trackHeight),
    }));
    const ptsCi = rCi.map((d) => ({
      x: timeToX(d.t, plotWidth, rangeStart, rangeEnd),
      y: mapY(d.v, 0, 5, trackHeight),
    }));

    return {
      rawHpi: rHpi,
      rawSvv: rSvv,
      rawSvr: rSvr,
      rawCi: rCi,
      hpiPoints: ptsHpi,
      svvPoints: ptsSvv,
      svrPoints: ptsSvr,
      ciPoints: ptsCi,
      hpiLinePath: pointsToSmoothPath(ptsHpi),
      svvLinePath: pointsToSmoothPath(ptsSvv),
      svrLinePath: pointsToSmoothPath(ptsSvr),
      ciLinePath: pointsToSmoothPath(ptsCi),
    };
  }, [trendSamples, plotWidth, trackHeight, rangeStart, rangeEnd]);

  const hpiAreaPath = hpiLinePath ? `${hpiLinePath} L ${cursorX} ${trackHeight} L 0 ${trackHeight} Z` : "";

  // Y-axis threshold positions
  const hpiThresholdY = riskAlertThresholdPercent == null
    ? null
    : mapY(riskAlertThresholdPercent, 0, 100, trackHeight);
  const svrThresholdY = mapY(1000, 500, 2000, trackHeight);

  // Selected event marker X
  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const eventMarkerX = selectedEvent ? timeToX(selectedEvent.timestamp, plotWidth, rangeStart, rangeEnd) : null;

  // Handle Track Click
  const handleTrackClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = xToTime(clickX, rect.width, rangeStart, rangeEnd);
    setCursorTime(newTime);
    setIsLive(false);
  };

  // Handle Hover Interaction
  const handleTrackHover = (
    e: React.MouseEvent<SVGSVGElement>,
    param: string,
    unit: string,
    points: { x: number; y: number }[],
    rawData: { t: string; v: number }[]
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const timeAtMouse = xToTime(mouseX, rect.width, rangeStart, rangeEnd);

    if (rawData.length === 0) return;

    // Find nearest data point
    let nearest = rawData[0];
    let minDiff = Infinity;
    const mouseParts = timeAtMouse.split(":").map(Number);
    const mouseSec = mouseParts[0] * 3600 + mouseParts[1] * 60 + mouseParts[2];

    for (const d of rawData) {
      const p = d.t.split(":").map(Number);
      const s = p[0] * 3600 + p[1] * 60 + (p[2] || 0);
      const diff = Math.abs(s - mouseSec);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = d;
      }
    }

    setHoverInfo({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      time: timeAtMouse,
      param,
      value: nearest.v,
      unit,
    });
  };

  const handleTrackLeave = () => {
    setHoverInfo(null);
  };
  const lastNumeric = (key: "hpi" | "svv" | "svr" | "ci") =>
    [...trendSamples].reverse().find((sample) => typeof sample[key] === "number")?.[key] as number | undefined;
  const currentHpi = vitals.hpi ?? lastNumeric("hpi");
  const currentSvv = vitals.svv ?? lastNumeric("svv");
  const currentSvr = vitals.svr ?? lastNumeric("svr");
  const currentCi = vitals.ci ?? lastNumeric("ci");
  const axisLabels = buildTimeLabels(rangeStart, rangeEnd, 6);

  return (
    <div className="bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-hidden h-full select-none relative">
      {/* Track Hover Floating Tooltip */}
      {hoverInfo && (
        <div className="fixed z-50 pointer-events-none" style={{ left: hoverInfo.x, top: hoverInfo.y }}>
          <TrackTooltip
            visible={hoverInfo.visible}
            x={0}
            y={0}
            time={hoverInfo.time}
            param={hoverInfo.param}
            value={hoverInfo.value}
            unit={hoverInfo.unit}
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* PANEL TOOLBAR HEADER                                     */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(100,170,210,0.32)]">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-[#F4F6F7] tracking-tight">
            {t("header.trends")}
          </h2>
          <span className="text-[12px] text-[#AAB4BB]">({t("simulation.trendWindow")})</span>
          <span className="text-[9px] font-bold text-safe-yellow border border-safe-yellow/40 rounded-sm px-1 py-0.5">{t("simulation.demoOnly")}</span>
        </div>

        {/* Compact Workstation Controls */}
        <div className="flex items-center gap-1.5">
          <button className="px-1.5 py-0.5 rounded-[2px] bg-[#0A131B] text-[#AAB4BB] border border-[rgba(100,170,210,0.2)] hover:text-white" title="Search Trends">
            <Search className="w-3.5 h-3.5 text-[#AAB4BB]" />
          </button>
          <button className="flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-[#0A131B] text-[#AAB4BB] border border-[rgba(100,170,210,0.2)] hover:text-white text-[11px]">
            <span>30 min</span>
            <ChevronDown className="w-3 h-3 text-[#AAB4BB]" />
          </button>
          <button className="px-1.5 py-0.5 rounded-[2px] bg-[#0A131B] text-[#AAB4BB] border border-[rgba(100,170,210,0.2)] hover:text-white" title="Cursor Marker Toggle">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#AAB4BB]" />
          </button>

          {/* Live Button Toggle */}
          <button
            onClick={() => {
              setIsLive(true);
            }}
            className={`px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1 rounded-[2px] border transition-colors ${
              isLive
                ? "border-[#00C5FF] text-[#00C5FF] bg-[#00C5FF]/10"
                : "border-[rgba(100,170,210,0.2)] text-[#AAB4BB] bg-[#0A131B]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[#00C5FF] animate-pulse" : "bg-[#AAB4BB]"}`}
            />
            Live
          </button>

          {/* Synchronized Timestamp Display */}
          <div className="bg-[#0A131B] border border-[rgba(100,170,210,0.32)] px-2 py-0.5 rounded-[3px] text-[11px] font-mono text-[#F4F6F7] tabular-nums font-semibold">
            {cursorTime}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4 STACKED SYNCHRONIZED CHANNELS                          */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col justify-between py-0.5">
        {/* TRACK 1: HPI */}
        <div className="h-[76px] border-b border-[rgba(100,170,210,0.15)] flex items-center justify-between">
          <div className="w-[72px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-[#FF3348] tracking-tight">HPI</div>
              <div className="text-[10px] text-[#AAB4BB] font-mono">/100</div>
            </div>
            <div className="flex flex-col justify-between h-[48px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>100</span>
              <span>0</span>
            </div>
          </div>

          <div className="flex-1 h-full relative overflow-hidden flex items-center">
            <svg
              onClick={handleTrackClick}
              onMouseMove={(e) => handleTrackHover(e, "HPI", "/100", hpiPoints, rawHpi)}
              onMouseLeave={handleTrackLeave}
              className="w-full h-full cursor-pointer"
              viewBox={`0 0 ${plotWidth} ${trackHeight}`}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="mainHpiRiskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF3348" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#FF3348" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              <line x1="0" y1="6" x2={plotWidth} y2="6" stroke="rgba(100,170,210,0.08)" strokeWidth="1" />
              <line x1="0" y1={trackHeight - 6} x2={plotWidth} y2={trackHeight - 6} stroke="rgba(100,170,210,0.08)" strokeWidth="1" />

              {/* Red Dashed Alarm threshold line at 85 */}
              {hpiThresholdY !== null && <line
                x1="0"
                y1={hpiThresholdY}
                x2={plotWidth}
                y2={hpiThresholdY}
                stroke="#FF3348"
                strokeWidth="1.4"
                strokeDasharray="4 4"
              />}

              {/* Red Risk Fill Area */}
              <path d={hpiAreaPath} fill="url(#mainHpiRiskGrad)" />

              {/* White Curve */}
              <path d={hpiLinePath} fill="none" stroke="#F4F6F7" strokeWidth="2.2" strokeLinecap="round" />

              {/* Selected Event Marker */}
              {eventMarkerX !== null && (
                <line x1={eventMarkerX} y1="0" x2={eventMarkerX} y2={trackHeight} stroke="#00C5FF" strokeWidth="1.2" strokeDasharray="2 2" />
              )}

              {/* Shared Dashed Vertical Cursor */}
              <line x1={cursorX} y1="0" x2={cursorX} y2={trackHeight} stroke="#F4F6F7" strokeWidth="1" strokeDasharray="3 3" />
              {hpiPoints.length > 0 && <circle cx={cursorX} cy={hpiPoints[hpiPoints.length - 1].y} r="3.5" fill="#FF3348" stroke="#FFFFFF" strokeWidth="1" />}
            </svg>
          </div>

          <div className="w-[60px] text-right shrink-0">
            <span className="text-[28px] font-black font-mono text-[#F4F6F7] tabular-nums tracking-tight">
              {currentHpi ?? "--"}
            </span>
          </div>
        </div>

        {/* TRACK 2: SVV */}
        <div className="h-[76px] border-b border-[rgba(100,170,210,0.15)] flex items-center justify-between">
          <div className="w-[72px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-[#4AF26F] tracking-tight">SVV</div>
              <div className="text-[10px] text-[#AAB4BB] font-mono">%</div>
            </div>
            <div className="flex flex-col justify-between h-[48px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>30</span>
              <span>0</span>
            </div>
          </div>

          <div className="flex-1 h-full relative overflow-hidden flex items-center">
            <svg
              onClick={handleTrackClick}
              onMouseMove={(e) => handleTrackHover(e, "SVV", "%", svvPoints, rawSvv)}
              onMouseLeave={handleTrackLeave}
              className="w-full h-full cursor-pointer"
              viewBox={`0 0 ${plotWidth} ${trackHeight}`}
              preserveAspectRatio="none"
            >
              <line x1="0" y1="6" x2={plotWidth} y2="6" stroke="rgba(100,170,210,0.08)" strokeWidth="1" />
              <line x1="0" y1={trackHeight - 6} x2={plotWidth} y2={trackHeight - 6} stroke="rgba(100,170,210,0.08)" strokeWidth="1" />

              <path d={svvLinePath} fill="none" stroke="#4AF26F" strokeWidth="2.2" strokeLinecap="round" />

              {eventMarkerX !== null && (
                <line x1={eventMarkerX} y1="0" x2={eventMarkerX} y2={trackHeight} stroke="#00C5FF" strokeWidth="1.2" strokeDasharray="2 2" />
              )}

              <line x1={cursorX} y1="0" x2={cursorX} y2={trackHeight} stroke="#F4F6F7" strokeWidth="1" strokeDasharray="3 3" />
              {svvPoints.length > 0 && <circle cx={cursorX} cy={svvPoints[svvPoints.length - 1].y} r="3.5" fill="#4AF26F" stroke="#FFFFFF" strokeWidth="1" />}
            </svg>
          </div>

          <div className="w-[60px] text-right shrink-0">
            <span className="text-[28px] font-black font-mono text-[#F4F6F7] tabular-nums tracking-tight">
              {currentSvv ?? "--"}
            </span>
          </div>
        </div>

        {/* TRACK 3: SVR */}
        <div className="h-[76px] border-b border-[rgba(100,170,210,0.15)] flex items-center justify-between">
          <div className="w-[72px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-[#F5E328] tracking-tight">SVR</div>
              <div className="text-[9px] text-[#AAB4BB] font-mono leading-none">dyne·s/cm⁵</div>
            </div>
            <div className="flex flex-col justify-between h-[48px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>2000</span>
              <span>500</span>
            </div>
          </div>

          <div className="flex-1 h-full relative overflow-hidden flex items-center">
            <svg
              onClick={handleTrackClick}
              onMouseMove={(e) => handleTrackHover(e, "SVR", "dyne·s/cm⁵", svrPoints, rawSvr)}
              onMouseLeave={handleTrackLeave}
              className="w-full h-full cursor-pointer"
              viewBox={`0 0 ${plotWidth} ${trackHeight}`}
              preserveAspectRatio="none"
            >
              <line x1="0" y1="6" x2={plotWidth} y2="6" stroke="rgba(100,170,210,0.08)" strokeWidth="1" />
              <line x1="0" y1={trackHeight - 6} x2={plotWidth} y2={trackHeight - 6} stroke="rgba(100,170,210,0.08)" strokeWidth="1" />

              {/* Abnormal SVR (> 1000 dyne*s/cm5) Red Shaded Background Band */}
              <rect
                x="0"
                y="0"
                width={plotWidth}
                height={svrThresholdY}
                fill="#FF3348"
                fillOpacity="0.22"
              />
              <line
                x1="0"
                y1={svrThresholdY}
                x2={plotWidth}
                y2={svrThresholdY}
                stroke="#FF3348"
                strokeWidth="1"
                strokeDasharray="4 4"
                strokeOpacity="0.6"
              />

              {/* Yellow/Orange Line */}
              <path d={svrLinePath} fill="none" stroke="#F5E328" strokeWidth="2.2" strokeLinecap="round" />

              {eventMarkerX !== null && (
                <line x1={eventMarkerX} y1="0" x2={eventMarkerX} y2={trackHeight} stroke="#00C5FF" strokeWidth="1.2" strokeDasharray="2 2" />
              )}

              {/* Shared Cursor & Dot */}
              <line x1={cursorX} y1="0" x2={cursorX} y2={trackHeight} stroke="#F4F6F7" strokeWidth="1" strokeDasharray="3 3" />
              {svrPoints.length > 0 && <circle cx={cursorX} cy={svrPoints[svrPoints.length - 1].y} r="3.5" fill="#F5E328" stroke="#FFFFFF" strokeWidth="1" />}
            </svg>
          </div>

          <div className="w-[60px] text-right shrink-0">
            <span className="text-[28px] font-black font-mono text-[#F4F6F7] tabular-nums tracking-tight">
              {currentSvr ?? "--"}
            </span>
          </div>
        </div>

        {/* TRACK 4: CI */}
        <div className="h-[76px] flex items-center justify-between">
          <div className="w-[72px] flex items-center justify-between shrink-0 pr-2">
            <div className="leading-tight">
              <div className="text-[14px] font-bold text-[#4AF26F] tracking-tight">CI</div>
              <div className="text-[9px] text-[#AAB4BB] font-mono leading-none">L/min/m²</div>
            </div>
            <div className="flex flex-col justify-between h-[48px] text-right text-[10px] font-mono text-[#AAB4BB] tabular-nums leading-none">
              <span>5.0</span>
              <span>0.0</span>
            </div>
          </div>

          <div className="flex-1 h-full relative overflow-hidden flex items-center">
            <svg
              onClick={handleTrackClick}
              onMouseMove={(e) => handleTrackHover(e, "CI", "L/min/m²", ciPoints, rawCi)}
              onMouseLeave={handleTrackLeave}
              className="w-full h-full cursor-pointer"
              viewBox={`0 0 ${plotWidth} ${trackHeight}`}
              preserveAspectRatio="none"
            >
              <line x1="0" y1="6" x2={plotWidth} y2="6" stroke="rgba(100,170,210,0.08)" strokeWidth="1" />
              <line x1="0" y1={trackHeight - 6} x2={plotWidth} y2={trackHeight - 6} stroke="rgba(100,170,210,0.08)" strokeWidth="1" />

              <path d={ciLinePath} fill="none" stroke="#4AF26F" strokeWidth="2.2" strokeLinecap="round" />

              {eventMarkerX !== null && (
                <line x1={eventMarkerX} y1="0" x2={eventMarkerX} y2={trackHeight} stroke="#00C5FF" strokeWidth="1.2" strokeDasharray="2 2" />
              )}

              <line x1={cursorX} y1="0" x2={cursorX} y2={trackHeight} stroke="#F4F6F7" strokeWidth="1" strokeDasharray="3 3" />
              {ciPoints.length > 0 && <circle cx={cursorX} cy={ciPoints[ciPoints.length - 1].y} r="3.5" fill="#4AF26F" stroke="#FFFFFF" strokeWidth="1" />}
            </svg>
          </div>

          <div className="w-[60px] text-right shrink-0">
            <span className="text-[28px] font-black font-mono text-[#F4F6F7] tabular-nums tracking-tight">
              {currentCi?.toFixed(1) ?? "--"}
            </span>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SHARED TIME AXIS FOOTER                                  */}
      {/* ======================================================== */}
      <div className="flex justify-between text-[11px] font-mono text-[#AAB4BB] px-2 pt-1 border-t border-[rgba(100,170,210,0.32)]">
        {axisLabels.map((label) => <span key={label}>{label}</span>)}
        <span className="text-[#F4F6F7] font-semibold tabular-nums">{cursorTime}</span>
      </div>
    </div>
  );
}
