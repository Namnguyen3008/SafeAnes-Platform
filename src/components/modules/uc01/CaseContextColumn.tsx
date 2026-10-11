"use client";

import React from "react";
import { PatientSummaryPanel } from "./PatientSummaryPanel";
import { ORContextPanel } from "./ORContextPanel";
import { RecentEventsPanel } from "./RecentEventsPanel";
import { PatientContext, CaseContext, ClinicalEvent } from "@/types/uc01";

export interface CaseContextColumnProps {
  patient: PatientContext;
  caseContext: CaseContext;
  events: ClinicalEvent[];
}

export const CaseContextColumn: React.FC<CaseContextColumnProps> = ({
  patient,
  caseContext,
  events,
}) => {
  return (
    <div className="h-full min-h-0 flex flex-col justify-between space-y-2.5 overflow-x-hidden overflow-y-auto overscroll-contain">
      <PatientSummaryPanel patient={patient} />
      <ORContextPanel caseContext={caseContext} />
      <RecentEventsPanel events={events} />
    </div>
  );
};
