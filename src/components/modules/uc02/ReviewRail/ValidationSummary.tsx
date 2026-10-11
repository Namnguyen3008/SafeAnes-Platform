"use client";

import React from "react";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function ValidationSummary() {
  const { t } = useTranslation("uc02");
  const { validationGateCounts, requiresReviewClaimsCount, errorMetrics } = useClinicalReview();

  const gates = [
    {
      name: "Numeric",
      passed: validationGateCounts.numeric.pass,
      total: validationGateCounts.numeric.total,
      status: validationGateCounts.numeric.pass === validationGateCounts.numeric.total ? "PASS" : "WARN",
    },
    {
      name: "Units",
      passed: validationGateCounts.unit.pass,
      total: validationGateCounts.unit.total,
      status: validationGateCounts.unit.pass === validationGateCounts.unit.total ? "PASS" : "WARN",
    },
    {
      name: "Temporal",
      passed: validationGateCounts.temporal.pass,
      total: validationGateCounts.temporal.total,
      status: validationGateCounts.temporal.pass === validationGateCounts.temporal.total ? "PASS" : "WARN",
    },
    {
      name: "Evidence",
      passed: validationGateCounts.evidence.pass,
      total: validationGateCounts.evidence.total,
      status: validationGateCounts.evidence.pass === validationGateCounts.evidence.total ? "PASS" : "WARN",
    },
    {
      name: "Terminology",
      passed: validationGateCounts.terminology.pass,
      total: validationGateCounts.terminology.total,
      status: validationGateCounts.terminology.pass === validationGateCounts.terminology.total ? "PASS" : "WARN",
    },
  ];

  return (
    <div className="bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header: Panel title 15–18px */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-safe-green" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("reviewRail.validationSummary")}
          </h3>
        </div>
        <span className="text-[10px] font-mono text-safe-green bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-green/40 font-semibold">
          {t("reviewRail.deterministic")}
        </span>
      </div>

      {/* 5 Deterministic Gates List */}
      <div className="my-1 space-y-1 font-mono text-[10.5px]">
        {gates.map((g) => (
          <div
            key={g.name}
            className="flex items-center justify-between bg-safe-surface-secondary px-2 py-0.5 rounded-[2px] border border-safe-border-light"
          >
            <span className="text-safe-text-muted">{g.name}:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-safe-text tabular-nums font-semibold">
                {g.passed} / {g.total}
              </span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded-[2px] font-bold ${
                  g.passed === g.total
                    ? "text-safe-green bg-safe-surface border border-safe-green/40"
                    : "text-safe-yellow bg-safe-surface border border-safe-yellow/40"
                }`}
              >
                {g.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Summary: pending review and critical omissions */}
      <div className="flex items-center justify-between pt-1 border-t border-safe-border-light text-[10px] font-mono">
        <div className="flex items-center gap-1 text-safe-red">
          <AlertCircle className="w-3 h-3 text-safe-red" />
          <span>
            {t("reviewRail.requiresReviewCount")} <strong>{requiresReviewClaimsCount}</strong>
          </span>
        </div>
        <div className="flex items-center gap-1 text-safe-text-muted">
          <span>{t("errorSummary.omittedFacts")} <strong>{errorMetrics.omittedFacts ?? "—"}</strong></span>
        </div>
      </div>
    </div>
  );
}
