"use client";

import React from "react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { PatientContextSummary } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

export function CaseReviewSummary() {
  const { t } = useTranslation("uc02");
  const {
    patient,
    totalClaimsCount,
    acceptedClaimsCount,
    editedClaimsCount,
    requiresReviewClaimsCount,
    canonicalEventCount,
    clinicalEpisodeCount,
    errorMetrics,
    reviewProgressPercent,
    isRecordSigned,
  } = useClinicalReview();
  const verifiedClaimsCount = acceptedClaimsCount + editedClaimsCount;
  const scaleFor = (value: number) => Math.max(5, Math.ceil(value / 5) * 5);
  const percentOf = (value: number, max: number) => max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0;

  // Six compact UC02 metrics
  // Semantic colors:
  // - Events: cyan (#00E5FF)
  // - Episodes: blue (#2563EB)
  // - Generated: white (#F4F7F8)
  // - Verified: green (#22C55E)
  // - Requires Review: yellow (#EAB308)
  // - Unsupported: red (#EF4444)
  const kpiMetrics = [
    {
      id: "detected_events",
      label: t("kpi.detectedEvents"),
      unit: t("kpi.units.events"),
      value: String(canonicalEventCount),
      min: "0",
      max: String(scaleFor(canonicalEventCount)),
      color: "var(--safe-cyan, #00E5FF)",
      percentage: percentOf(canonicalEventCount, scaleFor(canonicalEventCount)),
    },
    {
      id: "clinical_episodes",
      label: t("kpi.clinicalEpisodes"),
      unit: t("kpi.units.episodes"),
      value: String(clinicalEpisodeCount),
      min: "0",
      max: String(scaleFor(clinicalEpisodeCount)),
      color: "var(--safe-blue, #2563EB)",
      percentage: percentOf(clinicalEpisodeCount, scaleFor(clinicalEpisodeCount)),
    },
    {
      id: "generated_claims",
      label: t("kpi.generatedClaims"),
      unit: t("kpi.units.claims"),
      value: String(totalClaimsCount),
      min: "0",
      max: String(scaleFor(totalClaimsCount)),
      color: "var(--safe-text, #F4F7F8)",
      percentage: percentOf(totalClaimsCount, scaleFor(totalClaimsCount)),
    },
    {
      id: "verified_claims",
      label: t("kpi.verifiedClaims"),
      unit: t("kpi.units.grounded"),
      value: String(verifiedClaimsCount),
      min: "0",
      max: String(scaleFor(verifiedClaimsCount)),
      color: "var(--safe-green, #22C55E)",
      percentage: percentOf(verifiedClaimsCount, scaleFor(verifiedClaimsCount)),
    },
    {
      id: "requires_review",
      label: t("kpi.requiresReview"),
      unit: t("kpi.units.advisoryFlags"),
      value: String(requiresReviewClaimsCount),
      min: "0",
      max: String(scaleFor(requiresReviewClaimsCount)),
      color: "var(--safe-yellow, #EAB308)",
      percentage: percentOf(requiresReviewClaimsCount, scaleFor(requiresReviewClaimsCount)),
    },
    {
      id: "unsupported_claims",
      label: t("kpi.unsupportedClaims"),
      unit: t("kpi.units.unlinked"),
      value: String(errorMetrics.unsupportedClaims),
      min: "0",
      max: String(scaleFor(errorMetrics.unsupportedClaims)),
      color: "var(--safe-red, #EF4444)",
      percentage: percentOf(errorMetrics.unsupportedClaims, scaleFor(errorMetrics.unsupportedClaims)),
    },
  ];

  return (
    <section className="w-full flex gap-2 h-[142px] shrink-0 select-none">
      {/* Left Patient Context & Review Completeness Panel (Prime position, fluid width) */}
      <PatientContextSummary
        patient={patient}
        isRecordSigned={isRecordSigned}
        reviewProgressPercent={reviewProgressPercent}
        className="flex-1 min-w-[500px]"
      />

      {/* Right Compact 6-Card Metric Grid (3x2, 440px width) */}
      <div className="w-[440px] shrink-0 grid grid-cols-3 grid-rows-2 gap-1.5 h-full">
        {kpiMetrics.map((m) => (
          <div
            key={m.id}
            className="bg-safe-surface border border-safe-border rounded-[2px] p-1.5 flex flex-col justify-between relative overflow-hidden"
          >
            {/* Header label & unit */}
            <div className="flex items-center justify-between gap-1 leading-none">
              <span className="text-[10px] font-bold text-safe-text tracking-tight uppercase truncate" title={m.label}>
                {m.label}
              </span>
              <span className="text-[8.5px] text-safe-text-muted font-mono shrink-0">
                {m.unit}
              </span>
            </div>

            {/* Numeric & Mini Bar */}
            <div className="flex items-baseline justify-between my-0.5">
              <span
                className="text-[22px] font-bold font-mono tabular-nums leading-none"
                style={{ color: m.color }}
              >
                {m.value}
              </span>
              <div className="flex items-center gap-1">
                <div className="w-12 bg-safe-surface-secondary h-1.5 rounded-none overflow-hidden border border-safe-border-light">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${m.percentage}%`, backgroundColor: m.color }}
                  />
                </div>
                <span className="text-[8.5px] font-mono text-safe-text-muted">{m.max}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
