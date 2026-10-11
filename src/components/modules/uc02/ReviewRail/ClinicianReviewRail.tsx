"use client";

import React, { useState } from "react";
import { ReviewProgress } from "./ReviewProgress";
import { ValidationSummary } from "./ValidationSummary";
import { ProvenanceSummary } from "./ProvenanceSummary";
import { CurrentReviewIssue } from "./CurrentReviewIssue";
import { RecordApproval } from "./RecordApproval";
import { PanelRightClose, PanelRightOpen, ShieldCheck } from "lucide-react";

export function ClinicianReviewRail() {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  if (isCollapsed) {
    return (
      <aside className="w-[36px] min-w-[36px] max-w-[36px] shrink-0 border-l border-safe-border bg-safe-surface py-2 flex flex-col items-center justify-between h-full select-none">
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-safe-surface-secondary text-safe-cyan transition-colors cursor-pointer"
          title="Mở rộng thanh rà soát lâm sàng"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center justify-center py-4">
          <span
            className="text-[11px] font-mono font-bold text-safe-text-muted tracking-widest whitespace-nowrap"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            RÀ SOÁT LÂM SÀNG
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-safe-surface-secondary text-safe-green transition-colors cursor-pointer"
          title="Mở rộng thanh rà soát lâm sàng"
        >
          <ShieldCheck className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[clamp(280px,22vw,340px)] min-w-[280px] max-w-[340px] shrink-0 border-l border-safe-border bg-safe-surface p-2 flex min-h-0 flex-col justify-between gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain h-full select-none relative">
      {/* Header bar with Collapse Button */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border shrink-0">
        <span className="text-[11px] font-mono font-bold text-safe-text uppercase tracking-tight">
          Bảng rà soát lâm sàng
        </span>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-1 rounded text-safe-text-muted hover:text-safe-cyan hover:bg-safe-surface-secondary transition-colors cursor-pointer"
          title="Thu gọn thanh rà soát để mở rộng không gian làm việc"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

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
