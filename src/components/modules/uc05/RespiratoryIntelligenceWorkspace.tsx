"use client";

import React, { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RespiratoryProvider, useRespiratory } from "@/context/RespiratoryContext";
import { ClinicalVisualizationColumn } from "./ClinicalVisualizationColumn";
import { ClinicalSummaryRail } from "./ClinicalSummaryRail";
import { AlarmDetailPopover } from "./ui/AlarmDetailPopover";
import { AlertDetailDrawer } from "./ui/AlertDetailDrawer";
import { RiskModelInfoPopover } from "./ui/RiskModelInfoPopover";

function RespiratoryRouteSync() {
  const searchParams = useSearchParams();
  const { caseData, caseStartTimestamp, simulationMode, setHighlightedEventId, setSelectedAlarm, setCursorTimestamp } = useRespiratory();
  const lastRouteSync = useRef<string | null>(null);
  const routeSignature = searchParams?.toString() ??
    (typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, ""));

  useEffect(() => {
    if (lastRouteSync.current === routeSignature) return;
    lastRouteSync.current = routeSignature;
    const routeParams = new URLSearchParams(routeSignature);
    const eventParam = routeParams.get("event");
    const alarmParam = routeParams.get("alarm");
    const timeParam = routeParams.get("time");
    if (eventParam) setHighlightedEventId(eventParam);

    const targetAlarm = alarmParam || eventParam;
    if (targetAlarm) {
      const found = caseData.alarmReview.find((alarm) =>
        alarm.id === targetAlarm || alarm.id.includes(targetAlarm) || targetAlarm.includes(alarm.id)
      );
      if (found) setSelectedAlarm(found);
    }

    if (timeParam) {
      const [hours, minutes, seconds = "0"] = timeParam.split(":");
      if ([hours, minutes, seconds].every((part) => /^\d+$/.test(part))) {
        const target = Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds);
        if (!simulationMode) {
          setCursorTimestamp(target * 1_000);
        } else {
          const startDate = new Date(caseStartTimestamp);
          const start = startDate.getHours() * 3_600 + startDate.getMinutes() * 60 + startDate.getSeconds();
          const elapsed = ((target - start + 86_400) % 86_400) * 1_000;
          setCursorTimestamp(caseStartTimestamp + elapsed);
        }
      }
    }
  }, [routeSignature, caseData.alarmReview, caseStartTimestamp, simulationMode, setHighlightedEventId, setSelectedAlarm, setCursorTimestamp]);

  return null;
}

function RespiratoryWorkspaceContent() {
  const { caseData, simulationMode } = useRespiratory();

  return (
    <div className="uc05-workspace-layout w-full min-w-[1160px] h-full min-h-0 flex flex-col overflow-hidden select-none bg-safe-bg text-safe-text relative">
      <main className="flex-1 min-h-0 min-w-0 grid grid-cols-[minmax(700px,2.5fr)_minmax(320px,1fr)] gap-[var(--safe-panel-gap)] overflow-hidden">
        <ClinicalVisualizationColumn
          capnogramWaveform={caseData.capnogramWaveform}
          plethWaveform={caseData.plethWaveform}
          signalQuality={caseData.signalQuality}
          recordedDataMode={!simulationMode}
          alarmReview={caseData.alarmReview}
          tabularTrends={caseData.tabularTrends}
        />
        <ClinicalSummaryRail
          vitals={caseData.vitals}
          riskPrediction={caseData.riskPrediction}
          activeAlert={caseData.activeAlert}
          realRecordedData={!simulationMode}
        />
      </main>
      <AlarmDetailPopover />
      <AlertDetailDrawer alert={caseData.activeAlert} />
      <RiskModelInfoPopover prediction={caseData.riskPrediction} />
    </div>
  );
}

export function RespiratoryIntelligenceWorkspace() {
  return (
    <RespiratoryProvider>
      <Suspense fallback={null}><RespiratoryRouteSync /></Suspense>
      <RespiratoryWorkspaceContent />
    </RespiratoryProvider>
  );
}

export { RespiratoryIntelligenceWorkspace as RespiratoryIntelligenceDashboard };
export default RespiratoryIntelligenceWorkspace;
