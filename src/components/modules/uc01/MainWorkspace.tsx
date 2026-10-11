"use client";

import React from "react";
import { WorkflowChecklistPanel } from "./WorkflowChecklistPanel";
import { CaseContextColumn } from "./CaseContextColumn";
import { SituationAwarenessRail } from "./SituationAwarenessRail";
import {
  WorkflowChecklistSection,
  PatientContext,
  CaseContext,
  ClinicalEvent,
  PhysiologicObservation,
  SituationAwarenessState,
  ClinicalAlert,
  DataIntegrityState,
} from "@/types/uc01";

export interface MainWorkspaceProps {
  checklistSections: WorkflowChecklistSection[];
  patient: PatientContext;
  caseContext: CaseContext;
  recentEvents: ClinicalEvent[];
  observations: PhysiologicObservation[];
  situationAwareness: SituationAwarenessState;
  alerts: ClinicalAlert[];
  dataIntegrity: DataIntegrityState;
}

export const MainWorkspace: React.FC<MainWorkspaceProps> = ({
  checklistSections,
  patient,
  caseContext,
  recentEvents,
  observations,
  situationAwareness,
  alerts,
  dataIntegrity,
}) => {
  return (
    <div className="flex-1 h-full min-h-0 min-w-0 grid grid-rows-[minmax(0,1fr)] grid-cols-[minmax(240px,0.8fr)_minmax(520px,1.8fr)_minmax(290px,1fr)] gap-2.5 px-3 pb-3 overflow-hidden">
      {/* Column 1: Patient and procedure context */}
      <div className="h-full min-h-0 overflow-hidden">
        <CaseContextColumn
          patient={patient}
          caseContext={caseContext}
          events={recentEvents}
        />
      </div>

      {/* Column 2: Perioperative workflow and checklist */}
      <div className="h-full min-h-0 overflow-hidden">
        <WorkflowChecklistPanel sections={checklistSections} />
      </div>

      {/* Column 3: Situation and signal-quality summary */}
      <div className="h-full min-h-0 overflow-hidden">
        <SituationAwarenessRail
          observations={observations}
          situationAwareness={situationAwareness}
          alerts={alerts}
          dataIntegrity={dataIntegrity}
        />
      </div>
    </div>
  );
};
