"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Clock,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";
import { ClinicalEvent, EventTrackId } from "@/types/uc02";

interface TrackConfig {
  id: EventTrackId;
  nameKey: string;
  subTitleKey: string;
  yPercent: number;
  heightPercent: number;
  accentColor: string;
}

const TRACK_CONFIGS: TrackConfig[] = [
  {
    id: "physiology",
    nameKey: "physiology.name",
    subTitleKey: "physiology.subtitle",
    yPercent: 4,
    heightPercent: 13,
    accentColor: "var(--safe-cyan, #00E5FF)",
  },
  {
    id: "medication",
    nameKey: "medication.name",
    subTitleKey: "medication.subtitle",
    yPercent: 20,
    heightPercent: 13,
    accentColor: "var(--safe-blue, #2563EB)",
  },
  {
    id: "airway_procedure",
    nameKey: "airwayProcedure.name",
    subTitleKey: "airwayProcedure.subtitle",
    yPercent: 36,
    heightPercent: 13,
    accentColor: "var(--safe-green, #22C55E)",
  },
  {
    id: "ventilation",
    nameKey: "ventilation.name",
    subTitleKey: "ventilation.subtitle",
    yPercent: 52,
    heightPercent: 13,
    accentColor: "var(--safe-cyan, #00E5FF)",
  },
  {
    id: "fluid_blood",
    nameKey: "fluidBlood.name",
    subTitleKey: "fluidBlood.subtitle",
    yPercent: 68,
    heightPercent: 13,
    accentColor: "var(--safe-green, #22C55E)",
  },
  {
    id: "data_quality",
    nameKey: "dataQuality.name",
    subTitleKey: "dataQuality.subtitle",
    yPercent: 84,
    heightPercent: 13,
    accentColor: "var(--safe-yellow, #EAB308)",
  },
];

export function ClinicalTimeline() {
  const {
    events,
    selectedEventId,
    selectEvent,
    selectedTime,
    selectTime,
    hoveredEvent,
    setHoveredEvent,
    linkedEventIds,
    timelineStartTime,
    timelineDurationMs,
    timelineTrackValues,
  } = useClinicalReview();

  const { t } = useTranslation("uc02");
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const zoomWindow = t("timeline.zoomWindow");
  const svgRef = useRef<SVGSVGElement>(null);
  const [hiddenLabelIds, setHiddenLabelIds] = useState<Set<string>>(() => new Set());
  // Start with a conservative interval so the first hydrated frame never
  // paints all 15-minute labels into a narrow plot before ResizeObserver runs.
  const [axisLabelStep, setAxisLabelStep] = useState(3);
  const timelineMinutes = Math.max(1, timelineDurationMs / 60_000);
  const timeTicks = React.useMemo(
    () => Array.from({ length: Math.floor(timelineMinutes / 15) + 1 }, (_, index) =>
      addMinutes(timelineStartTime, Math.min(index * 15, timelineMinutes)),
    ),
    [timelineMinutes, timelineStartTime],
  );
  const timelineTimeToX = React.useCallback((time: string) =>
    timeToTimelineX(time, timelineStartTime, timelineMinutes),
  [timelineStartTime, timelineMinutes]);
  const timelineEndTime = addMinutes(timelineStartTime, timelineMinutes);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const updateLabelVisibility = () => {
      const svgBounds = svg.getBoundingClientRect();
      const maxLabelCount = Math.max(2, Math.floor(svgBounds.width / 38) + 1);
      const nextAxisLabelStep = Math.max(
        1,
        Math.ceil(Math.max(1, timeTicks.length - 1) / (maxLabelCount - 1)),
      );
      setAxisLabelStep((current) => current === nextAxisLabelStep ? current : nextAxisLabelStep);
      const labels = Array.from(svg.querySelectorAll<SVGTextElement>("text[data-event-id]"))
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          const track = element.closest<SVGGElement>("[data-track-id]")?.dataset.trackId;
          return {
            id: element.dataset.eventId ?? "",
            track,
            bounds,
            priority: element.dataset.selected === "true" ? 2 : element.dataset.linked === "true" ? 1 : 0,
          };
        })
        .filter((label) => label.id && label.track && label.bounds.width > 0);

      const labelsByTrack = new Map<string, typeof labels>();
      for (const label of labels) {
        const group = labelsByTrack.get(label.track!) ?? [];
        group.push(label);
        labelsByTrack.set(label.track!, group);
      }

      const hidden = new Set<string>();
      for (const trackLabels of labelsByTrack.values()) {
        const placed: typeof labels = [];
        const ordered = [...trackLabels].sort(
          (a, b) => b.priority - a.priority || a.bounds.left - b.bounds.left,
        );

        for (const label of ordered) {
          const clipped = label.bounds.left < svgBounds.left || label.bounds.right > svgBounds.right;
          const collides = placed.some(
            (other) => label.bounds.left < other.bounds.right + 3 && label.bounds.right + 3 > other.bounds.left,
          );
          if (clipped || collides) hidden.add(label.id);
          else placed.push(label);
        }
      }

      setHiddenLabelIds((current) => {
        if (current.size === hidden.size && [...current].every((id) => hidden.has(id))) return current;
        return hidden;
      });
    };

    const frame = window.requestAnimationFrame(updateLabelVisibility);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLabelVisibility) : null;
    observer?.observe(svg);
    window.addEventListener("resize", updateLabelVisibility);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateLabelVisibility);
    };
  }, [events, linkedEventIds, selectedEventId, timeTicks.length]);

  // Group events by track
  const eventsByTrack = React.useMemo(() => {
    const map = new Map<EventTrackId, ClinicalEvent[]>();
    for (const track of TRACK_CONFIGS) {
      map.set(track.id, []);
    }
    for (const evt of events) {
      const arr = map.get(evt.trackId);
      if (arr) arr.push(evt);
    }
    return map;
  }, [events]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    selectTime(addMinutes(timelineStartTime, pct * timelineMinutes));
  };

  const scrubberPercent = React.useMemo(() => {
    return timelineTimeToX(selectedTime.split(" ")[0]);
  }, [selectedTime, timelineTimeToX]);

  return (
    <div className="flex-1 bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between overflow-hidden relative select-none">
      {/* 1. Header & Controls Toolbar */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 pb-1.5 border-b border-safe-border">
        <div className="flex min-w-[200px] flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <Layers className="w-4 h-4 text-safe-cyan" />
          <h2 className="text-[14px] font-semibold text-safe-text tracking-tight">
            {t("timeline.title")}
          </h2>
          <span className="text-[10px] font-mono text-safe-text-muted whitespace-normal">
            {t("timeline.sub")}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {/* Causal Link Safeguard Notice */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-safe-surface-secondary border border-safe-yellow/40 text-safe-yellow text-[10px] font-mono"
            title={t("timeline.causalHelp")}
          >
            <AlertTriangle className="w-3 h-3 text-safe-yellow" />
            <span>{t("timeline.causalWarning")}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-safe-surface-secondary border border-safe-border text-[11px] text-safe-text">
            <span title={zoomWindow}>{timelineStartTime} – {timelineEndTime}</span>
            <ChevronDown className="w-3 h-3 text-safe-text-muted" />
          </div>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-safe-surface-secondary border border-safe-green/50 text-safe-green text-[10px] font-medium font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-safe-green" />
            <span>{t("timeline.audited")}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono text-safe-text bg-safe-bg px-2 py-0.5 rounded-[2px] border border-safe-border tabular-nums">
            <Clock className="w-3 h-3 text-safe-cyan" />
            <span>{t("timeline.scrubber", { time: selectedTime })}</span>
          </div>
        </div>
      </div>

      {/* 2. Multi-Track Custom SVG Body */}
      <div className="relative flex-1 my-1 flex overflow-hidden">
        {/* Left Track Headers Column (~135px width) */}
        <div className="w-[135px] shrink-0 flex flex-col justify-between py-1 pr-2 text-right border-r border-safe-border">
          {TRACK_CONFIGS.map((track) => (
            <div
              key={track.id}
              className="flex flex-col justify-center h-[16.6%] border-b border-safe-border-light/40 last:border-b-0"
            >
              <span className="text-[11px] font-semibold text-safe-text whitespace-normal break-words leading-tight" title={t(`timeline.tracks.${track.nameKey}`)}>
                {t(`timeline.tracks.${track.nameKey}`)}
              </span>
              <span className="text-[8.5px] text-safe-text-muted font-mono whitespace-normal break-words leading-tight" title={t(`timeline.tracks.${track.subTitleKey}`)}>
                {t(`timeline.tracks.${track.subTitleKey}`)}
              </span>
            </div>
          ))}
        </div>

        {/* Center SVG Timeline Visualization Area */}
        <div className="relative flex-1 h-full px-2">
          <svg
            ref={svgRef}
            className="w-full h-full cursor-crosshair"
            preserveAspectRatio="none"
            onClick={handleSvgClick}
          >
            <defs>
              {/* Clinical Grid Pattern */}
              <pattern
                id="clinical-timeline-grid"
                width={`${100 / Math.max(1, timeTicks.length - 1)}%`}
                height="16.66%"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 1000 0 L 0 0 0 1000"
                  fill="none"
                  stroke="rgba(45, 155, 215, 0.12)"
                  strokeWidth="0.8"
                />
              </pattern>

              {/* Hatched Pattern for Data-Quality Issues */}
              <pattern
                id="hatched-qc-pattern"
                width="8"
                height="8"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="#EF4444"
                  strokeWidth="2.5"
                  strokeOpacity="0.8"
                />
              </pattern>

              <pattern
                id="hatched-warning-pattern"
                width="8"
                height="8"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="#EAB308"
                  strokeWidth="2.5"
                  strokeOpacity="0.8"
                />
              </pattern>
            </defs>

            {/* Grid Background */}
            <rect
              width="100%"
              height="100%"
              fill="url(#clinical-timeline-grid)"
            />

            {/* Track Horizontal Baseline Dividers */}
            {[1, 2, 3, 4, 5].map((idx) => (
              <line
                key={idx}
                x1="0"
                y1={`${idx * 16.66}%`}
                x2="100%"
                y2={`${idx * 16.66}%`}
                stroke="rgba(45, 155, 215, 0.22)"
                strokeWidth="0.8"
              />
            ))}

            {/* Vertical 15-Minute Grid Lines */}
            {timeTicks.map((tick) => {
              const xPos = timelineTimeToX(tick);
              return (
                <line
                  key={tick}
                  x1={`${xPos}%`}
                  y1="0"
                  x2={`${xPos}%`}
                  y2="100%"
                  stroke="rgba(45, 155, 215, 0.15)"
                  strokeWidth="0.8"
                  strokeDasharray="2,3"
                />
              );
            })}

            {/* Render Events for Each Track using exact shared timeToX coordinate system */}
            {TRACK_CONFIGS.map((track, trackIdx) => {
              const trackEvents = eventsByTrack.get(track.id) || [];
              const trackBaseY = trackIdx * 16.66;

              return (
                <g key={track.id} data-track-id={track.id}>
                  {trackEvents.map((evt) => {
                    const startX = timelineTimeToX(evt.startTime);
                    const isSelected = selectedEventId === evt.id;
                    const isLinked = linkedEventIds.includes(evt.id);
                    const eventDisplayName = evt.name || evt.type;

                    // 1. Point Marker (Airway/Procedure, Ventilation titration)
                    if (evt.visualType === "point_marker") {
                      const cxPct = startX;
                      const cyPct = trackBaseY + 8.33;

                      return (
                        <g
                          key={evt.id}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEvent(evt.id);
                          }}
                          onMouseEnter={(e) => {
                            setHoveredEvent(evt);
                            setTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          {/* Claim-linked highlight halo */}
                          {(isSelected || isLinked) && (
                            <circle
                              cx={`${cxPct}%`}
                              cy={`${cyPct}%`}
                              r={isSelected ? "9" : "7.5"}
                              fill="none"
                              stroke="#00E5FF"
                              strokeWidth={isSelected ? "2" : "1.5"}
                              strokeDasharray={isLinked && !isSelected ? "3,2" : "none"}
                            />
                          )}
                          <circle
                            cx={`${cxPct}%`}
                            cy={`${cyPct}%`}
                            r={isSelected ? "5" : "4"}
                            fill={evt.semanticColor}
                            stroke="#02080C"
                            strokeWidth="1"
                          />
                          <text
                            data-event-id={evt.id}
                            data-selected={isSelected}
                            data-linked={isLinked}
                            visibility={hiddenLabelIds.has(evt.id) ? "hidden" : "visible"}
                            x={`${cxPct + 0.8}%`}
                            y={`${cyPct + 4}%`}
                            fill="#F4F7F8"
                            fontSize="8.5"
                            fontFamily="monospace"
                            className="pointer-events-none select-none"
                          >
                            {eventDisplayName.split(" ")[0]}
                          </text>
                        </g>
                      );
                    }

                    // 2. Medication Bolus (Diamond Marker)
                    if (evt.visualType === "med_bolus") {
                      const cxPct = startX;
                      const cyPct = trackBaseY + 8.33;
                      const dSize = isSelected ? 6 : 5;

                      return (
                        <g
                          key={evt.id}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEvent(evt.id);
                          }}
                          onMouseEnter={(e) => {
                            setHoveredEvent(evt);
                            setTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          {(isSelected || isLinked) && (
                            <circle
                              cx={`${cxPct}%`}
                              cy={`${cyPct}%`}
                              r="9"
                              fill="none"
                              stroke="#00E5FF"
                              strokeWidth={isSelected ? "2" : "1.5"}
                              strokeDasharray={isLinked && !isSelected ? "3,2" : "none"}
                            />
                          )}
                          {/* Diamond polygon */}
                          <polygon
                            points={`0,-${dSize} ${dSize},0 0,${dSize} -${dSize},0`}
                            fill={evt.semanticColor}
                            stroke="#02080C"
                            strokeWidth="1"
                            style={{
                              transform: `translate(${cxPct}%, ${cyPct}%)`,
                            }}
                          />
                          <text
                            data-event-id={evt.id}
                            data-selected={isSelected}
                            data-linked={isLinked}
                            visibility={hiddenLabelIds.has(evt.id) ? "hidden" : "visible"}
                            x={`${cxPct + 1}%`}
                            y={`${cyPct + 3.5}%`}
                            fill="#F4F7F8"
                            fontSize="8.5"
                            fontFamily="monospace"
                            className="pointer-events-none select-none font-semibold"
                          >
                            {evt.doseOrValue || eventDisplayName}
                          </text>
                        </g>
                      );
                    }

                    // 3. Continuous Infusion (Horizontal Line with endpoints)
                    if (evt.visualType === "infusion") {
                      const endX = evt.endTime ? timelineTimeToX(evt.endTime) : 100;
                      const lineY = trackBaseY + 8.33;

                      return (
                        <g
                          key={evt.id}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEvent(evt.id);
                          }}
                          onMouseEnter={(e) => {
                            setHoveredEvent(evt);
                            setTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          <line
                            x1={`${startX}%`}
                            y1={`${lineY}%`}
                            x2={`${endX}%`}
                            y2={`${lineY}%`}
                            stroke={isSelected || isLinked ? "#00E5FF" : evt.semanticColor}
                            strokeWidth={isSelected ? "3.5" : "2.5"}
                          />
                          <circle
                            cx={`${startX}%`}
                            cy={`${lineY}%`}
                            r="3"
                            fill={evt.semanticColor}
                          />
                          <circle
                            cx={`${endX}%`}
                            cy={`${lineY}%`}
                            r="3"
                            fill={evt.semanticColor}
                          />
                          <text
                            data-event-id={evt.id}
                            data-selected={isSelected}
                            data-linked={isLinked}
                            visibility={hiddenLabelIds.has(evt.id) ? "hidden" : "visible"}
                            x={`${startX + 1}%`}
                            y={`${lineY - 2.5}%`}
                            fill="#F4F7F8"
                            fontSize="8"
                            fontFamily="monospace"
                            className="pointer-events-none select-none font-semibold"
                          >
                            {eventDisplayName} ({evt.doseOrValue})
                          </text>
                        </g>
                      );
                    }

                    // 4. Interval Event / Clinical Episode (Semi-transparent Horizontal Band)
                    if (evt.visualType === "interval_band") {
                      const endX = evt.endTime ? timelineTimeToX(evt.endTime) : startX + 5;
                      const widthPct = Math.max(1.5, endX - startX);
                      const bandY = trackBaseY + 2.5;
                      const bandHeight = 11.5;

                      return (
                        <g
                          key={evt.id}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEvent(evt.id);
                          }}
                          onMouseEnter={(e) => {
                            setHoveredEvent(evt);
                            setTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          <rect
                            x={`${startX}%`}
                            y={`${bandY}%`}
                            width={`${widthPct}%`}
                            height={`${bandHeight}%`}
                            rx="2"
                            fill={evt.semanticColor}
                            fillOpacity={isSelected || isLinked ? "0.45" : "0.22"}
                            stroke={isSelected || isLinked ? "#00E5FF" : evt.semanticColor}
                            strokeWidth={isSelected ? "2" : isLinked ? "1.5" : "1"}
                            strokeDasharray={isLinked && !isSelected ? "3,2" : "none"}
                          />
                          <text
                            data-event-id={evt.id}
                            data-selected={isSelected}
                            data-linked={isLinked}
                            visibility={hiddenLabelIds.has(evt.id) ? "hidden" : "visible"}
                            x={`${startX + 0.8}%`}
                            y={`${bandY + 8}%`}
                            fill="#F4F7F8"
                            fontSize="8.5"
                            fontFamily="monospace"
                            className="pointer-events-none select-none font-semibold"
                          >
                            {eventDisplayName}
                          </text>
                        </g>
                      );
                    }

                    // 5. Data Quality Issue (Hatched Region)
                    if (evt.visualType === "data_quality_hatched") {
                      const endX = evt.endTime ? timelineTimeToX(evt.endTime) : startX + 4;
                      const widthPct = Math.max(2, endX - startX);
                      const bandY = trackBaseY + 2.5;
                      const bandHeight = 11.5;

                      return (
                        <g
                          key={evt.id}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEvent(evt.id);
                          }}
                          onMouseEnter={(e) => {
                            setHoveredEvent(evt);
                            setTooltipPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                        >
                          <rect
                            x={`${startX}%`}
                            y={`${bandY}%`}
                            width={`${widthPct}%`}
                            height={`${bandHeight}%`}
                            rx="1"
                            fill={
                              evt.quality === "DISCONNECT"
                                ? "url(#hatched-qc-pattern)"
                                : "url(#hatched-warning-pattern)"
                            }
                            stroke={isSelected || isLinked ? "#00E5FF" : evt.semanticColor}
                            strokeWidth={isSelected ? "2" : "1"}
                          />
                          <text
                            data-event-id={evt.id}
                            data-selected={isSelected}
                            data-linked={isLinked}
                            visibility={hiddenLabelIds.has(evt.id) ? "hidden" : "visible"}
                            x={`${startX + 0.5}%`}
                            y={`${bandY + 8}%`}
                            fill="#F4F7F8"
                            fontSize="8"
                            fontFamily="monospace"
                            className="pointer-events-none select-none font-bold bg-[#02080C]"
                          >
                            [{evt.quality || "QC"}] {eventDisplayName.split(" ")[0]}
                          </text>
                        </g>
                      );
                    }

                    return null;
                  })}
                </g>
              );
            })}

            {/* Vertical Inspection Scrubber Crosshair */}
            <line
              x1={`${scrubberPercent}%`}
              y1="0"
              x2={`${scrubberPercent}%`}
              y2="100%"
              stroke="#00E5FF"
              strokeWidth="1.5"
              strokeDasharray="3,3"
            />
          </svg>

          {/* Time Scrubber Timestamp Pin Indicator */}
          <div
            className="absolute bottom-0 transform -translate-x-1/2 bg-safe-surface text-safe-cyan border border-safe-cyan rounded-[2px] px-1.5 py-0.2 text-[9.5px] font-mono tabular-nums pointer-events-none z-10"
            style={{ left: `${scrubberPercent}%` }}
          >
            {selectedTime}
          </div>
        </div>

        {/* Right Current Track Telemetry Column (~80px width) */}
        <div className="w-[96px] shrink-0 flex flex-col justify-between py-1 pl-2 text-right border-l border-safe-border font-mono">
          {TRACK_CONFIGS.map((track) => {
            const trackValue = timelineTrackValues[track.id];
            return (
            <div
              key={track.id}
              className="flex flex-col justify-center h-[16.6%] border-b border-safe-border-light/40 last:border-b-0"
            >
              <span className="text-[12px] font-bold text-safe-text tabular-nums leading-tight">
                {trackValue?.value ?? "—"}
              </span>
              <span
                className="text-[8px] leading-tight whitespace-normal break-words"
                style={{ color: track.accentColor }}
              >
                {trackValue?.status ?? "UNKNOWN"}
              </span>
            </div>
            );
          })}
        </div>
      </div>

      {/* Shared case-clock ticks are derived from the current canonical timeline window. */}
      <div className="flex min-w-0 items-center text-[10px] font-mono text-safe-text-muted pt-1 border-t border-safe-border tabular-nums select-none">
        <div className="w-[135px] shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 px-2 flex justify-between">
          {timeTicks.filter((_, index) => index % axisLabelStep === 0 || index === timeTicks.length - 1).map((tick) => (
            <button
              type="button"
              key={tick}
              className={`whitespace-nowrap cursor-pointer hover:text-safe-text transition-colors ${
                tick === selectedTime ? "text-safe-cyan font-semibold" : ""
              }`}
              onClick={() => selectTime(tick)}
            >
              {tick}
            </button>
          ))}
        </div>
        <div className="w-[96px] shrink-0" aria-hidden="true" />
      </div>

      {/* 4. Hover Detail Tooltip Overlay */}
      {hoveredEvent && tooltipPos && (
        <div
          className="fixed z-50 bg-safe-surface border border-safe-cyan/80 p-2.5 rounded-[2px] text-[11px] max-w-[280px] pointer-events-none select-none font-sans shadow-xl"
          style={{
            left: `${tooltipPos.x + 12}px`,
            top: `${tooltipPos.y + 12}px`,
          }}
        >
          <div className="flex items-center justify-between border-b border-safe-border-light pb-1 mb-1.5">
            <span className="font-bold text-safe-text truncate">
              {hoveredEvent.name || hoveredEvent.type}
            </span>
            <span className="text-[10px] font-mono text-safe-cyan bg-safe-surface-secondary px-1 py-0.2 rounded-[2px]">
              {hoveredEvent.startTime}
              {hoveredEvent.endTime ? `–${hoveredEvent.endTime}` : ""}
            </span>
          </div>

          <div className="space-y-1 font-mono text-[10px]">
            {hoveredEvent.subText && (
              <div className="text-safe-text-muted">{hoveredEvent.subText}</div>
            )}
            {hoveredEvent.doseOrValue && (
              <div className="text-safe-text">
                {t("timeline.valueDose")} <strong className="text-safe-green">{hoveredEvent.doseOrValue}</strong>
              </div>
            )}
            {hoveredEvent.sourceDevice && (
              <div className="text-safe-text-muted text-[9.5px]">
                {t("timeline.device")}: {hoveredEvent.sourceDevice}
              </div>
            )}
            {hoveredEvent.notes && (
              <div className="text-safe-text-muted text-[9px] italic border-t border-safe-border-light/40 pt-1">
                {hoveredEvent.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function addMinutes(startTime: string, minutes: number): string {
  const start = toMinuteOfDay(startTime);
  const normalized = (start + Math.round(minutes)) % (24 * 60);
  const safeValue = normalized < 0 ? normalized + 24 * 60 : normalized;
  return `${Math.floor(safeValue / 60).toString().padStart(2, "0")}:${(safeValue % 60).toString().padStart(2, "0")}`;
}

function timeToTimelineX(time: string, startTime: string, totalMinutes: number): number {
  const offset = toMinuteOfDay(time) - toMinuteOfDay(startTime);
  const wrappedOffset = offset < -720 ? offset + 24 * 60 : offset > 720 ? offset - 24 * 60 : offset;
  return Math.max(0, Math.min(100, (wrappedOffset / Math.max(1, totalMinutes)) * 100));
}

function toMinuteOfDay(time: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}
