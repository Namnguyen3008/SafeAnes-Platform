"use client";

import React from "react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";
import { formatCaseTime } from "@/simulation/formatTime";

export function MedicationTimelinePanel() {
  const { t } = useTranslation("uc03");
  const {
    selectedMedId,
    handleSelectMedication,
    currentTimeCursor,
    simulationSnapshot,
    timelineEvents,
    medications,
  } = useMedication();

  const duration = Math.max(1, simulationSnapshot.encounter.scheduledDurationMs);
  const caseStart = formatCaseTime(simulationSnapshot.encounter.startedAt, 0);
  const caseEnd = formatCaseTime(simulationSnapshot.encounter.startedAt, duration);
  const cursorPercent = Math.max(0, Math.min(100, (simulationSnapshot.simulationTime / duration) * 100));
  const visibleMedications = medications.filter((medication) =>
    timelineEvents.some((event) => event.medicationId === medication.id)
  );
  const timelineRows = visibleMedications.map((medication) => ({
    medication,
    events: timelineEvents.filter((event) => event.medicationId === medication.id),
  }));
  const tickCount = 5;

  return (
    <div className="bg-[#07121A] border border-[rgba(50,150,205,0.40)] rounded-[2px] flex flex-col h-full min-h-0 select-none">
      <div className="min-h-8 px-3 py-1 bg-[#0A1720] border-b border-[rgba(50,150,205,0.40)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
          <span className="font-semibold text-[14px] tracking-wide text-[#F3F6F7]">{t("alerts.medicationTimeline")}</span>
          <span className="text-[10px] text-[#A6B0B8] font-mono tabular-nums">{caseStart} – {caseEnd}</span>
        </div>
        <span className="text-[9px] font-bold tracking-wide text-[#FFD828]">{t("simulation.demoOnly")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-[#02080C]">
        <div className="min-w-[900px]">
          <div className="h-7 flex items-stretch border-b border-[rgba(50,150,205,0.25)] bg-[#02080C] text-[10px] text-[#A6B0B8] font-mono tabular-nums">
            <div className="w-48 shrink-0 border-r border-[rgba(50,150,205,0.30)] px-3 flex items-center">{t("table.drug")}</div>
            <div className="flex-1 relative min-w-0">
              {Array.from({ length: tickCount + 1 }, (_, index) => {
                const percent = (index / tickCount) * 100;
                const tickTime = formatCaseTime(simulationSnapshot.encounter.startedAt, duration * index / tickCount);
                return (
                  <span
                    key={index}
                    className="absolute top-0 bottom-0 flex items-center whitespace-nowrap"
                    style={{ left: `${percent}%`, transform: index === 0 ? "translateX(3px)" : index === tickCount ? "translateX(-100%)" : "translateX(-50%)" }}
                  >
                    {tickTime.slice(0, 5)}
                  </span>
                );
              })}
            </div>
          </div>

          {timelineRows.length === 0 ? (
            <div className="p-3 text-[11px] text-[#A6B0B8]">{t("simulation.noCanonicalEvidence")}</div>
          ) : timelineRows.map(({ medication, events }) => {
            const color = medication.colorBar?.match(/#[\da-fA-F]{6}/)?.[0] ?? "#19BDF2";
            return (
              <div key={medication.id} className="h-9 flex border-b border-[rgba(50,150,205,0.18)]">
                <button
                  type="button"
                  onClick={() => handleSelectMedication(medication.id)}
                  className={`w-48 shrink-0 min-w-0 px-3 flex items-center gap-2 border-r border-[rgba(50,150,205,0.25)] text-left ${selectedMedId === medication.id ? "bg-[#093552]" : "hover:bg-[#0A1720]"}`}
                >
                  <span className="w-1.5 h-4 shrink-0" style={{ backgroundColor: color }} />
                  <span className="min-w-0 truncate text-[11px] font-semibold text-[#F3F6F7]" title={medication.name}>{medication.name}</span>
                </button>
                <div className="flex-1 min-w-0 relative">
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-[rgba(50,150,205,0.24)]" />
                  {Array.from({ length: tickCount - 1 }, (_, index) => <span key={`grid-${index}`} className="absolute top-0 bottom-0 border-l border-[rgba(50,150,205,0.12)]" style={{ left: `${((index + 1) / tickCount) * 100}%` }} />)}
                  {events.map((event) => {
                    const percent = Math.max(0, Math.min(100, ((event.eventTime ?? 0) / duration) * 100));
                    const detail = [event.label ?? medication.name, event.value !== undefined ? `${event.value} ${event.unit ?? ""}`.trim() : "", event.eventType.replaceAll("_", " ")].filter(Boolean).join(" · ");
                    const eventTime = formatCaseTime(simulationSnapshot.encounter.startedAt, event.eventTime ?? 0);
                    return <span key={event.id} title={`${eventTime} · ${detail}`} aria-label={`${eventTime} · ${detail}`} className="absolute top-1/2 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#02080C] ring-1 ring-[#F3F6F7]/60" style={{ left: `${percent}%`, backgroundColor: color }} />;
                  })}
                  <span className="absolute top-0 bottom-0 z-[2] border-l border-dashed border-white/70" style={{ left: `${cursorPercent}%` }} title={currentTimeCursor} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-h-7 px-3 py-1 border-t border-[rgba(50,150,205,0.25)] flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[#A6B0B8] shrink-0">
        <span className="font-mono text-[#F3F6F7]">{currentTimeCursor}</span>
        <span>{timelineEvents.length} {t("simulation.canonicalEvidence").toLowerCase()}</span>
        <span className="text-[#FFD828]">{t("simulation.notForClinicalUse")}</span>
      </div>
    </div>
  );
}
