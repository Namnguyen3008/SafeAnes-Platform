"use client";

import React from "react";
import { CaseReviewSummary } from "./CaseReviewSummary";
import { ClinicalTimeline } from "./ClinicalTimeline";
import { StructuredAnaesthesiaRecord } from "./StructuredAnaesthesiaRecord";
import { EvidenceInspector } from "./EvidenceInspector";
import { ReviewTable } from "./ReviewTable";

export function MainWorkspace() {
  return (
    <main className="flex-1 flex flex-col gap-2 min-w-0 p-2 overflow-hidden h-full bg-safe-bg">
      {/* 1. Top Summary Row: 6 KPI Gauges + Patient Context */}
      <CaseReviewSummary />

      {/* 2. Center Workspace: Clinical Timeline + (Structured Record & Evidence Inspector) */}
      <div className="uc02-review-regions flex-1 min-h-0 min-w-0 overflow-hidden">
        <section className="uc02-review-timeline min-h-0 min-w-0 overflow-hidden" aria-label="Clinical timeline">
          <ClinicalTimeline />
        </section>
        <section className="uc02-review-record min-h-0 min-w-0 overflow-hidden" aria-label="Structured anaesthesia record">
          <StructuredAnaesthesiaRecord />
        </section>
        <section className="uc02-review-evidence min-h-0 min-w-0 overflow-hidden" aria-label="Evidence inspector">
          <EvidenceInspector />
        </section>
      </div>

      {/* 3. Bottom Review Table: Events & Claims Queue + Quality Gates + Checklist */}
      <ReviewTable />
    </main>
  );
}
