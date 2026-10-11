"use client";

import React from "react";
import { Bell } from "lucide-react";
import { RespiratoryEvent } from "@/types/uc05";
import { useTrendSync } from "@/context/RespiratoryContext";
import { SeverityBadge } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

export interface AlarmReviewTableProps {
  events: RespiratoryEvent[];
}

export function AlarmReviewTable({
  events,
}: AlarmReviewTableProps) {
  const { t } = useTranslation("uc05");
  const { t: tCommon } = useTranslation("common");
  const { setSelectedAlarm, setHighlightedEventId, selectedAlarm, caseData } = useTrendSync();
  const isVitalDb = caseData.sourceMode === "VITALDB_REPLAY";

  const handleRowClick = (item: RespiratoryEvent) => {
    setHighlightedEventId(item.id);
    setSelectedAlarm(item);
  };

  return (
    <section className="flex-1 min-w-0 min-h-0 bg-safe-surface border border-safe-border flex flex-col p-2 rounded-sm select-none shadow-none">
      {/* Table Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-safe-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-safe-text" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-safe-text leading-none">
            {isVitalDb ? t("vitalDb.reviewTitle") : t("alarms.title")}{" "}
            <span className="text-xs text-safe-text-muted font-normal lowercase">
              {t("alarms.recentSubtitle")}
            </span>
          </h2>
        </div>
        <button className="px-2 py-0.5 text-[11px] font-mono text-safe-text bg-safe-surface-secondary hover:bg-safe-surface-elevated border border-safe-border-light rounded-sm cursor-pointer">
          {t("alarms.viewAll", { count: events.length })}
        </button>
      </div>

      {/* Table Content */}
      <div className="clinical-table-scroll clinical-table-sticky flex-1 min-w-0 min-h-0 mt-1 overflow-auto">
        <table className="min-w-[520px] w-full text-[13px] text-left border-collapse">
          <thead>
            <tr className="text-safe-text-muted border-b border-safe-border-light font-medium bg-safe-surface-secondary/60 select-none">
              <th className="py-1 px-2 font-medium whitespace-nowrap">{t("alarms.colTime")}</th>
              <th className="py-1 px-2 font-medium whitespace-nowrap">{isVitalDb ? t("vitalDb.sourceClass") : t("alarms.colPriority")}</th>
              <th className="py-1 px-2 font-medium">{t("alarms.colEvent")}</th>
              <th className="py-1 px-2 font-medium whitespace-nowrap">{t("alarms.colValue")}</th>
              <th className="py-1 px-2 font-medium whitespace-nowrap">{t("alarms.colDuration")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-safe-border-subtle font-mono tabular-nums">
            {events.length === 0 ? (
              <tr><td colSpan={5} className="py-4 px-2 text-center text-safe-text-muted font-sans">{isVitalDb ? t("vitalDb.noEvents") : t("simulation.noRespiratoryEvents")}</td></tr>
            ) : events.map((item) => {
              const isSelected = selectedAlarm?.id === item.id;
              const isHigh = item.priority === "HIGH";
              const isMedium = item.priority === "MEDIUM";
              const durationStr = item.durationSeconds ? `${item.durationSeconds} sec` : "--";

              return (
                <tr
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(item);
                    }
                  }}
                  onClick={() => handleRowClick(item)}
                  className={`cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-safe-cyan focus-visible:outline-none ${
                    isHigh
                      ? "bg-safe-red/20 text-safe-text hover:bg-safe-red/30"
                      : isSelected
                      ? "bg-safe-cyan/15 text-safe-text"
                      : "text-safe-text hover:bg-safe-surface-secondary"
                  }`}
                >
                  {/* Timestamp */}
                  <td
                    className={`py-1 px-2 whitespace-nowrap ${
                      isHigh ? "text-safe-red font-medium" : "text-safe-text-muted"
                    }`}
                  >
                    {item.timestamp}
                  </td>

                  {/* Semantic Priority Badge */}
                  <td className="py-1 px-2 whitespace-nowrap">
                    {item.sourceClass
                      ? <span className="text-[10px] font-mono text-safe-text-muted">{t(item.sourceClass === "OBSERVED" ? "vitalDb.eventObserved" : "vitalDb.eventDerived")}</span>
                      : <SeverityBadge
                        severity={isHigh ? "CRITICAL" : isMedium ? "WARNING" : "INFO"}
                        label={isHigh ? tCommon("severity.high") : isMedium ? tCommon("severity.medium") : tCommon("severity.low")}
                        size="xs"
                      />}
                  </td>

                  {/* Event Name */}
                  <td title={item.provenance ? JSON.stringify(item.provenance) : undefined}
                    className={`py-1 px-2 font-sans ${
                      isHigh ? "font-semibold text-safe-text" : "text-safe-text"
                    }`}
                  >
                    <span className="block">{item.translationKey ? t(item.translationKey) : item.eventName}</span>
                    {item.sourceClass && <span className="mt-0.5 block text-[10px] leading-snug text-safe-text-muted">
                      {item.definition} · {item.source} · {t("vitalDb.eventQuality")}: {item.quality}
                    </span>}
                  </td>

                  {/* Value */}
                  <td className="py-1.5 px-2 text-[#F4F6F7] whitespace-nowrap">{item.displayValue}</td>

                  {/* Duration */}
                  <td
                    className={`py-1.5 px-2 whitespace-nowrap ${
                      isHigh ? "text-red-100 font-medium" : "text-[#A7B0B6]"
                    }`}
                  >
                    {durationStr}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AlarmReviewTable;
