"use client";

import React, { useEffect, useState } from "react";
import { Minus, Plus, Clock } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { PerioperativePhase } from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";
import { getPerioperativePhaseLabel } from "./phaseLabel";

export interface PerioperativeTimelineProps {
  phases: PerioperativePhase[];
  activePhaseId: string;
  estimatedEndTime: string;
  simulationTime?: number;
  onPhaseSelect?: (phaseId: string) => void;
}

export const PerioperativeTimeline: React.FC<PerioperativeTimelineProps> = ({
  phases,
  activePhaseId,
  estimatedEndTime,
  simulationTime,
  onPhaseSelect,
}) => {
  const { t } = useTranslation("uc01");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string>(activePhaseId);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  useEffect(() => setSelectedPhaseId(activePhaseId), [activePhaseId]);

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 1.75));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.75));
  const handleZoomFit = () => setZoomLevel(1);

  const handleSelectPhase = (phaseId: string) => {
    setSelectedPhaseId(phaseId);
    if (onPhaseSelect) {
      onPhaseSelect(phaseId);
    }
  };

  const selectedPhase = phases.find((p) => p.id === selectedPhaseId);
  const currentPhase = phases.find((p) => p.status === "CURRENT") || phases.find((p) => p.id === activePhaseId);
  const localizedPhaseLabel = (phase: PerioperativePhase) =>
    getPerioperativePhaseLabel(phase.id, phase.label, (key) => t(key));
  const progress = timelineProgress(phases, estimatedEndTime, activePhaseId, simulationTime);
  const milestoneGridStyle = { gridTemplateColumns: `repeat(${Math.max(1, phases.length)}, minmax(0, 1fr))` };

  return (
    <div className="h-[150px] min-h-[150px] bg-[#07131B] border border-[rgba(35,160,220,0.45)] rounded-[2px] px-3.5 py-2.5 flex flex-col justify-between select-none">
      {/* Top Header Row with Clinical Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-[16px] font-semibold text-[#F4F7F8] tracking-wide">
            {t("timeline.title")}
          </h2>
          {selectedPhaseId && selectedPhaseId !== activePhaseId && selectedPhase && (
            <span className="text-[11px] px-2 py-0.5 rounded-[2px] bg-[#0A1822] border border-[rgba(35,160,220,0.45)] text-[#13BDF3] font-mono">
              {t("timeline.viewing", { label: localizedPhaseLabel(selectedPhase) })}
            </span>
          )}
        </div>

        {/* Timeline Toolbar */}
        <div className="flex items-center space-x-2">
          {/* Zoom controls using compact workstation buttons */}
          <div className="flex items-center space-x-1">
            <Button
              variant="workstation"
              size="icon"
              onClick={handleZoomOut}
              title={t("timeline.zoomOut")}
            >
              <Minus className="w-3 h-3 text-[#A7B2B9]" />
            </Button>
            <Button
              variant="workstation"
              size="icon"
              onClick={handleZoomIn}
              title={t("timeline.zoomIn")}
            >
              <Plus className="w-3 h-3 text-[#A7B2B9]" />
            </Button>
            <Button
              variant="workstation"
              size="xs"
              onClick={handleZoomFit}
              title={t("timeline.resetZoom")}
            >
              {t("timeline.fit")}
            </Button>
          </div>

          {/* Estimated End Time Container */}
          <div className="flex items-center space-x-1.5 bg-[#0A1822] border border-[rgba(35,160,220,0.45)] px-2.5 h-6 rounded-[2px]">
            <Clock className="w-3 h-3 text-[#A7B2B9]" />
            <span className="text-[11.5px] text-[#A7B2B9]">{t("timeline.estimatedEnd")}</span>
            <span className="text-[12px] font-bold text-[#F4F7F8] font-mono tabular-nums">
              {estimatedEndTime}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Timeline Track */}
      <div
        className="relative flex flex-col pt-1 transition-transform origin-left"
        style={{ transform: `scale(${zoomLevel})` }}
      >
        {/* Row 1: Timestamps */}
        <div className="grid gap-2 mb-1 text-center" style={milestoneGridStyle}>
          {phases.map((phase) => {
            const isCurrent = phase.status === "CURRENT";
            const isCompleted = phase.status === "COMPLETED";

            return (
              <div key={phase.id} className="flex justify-center items-center">
                {isCurrent ? (
                  <div className="relative">
                    <span className="text-[12px] font-mono tabular-nums font-bold text-[#31E874] bg-[#0A1822] px-2 py-[1px] rounded-[2px] border border-[#31E874]">
                      {phase.startTime}
                    </span>
                  </div>
                ) : (
                  <span
                    className={`text-[12px] font-mono tabular-nums ${
                      isCompleted ? "text-[#F4F7F8]" : "text-[#A7B2B9]"
                    }`}
                  >
                    {phase.startTime}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Row 2: Connecting Line, Current-Time Marker & Milestone Dots */}
        <div className="relative w-full h-3 flex items-center mb-1.5">
          {/* Base track: cyan line connecting all milestones */}
          <div className="absolute left-[5%] right-[5%] h-[2px] bg-[#13BDF3]" />

          {/* Simulation cursor follows case-relative time across the full timeline. */}
          <div className="absolute -top-1.5 bottom-[-10px] w-[1px] pointer-events-none z-20 flex flex-col items-center" style={{ left: `${5 + progress * 90}%` }}>
            <div className="w-1.5 h-1.5 bg-[#31E874] rounded-full ring-2 ring-[#31E874]/50 animate-pulse" />
            <div className="w-[1px] h-full bg-[#31E874]" />
          </div>

          {/* 10 Milestone Dots */}
          <div className="grid w-full relative z-10" style={milestoneGridStyle}>
            {phases.map((phase) => {
              const isCurrent = phase.status === "CURRENT";

              return (
                <div key={phase.id} className="flex justify-center items-center">
                  <div
                    className={`w-2 h-2 rounded-full transition-transform ${
                      isCurrent
                        ? "bg-[#31E874] ring-2 ring-[#31E874]/60 scale-125"
                        : "bg-[#13BDF3]"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 3: Milestone Phase Cards with Tooltips & Selection */}
        <div className="grid gap-2" style={milestoneGridStyle}>
          {phases.map((phase) => {
            const isCurrent = phase.status === "CURRENT";
            const isCompleted = phase.status === "COMPLETED";
            const isSelected = selectedPhaseId === phase.id;

            // Tooltip clinical content
            const tooltipContent = (
              <div className="flex flex-col space-y-1 text-left min-w-[190px]">
                <div className="flex items-center justify-between border-b border-[rgba(35,160,220,0.3)] pb-1">
                  <span className="font-semibold text-[#F4F7F8] text-[12.5px]">
                    {localizedPhaseLabel(phase)}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-[2px] font-mono ${
                      isCurrent
                        ? "bg-[#31E874]/20 text-[#31E874] border border-[#31E874]/40"
                        : isCompleted
                        ? "bg-[#13BDF3]/20 text-[#13BDF3] border border-[#13BDF3]/40"
                        : "bg-[#0A1822] text-[#A7B2B9] border border-[rgba(35,160,220,0.3)]"
                    }`}
                  >
                    {phase.status}
                  </span>
                </div>
                <div className="grid grid-cols-[65px_1fr] text-[11px] gap-0.5">
                  <span className="text-[#A7B2B9]">{t("timeline.startTime")}</span>
                  <span className="font-mono text-[#F4F7F8] font-medium">
                    {phase.startTime}
                  </span>
                  <span className="text-[#A7B2B9]">{t("timeline.source")}</span>
                  <span className="text-[#F4F7F8] truncate">{phase.source ?? "System"}</span>
                </div>
                {phase.details && (
                  <div className="text-[10.5px] text-[#A7B2B9] pt-0.5 border-t border-[rgba(35,160,220,0.15)] leading-tight">
                    {phase.details}
                  </div>
                )}
                {isSelected && !isCurrent && (
                  <div className="text-[10px] text-[#13BDF3] font-mono italic">
                    (Inspecting context — Clinical phase is {currentPhase ? localizedPhaseLabel(currentPhase) : t("timeline.phases.induction")})
                  </div>
                )}
              </div>
            );

            return (
              <div key={phase.id} className="w-full">
                <Tooltip content={tooltipContent} position="bottom" delayMs={100}>
                  <button
                    onClick={() => handleSelectPhase(phase.id)}
                    className={`w-full h-[42px] px-1 py-1 rounded-[2px] flex items-center justify-center text-center transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-[#081B15] border-2 border-[#31E874] text-[#F4F7F8] font-bold text-[12.5px]"
                        : phase.id === "inor"
                        ? "bg-[#13BDF3] border border-[#13BDF3] text-[#F4F7F8] font-semibold text-[12px]"
                        : isCompleted
                        ? "bg-[#0A1822] border border-[rgba(35,160,220,0.45)] text-[#F4F7F8] font-medium text-[12px]"
                        : "bg-[#0A1822] border border-[rgba(35,160,220,0.25)] text-[#A7B2B9] text-[12px]"
                    } ${
                      isSelected && !isCurrent
                        ? "ring-2 ring-[#13BDF3] border-[#13BDF3]"
                        : ""
                    }`}
                  >
                    <span className="min-w-0 whitespace-normal break-words leading-tight px-0.5">
                      {localizedPhaseLabel(phase)}
                    </span>
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function timelineProgress(
  phases: PerioperativePhase[],
  estimatedEndTime: string,
  activePhaseId: string,
  simulationTime?: number
): number {
  const parseMinutes = (value: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value.trim());
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const period = match[3]?.toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };
  const start = parseMinutes(phases[0]?.startTime ?? "") ?? 0;
  const end = parseMinutes(estimatedEndTime) ?? start + 300;
  const activeStart = parseMinutes(phases.find((phase) => phase.id === activePhaseId)?.startTime ?? "") ?? start;
  const cursor = simulationTime === undefined ? activeStart : start + simulationTime / 60_000;
  return Math.max(0, Math.min(1, (cursor - start) / Math.max(1, end - start)));
}
