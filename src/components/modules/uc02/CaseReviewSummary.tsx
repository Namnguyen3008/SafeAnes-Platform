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
      {/* Left 6-Card Metric Row (~65% width) */}
      <div className="flex-1 grid grid-cols-6 gap-2">
        {kpiMetrics.map((m) => (
          <div
            key={m.id}
            className="bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between relative overflow-hidden"
          >
            {/* Header label & unit */}
            <div className="text-center">
              <div className="min-h-[2.25em] text-[10px] font-bold text-safe-text tracking-wide leading-tight uppercase whitespace-normal break-words">
                {m.label}
              </div>
              <div className="text-[9.5px] text-safe-text-muted font-mono leading-none mt-0.5">
                {m.unit}
              </div>
            </div>

            {/* Semicircular Gauge Arc & Center Numeric */}
            <div className="relative flex flex-col items-center justify-center my-0.5">
              <div className="relative w-20 h-12 flex items-end justify-center">
                <svg className="w-20 h-12 overflow-visible" viewBox="0 0 80 44">
                  {/* Gauge background track */}
                  <path
                    d="M 8 40 A 32 32 0 0 1 72 40"
                    fill="none"
                    stroke="#0A1720"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                  />
                  {/* Gauge active value arc */}
                  <path
                    d="M 8 40 A 32 32 0 0 1 72 40"
                    fill="none"
                    stroke={m.color}
                    strokeWidth="5.5"
                    strokeDasharray="100"
                    strokeDashoffset={100 - (100 * m.percentage) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Center Numeric Value */}
                <div className="absolute inset-0 flex items-center justify-center pt-2">
                  <span
                    className="text-[30px] font-bold font-mono tabular-nums leading-none"
                    style={{ color: m.color }}
                  >
                    {m.value}
                  </span>
                </div>
              </div>
            </div>

            {/* Min / Max scale bounds */}
            <div className="flex justify-between items-center text-[9.5px] font-mono text-safe-text-muted px-1 pt-0.5 border-t border-safe-border-light">
              <span>{m.min}</span>
              <span>{m.max}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Right Patient Context & Review Completeness Panel (~35% width, 410px) */}
      <PatientContextSummary
        patient={patient}
        isRecordSigned={isRecordSigned}
        reviewProgressPercent={reviewProgressPercent}
        className="w-[410px] shrink-0"
      />
    </section>
  );
}
