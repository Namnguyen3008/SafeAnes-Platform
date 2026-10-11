"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function ReviewProgress() {
  const { t } = useTranslation("uc02");
  const {
    totalClaimsCount,
    acceptedClaimsCount,
    editedClaimsCount,
    rejectedClaimsCount,
    requiresReviewClaimsCount,
    reviewProgressPercent,
  } = useClinicalReview();

  const metrics = [
    { label: t("status.generated"), value: totalClaimsCount, color: "var(--safe-text, #F4F7F8)" },
    { label: t("status.accepted"), value: acceptedClaimsCount, color: "var(--safe-green, #22C55E)" },
    { label: t("status.edited"), value: editedClaimsCount, color: "var(--safe-cyan, #00E5FF)" },
    { label: t("status.rejected"), value: rejectedClaimsCount, color: "var(--safe-red, #EF4444)" },
    { label: t("status.requiresReview"), value: requiresReviewClaimsCount, color: "var(--safe-yellow, #EAB308)" },
  ];

  const reviewedTotal = acceptedClaimsCount + editedClaimsCount + rejectedClaimsCount;

  // Percentage widths
  const acceptedPct = totalClaimsCount > 0 ? (acceptedClaimsCount / totalClaimsCount) * 100 : 0;
  const editedPct = totalClaimsCount > 0 ? (editedClaimsCount / totalClaimsCount) * 100 : 0;
  const rejectedPct = totalClaimsCount > 0 ? (rejectedClaimsCount / totalClaimsCount) * 100 : 0;
  const reviewRemainingPct = Math.max(0, 100 - (acceptedPct + editedPct + rejectedPct));

  return (
    <div className="bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header (Panel title: 15–18px) */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-safe-cyan" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("reviewRail.progress")}
          </h3>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px] text-safe-green bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-green/40 font-bold">
          <span>{t("reviewRail.completePercent", { pct: reviewProgressPercent })}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="my-1.5 space-y-1">
        <div className="flex justify-between items-center text-[10px] font-mono text-safe-text-muted">
          <span>{t("reviewRail.completionLabel")}</span>
          <span className="text-safe-green font-bold tabular-nums">
            {t("reviewRail.auditedRatio", { reviewed: reviewedTotal, total: totalClaimsCount })}
          </span>
        </div>
        <div className="w-full bg-safe-bg h-2 rounded-[2px] overflow-hidden border border-safe-border-light flex">
          <div
            style={{ width: `${acceptedPct}%` }}
            className="bg-safe-green h-full transition-all duration-300"
            title={`Accepted (${acceptedClaimsCount})`}
          />
          <div
            style={{ width: `${editedPct}%` }}
            className="bg-safe-cyan h-full transition-all duration-300"
            title={`Edited (${editedClaimsCount})`}
          />
          <div
            style={{ width: `${rejectedPct}%` }}
            className="bg-safe-red h-full transition-all duration-300"
            title={`Rejected (${rejectedClaimsCount})`}
          />
          <div
            style={{ width: `${reviewRemainingPct}%` }}
            className="bg-safe-yellow/40 h-full transition-all duration-300"
            title={`Pending (${requiresReviewClaimsCount})`}
          />
        </div>
      </div>

      {/* 5 Compact Metric Counters Grid */}
      <div className="grid grid-cols-5 gap-1 pt-0.5 border-t border-safe-border-light text-center font-mono">
        {metrics.map((m) => (
          <div key={m.label} className="bg-safe-surface-secondary p-1 rounded-[2px]">
            <div
              className="text-[14px] font-bold tabular-nums leading-none"
              style={{ color: m.color }}
            >
              {m.value}
            </div>
            <div className="text-[8.5px] text-safe-text-muted truncate mt-0.5 leading-tight">
              {m.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
