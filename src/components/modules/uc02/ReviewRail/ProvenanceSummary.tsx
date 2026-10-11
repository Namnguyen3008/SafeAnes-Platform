"use client";

import React from "react";
import { GitBranch } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function ProvenanceSummary() {
  const { t } = useTranslation("uc02");
  const { provenanceCounts, totalClaimsCount, claims } = useClinicalReview();
  const evidenceLinkedCount = Object.values(claims).filter((claim) => claim.evidenceRefs.length > 0).length;
  const evidenceCoverage = totalClaimsCount === 0 ? 0 : Math.round(evidenceLinkedCount / totalClaimsCount * 100);

  const maxVal = Math.max(1, totalClaimsCount);

  const provenanceStats = [
    { label: "DIRECT", count: provenanceCounts.DIRECT, color: "var(--safe-provenance-direct, #00E5FF)", max: maxVal },
    { label: "DERIVED", count: provenanceCounts.DERIVED, color: "var(--safe-provenance-derived, #2563EB)", max: maxVal },
    { label: "INFERRED", count: provenanceCounts.INFERRED, color: "var(--safe-provenance-inferred, #EAB308)", max: maxVal },
    {
      label: "CLINICIAN CONFIRMED",
      count: provenanceCounts.CLINICIAN_CONFIRMED,
      color: "var(--safe-provenance-confirmed, #22C55E)",
      max: maxVal,
    },
  ];

  return (
    <div className="bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header: Panel title 15–18px */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-safe-cyan" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("reviewRail.provenanceSummary")}
          </h3>
        </div>
        <span className="text-[10px] font-mono text-safe-cyan bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-border">
          W3C PROV-O
        </span>
      </div>

      {/* Compact Horizontal Bars */}
      <div className="my-1 space-y-1.5 text-[10.5px] font-mono">
        {provenanceStats.map((item) => {
          const widthPct = Math.round((item.count / item.max) * 100);
          return (
            <div key={item.label} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-safe-text-muted font-semibold">{item.label}</span>
                <span
                  className="font-bold tabular-nums"
                  style={{ color: item.color }}
                >
                  {item.count}
                </span>
              </div>
              {/* Compact Horizontal Bar */}
              <div className="w-full bg-safe-bg h-1.5 rounded-[2px] overflow-hidden border border-safe-border-light">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="pt-1 border-t border-safe-border-light flex items-center justify-between text-[9.5px] font-mono text-safe-text-muted">
        <span>{t("reviewRail.coverage", { pct: evidenceCoverage })}</span>
        <span className="text-safe-green">{t("table.atomicClaims", { count: totalClaimsCount })}</span>
      </div>
    </div>
  );
}
