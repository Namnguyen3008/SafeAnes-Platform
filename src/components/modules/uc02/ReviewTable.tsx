"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, TableProperties, ShieldCheck } from "lucide-react";
import { ClaimReviewTable } from "./ClaimReviewTable";
import { CaseErrorSummary } from "./CaseErrorSummary";
import { BenchmarkModeCard } from "./BenchmarkModeCard";
import { useTranslation } from "@/context/LocalizationContext";
import { useClinicalReview } from "@/context/ClinicalReviewContext";

export function ReviewTable() {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const { t } = useTranslation("uc02");
  const { totalClaimsCount } = useClinicalReview();

  if (isCollapsed) {
    return (
      <div className="w-full h-[34px] shrink-0 bg-safe-surface border border-safe-border rounded-[2px] px-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5 text-[11px] font-mono text-safe-text">
          <TableProperties className="w-3.5 h-3.5 text-safe-cyan" />
          <span className="font-semibold text-safe-text">
            {t("header.title")} &amp; {t("header.claimsAudited")}
          </span>
          <span className="text-[10px] text-safe-cyan bg-safe-surface-secondary px-1.5 py-0.2 rounded border border-safe-border">
            {totalClaimsCount} {t("header.claimsAudited")}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-safe-text-muted">
            <ShieldCheck className="w-3 h-3 text-safe-green" />
            <span>{t("table.synchronized")}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-mono text-safe-cyan hover:bg-safe-surface-secondary border border-safe-cyan/40 transition-colors cursor-pointer"
        >
          <span>{t("actions.expand") || "Mở rộng"}</span>
          <ChevronUp className="w-3.5 h-3.5 text-safe-cyan" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-[142px] shrink-0 flex flex-col gap-1 select-none overflow-hidden relative">
      <div className="w-full flex-1 min-h-0 grid grid-cols-[minmax(0,1.8fr)_minmax(230px,0.8fr)_minmax(200px,0.7fr)] gap-2 overflow-hidden">
        {/* 1. Left: Claim Review Table (~55-60% width) */}
        <ClaimReviewTable />

        {/* 2. Center-Right: Case Error Summary (~25% width) */}
        <CaseErrorSummary />

        {/* 3. Far-Right: Benchmark Mode Card (Secondary, ~20% width) */}
        <BenchmarkModeCard />
      </div>
      <button
        type="button"
        onClick={() => setIsCollapsed(true)}
        className="absolute top-1.5 right-2 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded bg-safe-surface-secondary/90 hover:bg-safe-surface border border-safe-border text-[9.5px] font-mono text-safe-text-muted hover:text-safe-text transition-colors cursor-pointer"
        title="Thu gọn để phóng to Dòng thời gian và Hồ sơ gây mê"
      >
        <span>{t("actions.collapse") || "Thu gọn"}</span>
        <ChevronDown className="w-3 h-3 text-safe-cyan" />
      </button>
    </div>
  );
}

