"use client";

import React from "react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function CaseReviewSummary() {
  const { t } = useTranslation("uc02");
  const { t: tCommon } = useTranslation("common");
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

  // Six spacious UC02 metrics inspired by 21st.dev KPI stat cards
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
      label: t("kpi.detectedEvents") || "Sự kiện phát hiện",
      shortLabel: "Sự kiện",
      unit: t("kpi.units.events") || "sự kiện",
      value: String(canonicalEventCount),
      min: "0",
      max: String(scaleFor(canonicalEventCount)),
      color: "var(--safe-cyan, #00E5FF)",
      percentage: percentOf(canonicalEventCount, scaleFor(canonicalEventCount)),
    },
    {
      id: "clinical_episodes",
      label: t("kpi.clinicalEpisodes") || "Đợt lâm sàng",
      shortLabel: "Đợt lâm sàng",
      unit: t("kpi.units.episodes") || "đợt",
      value: String(clinicalEpisodeCount),
      min: "0",
      max: String(scaleFor(clinicalEpisodeCount)),
      color: "var(--safe-blue, #2563EB)",
      percentage: percentOf(clinicalEpisodeCount, scaleFor(clinicalEpisodeCount)),
    },
    {
      id: "generated_claims",
      label: t("kpi.generatedClaims") || "Mệnh đề được tạo",
      shortLabel: "Mệnh đề tạo",
      unit: t("kpi.units.claims") || "mệnh đề",
      value: String(totalClaimsCount),
      min: "0",
      max: String(scaleFor(totalClaimsCount)),
      color: "var(--safe-text, #F4F7F8)",
      percentage: percentOf(totalClaimsCount, scaleFor(totalClaimsCount)),
    },
    {
      id: "verified_claims",
      label: t("kpi.verifiedClaims") || "Mệnh đề đã xác minh",
      shortLabel: "Đã xác minh",
      unit: t("kpi.units.grounded") || "có căn cứ",
      value: String(verifiedClaimsCount),
      min: "0",
      max: String(scaleFor(verifiedClaimsCount)),
      color: "var(--safe-green, #22C55E)",
      percentage: percentOf(verifiedClaimsCount, scaleFor(verifiedClaimsCount)),
    },
    {
      id: "requires_review",
      label: t("kpi.requiresReview") || "Cần xem xét",
      shortLabel: "Cần xem xét",
      unit: t("kpi.units.advisoryFlags") || "cờ cảnh báo",
      value: String(requiresReviewClaimsCount),
      min: "0",
      max: String(scaleFor(requiresReviewClaimsCount)),
      color: "var(--safe-yellow, #EAB308)",
      percentage: percentOf(requiresReviewClaimsCount, scaleFor(requiresReviewClaimsCount)),
    },
    {
      id: "unsupported_claims",
      label: t("kpi.unsupportedClaims") || "Mệnh đề thiếu căn cứ",
      shortLabel: "Thiếu căn cứ",
      unit: t("kpi.units.unlinked") || "chưa liên kết",
      value: String(errorMetrics.unsupportedClaims),
      min: "0",
      max: String(scaleFor(errorMetrics.unsupportedClaims)),
      color: "var(--safe-red, #EF4444)",
      percentage: percentOf(errorMetrics.unsupportedClaims, scaleFor(errorMetrics.unsupportedClaims)),
    },
  ];

  return (
    <section className="w-full bg-safe-surface border border-safe-border rounded-[3px] p-2.5 flex flex-col justify-between min-h-[148px] h-[148px] shrink-0 select-none shadow-xs">
      {/* 1. Top Header Bar: Patient Title, Case Badge, Completeness Bar, Review Status */}
      <div className="flex items-center justify-between pb-2 border-b border-safe-border gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-bold text-safe-text tracking-tight uppercase shrink-0">
            {tCommon("patientContext.title") || "Thông tin bệnh nhân"}
          </span>
          <span className="text-[11px] font-mono font-bold text-safe-cyan bg-safe-surface-secondary px-2 py-0.5 rounded-[2px] border border-safe-border shrink-0">
            {patient.caseId}
          </span>
          <span className="text-[10.5px] font-mono text-safe-text-muted bg-safe-bg px-2 py-0.5 rounded-[2px] border border-safe-border-light truncate hidden md:inline">
            OR 2 · {patient.ageSex} · Phân độ {patient.asaStatus}
          </span>
        </div>

        {/* Center Completeness & Right Review Status Badges */}
        <div className="flex items-center gap-3 shrink-0">
          {reviewProgressPercent !== undefined && (
            <div className="flex items-center gap-2 bg-safe-surface-secondary border border-safe-border-light rounded-[3px] px-2.5 py-1">
              <span className="text-[11px] text-safe-text-muted font-medium">
                {tCommon("patientContext.recordCompleteness") || "Mức độ hoàn thiện hồ sơ:"}
              </span>
              <div className="w-20 bg-safe-bg h-2 rounded-[2px] overflow-hidden border border-safe-border-light">
                <div
                  className="bg-safe-green h-full transition-all duration-300"
                  style={{ width: `${reviewProgressPercent}%` }}
                />
              </div>
              <span className="font-mono text-[11px] font-bold text-safe-green tabular-nums">
                {reviewProgressPercent}%
              </span>
            </div>
          )}

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-[11px] font-mono font-semibold shrink-0 ${
              isRecordSigned
                ? "bg-safe-surface-secondary border border-safe-green/50 text-safe-green"
                : "bg-safe-surface-secondary border border-safe-yellow/50 text-safe-yellow"
            }`}
          >
            {isRecordSigned ? (
              <span>{tCommon("patientContext.reviewApproved") || "Duyệt: Đã ký & Khóa"}</span>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-safe-yellow animate-pulse" />
                <span>{tCommon("patientContext.reviewInProgress") || "Duyệt: Đang thực hiện"}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Main Row: Left Demographics & Pre-op Clinical Context, Right 21st.dev KPI Stat Cards */}
      <div className="flex items-stretch gap-3 pt-2 min-h-0 flex-1">
        {/* Left: 3 Balanced Clinical Columns */}
        <div className="flex-1 grid grid-cols-3 gap-x-4 pr-3 border-r border-safe-border-light/60 text-[11.5px] leading-snug">
          {/* Col 1: Age/Sex & Weight */}
          <div className="flex flex-col justify-around gap-1">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.ageSex") || "Tuổi / Giới"}:</span>
              <span className="text-safe-text font-mono font-bold text-[12px]">{patient.ageSex}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.weight") || "Cân nặng"}:</span>
              <span className="text-safe-text font-mono font-bold text-[12px]">{patient.weightBmi}</span>
            </div>
          </div>

          {/* Col 2: ASA & Baseline Hemodynamics */}
          <div className="flex flex-col justify-around gap-1 px-2 border-r border-safe-border-light/40">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.asaStatus") || "Phân độ ASA"}:</span>
              <span className="text-safe-yellow font-bold font-mono text-[11px] bg-safe-yellow/15 px-1.5 py-0.5 rounded border border-safe-yellow/40">
                {patient.asaStatus}
              </span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.preopMap") || "MAP trước mổ"}:</span>
              <span className="text-safe-text font-mono font-bold text-[12px]">{patient.preopMap}</span>
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.baselineCi") || "CI nền"}:</span>
              <span className="text-safe-text font-mono font-bold text-[12px]">{patient.baselineCi}</span>
            </div>
          </div>

          {/* Col 3: Allergies, Comorbidities, Procedure */}
          <div className="flex flex-col justify-around gap-1 pl-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.allergies") || "Dị ứng"}:</span>
              <span className="text-safe-red font-bold truncate text-[11px]" title={patient.allergies}>
                {patient.allergies || "—"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.comorbidities") || "Bệnh đồng mắc"}:</span>
              <span className="text-safe-text font-medium truncate text-[11px]" title={patient.comorbidities}>
                {patient.comorbidities || "—"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-safe-text-muted text-[11px] shrink-0">{tCommon("patientContext.procedure") || "Phẫu thuật"}:</span>
              <span className="text-safe-cyan font-bold truncate text-[11px]" title={patient.procedure}>
                {patient.procedure}
              </span>
            </div>
          </div>
        </div>

        {/* Right: 6 KPI Clinical Stat Cards (Spacious 3x2 Grid inspired by 21st.dev) */}
        <div className="w-[440px] xl:w-[480px] 2xl:w-[520px] shrink-0 grid grid-cols-3 grid-rows-2 gap-2 h-full">
          {kpiMetrics.map((m) => (
            <div
              key={m.id}
              className="group bg-safe-surface-secondary/70 hover:bg-safe-surface-secondary border border-safe-border-light hover:border-safe-border rounded-[3px] px-2.5 py-1.5 flex flex-col justify-between transition-all"
              title={`${m.label}: ${m.value} ${m.unit} (Tối đa: ${m.max})`}
            >
              {/* Top line: Semantic dot + Label + Scale */}
              <div className="flex items-center justify-between gap-1 text-[10px] font-mono leading-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0 group-hover:scale-125 transition-transform"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="font-semibold text-safe-text-muted uppercase tracking-tight truncate">
                    {m.shortLabel || m.label}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-safe-text-muted/60 shrink-0">
                  /{m.max}
                </span>
              </div>

              {/* Value + Unit + Micro Bar */}
              <div className="flex items-end justify-between gap-1.5 mt-1">
                <div className="flex items-baseline gap-1 min-w-0">
                  <span
                    className="text-[19px] 2xl:text-[21px] font-bold font-mono tabular-nums leading-none tracking-tight"
                    style={{ color: m.color }}
                  >
                    {m.value}
                  </span>
                  <span className="text-[9.5px] font-mono text-safe-text-muted truncate pb-0.5">
                    {m.unit}
                  </span>
                </div>

                {/* 21st.dev Micro progress bar */}
                <div className="w-9 bg-safe-bg h-1.5 rounded-[1px] overflow-hidden border border-safe-border-light/40 shrink-0 mb-0.5">
                  <div
                    className="h-full rounded-[1px] transition-all duration-300"
                    style={{
                      width: `${Math.max(10, m.percentage)}%`,
                      backgroundColor: m.color,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
