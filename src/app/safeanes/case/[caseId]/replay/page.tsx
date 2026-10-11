"use client";

import React from "react";
import { Activity, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalPanel } from "@/components/common/ClinicalPanel";
import { SimulationClock } from "@/components/simulation/SimulationClock";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { useTranslation } from "@/context/LocalizationContext";
import { formatCaseTime } from "@/simulation";

export default function ReplayPage() {
  const { t } = useTranslation("common");
  const { engine, snapshot } = useSimulationReplay();

  if (!engine || !snapshot) return null;

  const visibleEvents = [...snapshot.events].reverse().slice(0, 12);

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-2.5 border border-[rgba(45,155,215,0.38)] rounded-[3px] bg-[#07121A] p-2">
      <div className="flex min-w-0 items-center gap-2 border-b border-[rgba(45,155,215,0.20)] pb-2">
        <PlayCircle className="h-5 w-5 shrink-0 text-[#00E5FF]" />
        <h2 className="min-w-0 text-sm font-bold tracking-wide text-[#F4F7F8]">
          {t("caseReplay.title")}
        </h2>
        <span className="ml-auto shrink-0 rounded-sm border border-safe-amber/40 bg-safe-amber/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-safe-amber">
          {t("caseReplay.syntheticNotice")}
        </span>
      </div>

      <p className="min-w-0 text-xs text-[#A6B2BA]">{t("caseReplay.description")}</p>

      <SimulationClock engine={engine} />

      <ClinicalPanel
        title={t("caseReplay.eventsAtCursor")}
        icon={Activity}
        status={<span className="font-mono text-[10px] tabular-nums text-safe-text-muted">{snapshot.processedEventCount}</span>}
        contentClassName="overflow-auto"
        className="min-h-0 flex-1"
      >
        {visibleEvents.length === 0 ? (
          <p className="py-4 text-center text-xs text-safe-text-muted">{t("caseReplay.noEventsAtCursor")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-safe-surface text-[10px] uppercase tracking-wide text-safe-text-muted">
                <tr>
                  <th className="whitespace-nowrap border-b border-safe-border px-2 py-1.5 font-semibold">{t("table.time")}</th>
                  <th className="border-b border-safe-border px-2 py-1.5 font-semibold">{t("caseReplay.eventType")}</th>
                  <th className="whitespace-nowrap border-b border-safe-border px-2 py-1.5 text-right font-semibold">{t("table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((event) => (
                  <tr key={event.id} className="border-b border-safe-border-subtle last:border-0">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-safe-cyan">
                      {formatCaseTime(snapshot.encounter.startedAt, event.eventTime)}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-safe-text">
                      {event.eventType.replaceAll("_", " ")}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      <Button type="button" size="xs" variant="outline" onClick={() => engine.seekToEvent(event.id)}>
                        {t("caseReplay.seekToEvent")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ClinicalPanel>
    </div>
  );
}
