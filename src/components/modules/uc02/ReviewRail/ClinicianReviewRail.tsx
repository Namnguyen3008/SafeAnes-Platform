"use client";

import React from "react";
import { ReviewProgress } from "./ReviewProgress";
import { ValidationSummary } from "./ValidationSummary";
import { ProvenanceSummary } from "./ProvenanceSummary";
import { CurrentReviewIssue } from "./CurrentReviewIssue";
import { RecordApproval } from "./RecordApproval";

export function ClinicianReviewRail() {
  return (
    <aside className="w-[clamp(280px,22vw,340px)] min-w-[280px] max-w-[340px] shrink-0 border-l border-safe-border bg-safe-surface p-2 flex min-h-0 flex-col justify-between gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain h-full select-none">
      {/* 1. Review Progress (Generated, Accepted, Edited, Rejected, Requires Review, % Progress) */}
      <ReviewProgress />

      {/* 2. Validation Summary (Numeric, Units, Temporal, Evidence, Terminology, Unsupported, Omissions) */}
      <ValidationSummary />

      {/* 3. Provenance Summary (Compact horizontal bars: DIRECT, DERIVED, INFERRED, CONFIRMED) */}
      <ProvenanceSummary />

      {/* 4. Current Review Issue (High Priority: Unsupported clinical interpretation) */}
      <CurrentReviewIssue />

      {/* Record approval is projected from canonical review and signing events. */}
      <RecordApproval />
    </aside>
  );
}

// Re-export as ReviewRail for backwards compatibility
export { ClinicianReviewRail as ReviewRail };
