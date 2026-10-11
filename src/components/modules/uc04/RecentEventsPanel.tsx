"use client";

import React from "react";
import { MoreHorizontal } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { HemodynamicEvent } from "@/types/uc04";
import { Badge } from "./ui/Badge";
import { useTranslation } from "@/context/LocalizationContext";
import { UC04VitalDbSourceControl } from "./UC04VitalDbSourceControl";

export function RecentEventsPanel() {
  const { t } = useTranslation("uc04");
  const { t: tCommon } = useTranslation("common");
  const { events, selectedEventId, selectEvent } = useHemodynamic();

  const getEventTitle = (type: HemodynamicEvent["type"]): string => {
    switch (type) {
      case "HYPOTENSION_RISK_RISING":
        return t("events.hypotensionRiskRising");
      case "HYPOTENSION_EPISODE":
        return t("events.mapDrop");
      case "MEDICATION_OVERLAP":
        return t("events.phenylephrineRescue");
      case "SVR_INCREASE":
        return t("events.svrIncrease");
      case "INDUCTION":
        return t("events.induction");
      case "FLUID_BOLUS":
        return t("events.fluidBolus");
      case "VITALDB_ANNOTATION":
        return t("vitaldb.recordedAnnotation");
      default:
        return type;
    }
  };

  const getEventDetails = (evt: HemodynamicEvent): string => {
    if (evt.type === "HYPOTENSION_RISK_RISING") {
      return t("simulation.riskEventDetails", { risk: evt.riskPercent ?? "—", lead: evt.leadTimeMinutes ?? "—" });
    }
    if (evt.type === "HYPOTENSION_EPISODE") {
      return t("simulation.lowMapEventDetails", {
        map: evt.mapValue ?? "—",
        threshold: evt.thresholdMmHg ?? "—",
      });
    }
    if (evt.type === "MEDICATION_OVERLAP") {
      return t("simulation.overlapEventDetails", { medication: evt.medicationName ?? "—" });
    }
    return evt.details;
  };

  return (
    <section className="uc04-events-panel relative h-full min-h-[130px] min-w-0 bg-safe-surface border border-safe-border rounded-sm p-2 flex flex-col justify-between overflow-hidden select-none">
      {/* Table Header */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-safe-text">
            {t("events.recentEvents")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-safe-text-muted font-mono">
            {t("events.jumpTimeline")}
          </div>
          <UC04VitalDbSourceControl />
        </div>
      </div>

      {/* Dense Clinical Records Table */}
      <div className="clinical-table-scroll clinical-table-sticky flex-1 min-w-0 overflow-auto mt-0.5">
        <table className="min-w-[800px] w-full text-left text-[12px] border-collapse font-sans">
          <thead className="bg-safe-surface sticky top-0 z-10">
            <tr className="text-safe-text-muted border-b border-safe-border-light text-[11px] uppercase font-bold tracking-wider">
              <th className="py-0.5 px-2.5 w-[115px] whitespace-nowrap">{t("events.time")}</th>
              <th className="py-0.5 px-2.5 w-[95px] whitespace-nowrap">{t("events.priority")}</th>
              <th className="py-0.5 px-2.5 w-[190px] whitespace-nowrap">{t("events.event")}</th>
              <th className="py-0.5 px-2.5">{t("events.details")}</th>
              <th className="py-0.5 px-2.5 w-[120px] whitespace-nowrap">{t("events.duration")}</th>
              <th className="py-0.5 px-2.5 w-[170px] whitespace-nowrap">{t("events.action")}</th>
              <th className="py-0.5 px-2.5 w-[30px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-safe-border-subtle text-safe-text">
            {events.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 px-2.5 text-center text-[11px] text-safe-text-muted">
                  {t("vitaldb.noRecordedEvents")}
                </td>
              </tr>
            )}
            {events.map((evt) => {
              const isSelected = selectedEventId === evt.id;
              const priorityVariant =
                evt.priority === "HIGH"
                  ? "high"
                  : evt.priority === "MEDIUM"
                  ? "medium"
                  : "info";

              const priorityLabel =
                evt.priority === "HIGH"
                  ? tCommon("severity.high")
                  : evt.priority === "MEDIUM"
                  ? tCommon("severity.medium")
                  : tCommon("severity.info");

              return (
                <tr
                  key={evt.id}
                  onClick={() => selectEvent(evt)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectEvent(evt);
                    }
                  }}
                  className={`cursor-pointer transition-colors focus:outline-none focus:bg-safe-surface-secondary ${
                    isSelected
                      ? "bg-safe-cyan/15 border-l-2 border-safe-cyan"
                      : "hover:bg-safe-surface-secondary/80"
                  }`}
                >
                  <td className="py-1 px-2.5 font-mono text-safe-text-muted tabular-nums whitespace-nowrap">
                    {evt.timestamp}
                  </td>
                  <td className="py-1 px-2.5">
                    <Badge variant={priorityVariant}>{priorityLabel}</Badge>
                  </td>
                  <td
                    className={`py-1 px-2.5 font-semibold ${
                      evt.priority === "HIGH" ? "text-safe-red" : "text-safe-text"
                    }`}
                  >
                    {getEventTitle(evt.type)}
                  </td>
                  <td className="py-1 px-2.5 text-safe-text">{getEventDetails(evt)}</td>
                  <td className="py-1 px-2.5 text-safe-text-muted whitespace-nowrap">
                    {evt.duration === "ongoing" ? t("events.ongoing") : evt.duration === "resolved" ? t("events.resolved") : evt.duration ?? "—"}
                  </td>
                  <td className="py-1 px-2.5 text-safe-text">
                    {(evt.type === "HYPOTENSION_RISK_RISING" || evt.type === "HYPOTENSION_EPISODE")
                      ? t("simulation.demoOnly")
                      : evt.type === "MEDICATION_OVERLAP"
                        ? t("simulation.overlapLabel")
                        : evt.action ?? "—"}
                  </td>
                  <td className="py-1 px-2.5 text-safe-text-muted text-right">
                    <MoreHorizontal className="w-3.5 h-3.5 inline cursor-pointer hover:text-white" />
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

export { RecentEventsPanel as HemodynamicEventsTable };
