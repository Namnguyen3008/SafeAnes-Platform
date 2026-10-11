"use client";

import React from "react";
import { ActiveMedicationPanel } from "./ActiveMedicationPanel";
import { MedicationSafetyReviewPanel } from "./MedicationSafetyReviewPanel";
import { MedicationContextRail } from "./MedicationContextRail";

export function UpperWorkspace() {
  return (
    <section className="grid grid-cols-[minmax(260px,0.9fr)_minmax(480px,1.55fr)_minmax(280px,0.95fr)] gap-2 h-full w-full min-h-0 min-w-0 overflow-hidden">
      {/* Col 1: Active Medications (~28%) */}
      <div className="h-full min-h-0 overflow-hidden">
        <ActiveMedicationPanel />
      </div>

      {/* Col 2: Medication Safety Review (~48%) */}
      <div className="h-full min-h-0 overflow-hidden">
        <MedicationSafetyReviewPanel />
      </div>

      {/* Col 3: Patient Context & Knowledge Rail (~24%) */}
      <div className="h-full min-h-0 overflow-hidden">
        <MedicationContextRail />
      </div>
    </section>
  );
}
