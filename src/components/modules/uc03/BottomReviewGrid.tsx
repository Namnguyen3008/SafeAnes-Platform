"use client";

import React from "react";
import { RecentAlertsOverridesTable } from "./RecentAlertsOverridesTable";
import { RecentMedicationValuesTable } from "./RecentMedicationValuesTable";

export function BottomReviewGrid() {
  return (
    <section className="grid grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] gap-2 h-full w-full min-h-0 min-w-0 overflow-hidden">
      {/* Col 1: Recent Alerts / Overrides (~56%) */}
      <div className="h-full min-h-0 overflow-hidden">
        <RecentAlertsOverridesTable />
      </div>

      {/* Col 2: Recent Medication Values (~44%) */}
      <div className="h-full min-h-0 overflow-hidden">
        <RecentMedicationValuesTable />
      </div>
    </section>
  );
}
