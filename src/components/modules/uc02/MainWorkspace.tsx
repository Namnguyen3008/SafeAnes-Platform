"use client";

import React, { useState } from "react";
import { CaseReviewSummary } from "./CaseReviewSummary";
import { ClinicalTimeline } from "./ClinicalTimeline";
import { RecordReviewColumn } from "./RecordReviewColumn";
import { ReviewTable } from "./ReviewTable";

export function MainWorkspace() {
  const [isTimelineMaximized, setIsTimelineMaximized] = useState<boolean>(false);

  return (
    <main className="flex-1 flex flex-col gap-2 min-w-0 p-2 overflow-hidden h-full bg-safe-bg">
      {/* 1. Top Summary Row: Unified Executive Clinical Banner with KPI Stat Pills */}
      <CaseReviewSummary />

      {/* 2. Center Workspace: Clinical Timeline + Record Review Column (21st.dev CardTabs) */}
      <div className="flex-1 min-h-0 min-w-0 flex gap-2 overflow-hidden">
        {/* Left: Clinical Timeline (Takes full width if maximized, or fluid flex-1) */}
        <section
          className={`h-full min-h-0 overflow-hidden transition-all duration-200 ${
            isTimelineMaximized ? "w-full" : "flex-1 min-w-0"
          }`}
          aria-label="Clinical timeline"
        >
          <ClinicalTimeline
            isMaximized={isTimelineMaximized}
            onToggleMaximize={() => setIsTimelineMaximized(!isTimelineMaximized)}
          />
        </section>

        {/* Right: Record Review Column with 21st.dev CardTabs (Record & Evidence Inspector) */}
        {!isTimelineMaximized && (
          <aside
            className="w-[450px] 2xl:w-[500px] shrink-0 h-full min-h-0 overflow-hidden"
            aria-label="Structured anaesthesia record and evidence inspection"
          >
            <RecordReviewColumn />
          </aside>
        )}
      </div>

      {/* 3. Bottom Review Table: Events & Claims Queue + Quality Gates + Checklist */}
      <ReviewTable />
    </main>
  );
}
