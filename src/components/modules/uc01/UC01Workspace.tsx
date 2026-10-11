"use client";

import React from "react";
import { PerioperativeTimeline } from "./PerioperativeTimeline";
import { MainWorkspace } from "./MainWorkspace";
import { PerioperativeCaseState } from "@/types/uc01";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { VitalDBReplayWorkspace } from "@/components/modules/replay/VitalDBReplayWorkspace";

export interface UC01WorkspaceProps {
  caseState: PerioperativeCaseState;
}

export const UC01Workspace: React.FC<UC01WorkspaceProps> = ({ caseState }) => {
  const replay = useSafeAnesData();
  if (replay.mode === "VITALDB_REPLAY") return <VitalDBReplayWorkspace module="UC01" />;

  return (
    <div className="flex-1 h-full min-h-[720px] min-w-[1100px] flex flex-col overflow-hidden select-none">
      {/* Top Section: Perioperative Timeline */}
      <div className="pb-2 shrink-0">
        <PerioperativeTimeline
          phases={caseState.phases}
          activePhaseId={caseState.activePhaseId}
          estimatedEndTime={caseState.estimatedEndTime}
          simulationTime={caseState.simulationTime}
        />
      </div>

      {/* Bottom Section: 3-Column Main Clinical Workspace */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MainWorkspace
          checklistSections={caseState.checklistSections}
          patient={caseState.patient}
          caseContext={caseState.caseContext}
          recentEvents={caseState.recentEvents}
          observations={caseState.observations}
          situationAwareness={caseState.situationAwareness}
          alerts={caseState.alerts}
          dataIntegrity={caseState.dataIntegrity}
        />
      </div>
    </div>
  );
};
