"use client";

import React from "react";
import { PatientContextPanel } from "./PatientContextPanel";
import { CurrentMedicationAlert } from "./CurrentMedicationAlert";
import { AlertKnowledgePanel } from "./AlertKnowledgePanel";
import { MedicationRiskSummary } from "./MedicationRiskSummary";

export function MedicationContextRail() {
  return (
    <div className="bg-[#07121A] border border-[rgba(50,150,205,0.40)] rounded-[2px] flex flex-col h-full min-h-0 select-none overflow-x-hidden overflow-y-auto divide-y divide-[rgba(50,150,205,0.25)]">
      {/* 1. Patient Context Panel */}
      <PatientContextPanel />

      {/* 2. Current Medication Alert */}
      <CurrentMedicationAlert />

      {/* 3. Alert Source / Knowledge Panel */}
      <AlertKnowledgePanel />

      {/* 4. Medication Risk Summary */}
      <MedicationRiskSummary />
    </div>
  );
}
