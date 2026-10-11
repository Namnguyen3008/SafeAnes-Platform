"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useCase } from "@/context/CaseContext";
import { useTranslation } from "@/context/LocalizationContext";
import { CaseCommandSummary } from "@/components/modules/overview/CaseCommandSummary";
import { PhysiologicStatusStrip } from "@/components/modules/overview/PhysiologicStatusStrip";
import { ModuleSummaryGrid } from "@/components/modules/overview/ModuleSummaryGrid";
import { GlobalAlertRail } from "@/components/modules/overview/GlobalAlertRail";
import { VitalDBReplayWorkspace } from "@/components/modules/replay/VitalDBReplayWorkspace";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";

export default function OverviewPage() {
  const { t } = useTranslation("common");
  const params = useParams();
  const { activeCaseId } = useCase();
  const replay = useSafeAnesData();
  const caseId = (params?.caseId as string) || activeCaseId || "demo";

  if (replay.mode === "VITALDB_REPLAY") {
    return <VitalDBReplayWorkspace module="OVERVIEW" />;
  }

  return (
    <div className="w-full h-full flex flex-col gap-[var(--safe-panel-gap)] overflow-y-auto pr-1">
      {/* 1. Executive Context: Patient / Case Demographics + Perioperative Phase Progression + Telemetry Health */}
      <CaseCommandSummary />

      {/* Global physiologic readouts project the latest observations in the shared case. */}
      <PhysiologicStatusStrip />

      {/* 3. Main Workspace Split: Five Module Summaries (Left) + Integrated Global Alert Rail (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-[var(--safe-panel-gap)] flex-1 min-h-0 pb-2">
        {/* Five Module Summaries Grid */}
        <div className="lg:col-span-8 2xl:col-span-9 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-panel-title text-safe-text font-bold uppercase tracking-wider">
              {t("overview.command.workspacesTitle")}
            </span>
            <span className="text-[11px] font-mono text-safe-text-muted">
              {t("overview.command.clickWorkspaceCard")}
            </span>
          </div>
          <ModuleSummaryGrid caseId={caseId} />
        </div>

        {/* Global Alert Rail with Source Module Identification */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col">
          <GlobalAlertRail caseId={caseId} />
        </div>
      </div>
    </div>
  );
}
