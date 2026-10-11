"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function CaseErrorSummary() {
  const { t } = useTranslation("uc02");
  const { errorMetrics } = useClinicalReview();

  const metricsList = [
    {
      label: t("errorSummary.unsupportedClaims"),
      value: errorMetrics.unsupportedClaims,
      color: errorMetrics.unsupportedClaims > 0 ? "var(--safe-red, #EF4444)" : "var(--safe-green, #22C55E)",
    },
    { label: t("errorSummary.omittedFacts"), value: errorMetrics.omittedFacts, color: "var(--safe-text-muted, #94A3B8)" },
    {
      label: t("errorSummary.temporalErrors"),
      value: errorMetrics.temporalErrors,
      color: "var(--safe-green, #22C55E)",
    },
    { label: t("errorSummary.wrongValues"), value: errorMetrics.wrongValues, color: "var(--safe-green, #22C55E)" },
    {
      label: t("errorSummary.terminologyIssues"),
      value: errorMetrics.terminologyIssues,
      color: "var(--safe-yellow, #EAB308)",
    },
    {
      label: t("errorSummary.provenanceIssues"),
      value: errorMetrics.provenanceIssues,
      color: "var(--safe-green, #22C55E)",
    },
  ];

  return (
    <div className="w-[240px] shrink-0 bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header (Panel title: 15–18px) */}
      <div className="flex flex-wrap items-center justify-between gap-1 pb-1 border-b border-safe-border shrink-0">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-safe-yellow" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("errorSummary.title")}
          </h3>
        </div>
        <span className="text-[10px] font-mono text-safe-yellow bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-yellow/40 font-semibold">
          {t("errorSummary.auditGates")}
        </span>
      </div>

      {/* 6 Error Metric Cards (2x3 Grid) */}
      <div className="grid grid-cols-2 gap-1 my-1 min-w-0">
        {metricsList.map((item) => (
          <div
            key={item.label}
            className="min-w-0 bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 flex items-center justify-between gap-1 font-mono"
          >
            <span className="min-w-0 text-[9px] leading-tight text-safe-text-muted whitespace-normal break-words pr-1" title={item.label}>
              {item.label}:
            </span>
            <span
              className="shrink-0 text-[13px] font-bold tabular-nums"
              style={{ color: item.color }}
            >
              {item.value ?? "—"}
            </span>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="pt-1 border-t border-safe-border-light flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[9px] leading-tight font-mono text-safe-text-muted shrink-0">
        <span>{t("errorSummary.deterministicEngine")}</span>
        <span className="text-safe-green">{t("errorSummary.generatedClaimScope")}</span>
      </div>
    </div>
  );
}
