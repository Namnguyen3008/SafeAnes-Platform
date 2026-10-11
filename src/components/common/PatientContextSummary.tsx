"use client";

import React from "react";
import { PatientDemographics } from "@/types/uc02";
import { CheckCircle2, Lock } from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";

interface PatientContextSummaryProps {
  patient: PatientDemographics;
  isRecordSigned?: boolean;
  reviewProgressPercent?: number;
  className?: string;
}

export function PatientContextSummary({
  patient,
  isRecordSigned = false,
  reviewProgressPercent,
  className = "",
}: PatientContextSummaryProps) {
  const { t } = useTranslation("common");

  return (
    <div
      className={`bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between ${className}`}
    >
      {/* Top Header with Patient Identity, Completeness bar, and Review Status */}
      <div className="flex items-center justify-between pb-1.5 border-b border-safe-border gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[14px] font-bold text-safe-text tracking-tight uppercase">
            {t("patientContext.title")}
          </span>
          <span className="text-[11px] font-mono font-bold text-safe-cyan bg-safe-surface-secondary px-2 py-0.5 rounded-[2px] border border-safe-border">
            {patient.caseId}
          </span>
        </div>

        {/* Record Completeness Progress in Header */}
        {reviewProgressPercent !== undefined && (
          <div className="flex items-center gap-2 bg-safe-surface-secondary border border-safe-border-light rounded-[2px] px-2.5 py-0.5 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-safe-green shrink-0" />
            <span className="text-[11px] text-safe-text-muted font-medium">
              {t("patientContext.recordCompleteness")}:
            </span>
            <div className="w-20 bg-safe-surface h-1.5 rounded-none overflow-hidden border border-safe-border-light">
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

        {/* Clinician Review: In Progress / Locked badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-[2px] text-[10.5px] font-mono font-semibold shrink-0 ${
            isRecordSigned
              ? "bg-safe-surface-secondary border border-safe-green/50 text-safe-green"
              : "bg-safe-surface-secondary border border-safe-yellow/50 text-safe-yellow"
          }`}
        >
          {isRecordSigned ? (
            <>
              <Lock className="w-3.5 h-3.5 text-safe-green" />
              <span>{t("patientContext.reviewApproved")}</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-safe-yellow animate-pulse" />
              <span>{t("patientContext.reviewInProgress")}</span>
            </>
          )}
        </div>
      </div>

      {/* Spacious 3-Column Clinical Metadata Grid */}
      <div className="grid grid-cols-[1fr_1.1fr_1.8fr] gap-x-4 gap-y-1.5 pt-1.5 text-[12px] leading-snug">
        {/* Column 1: Demographics & Anthropometry */}
        <div className="flex flex-col justify-around gap-1.5 pr-3 border-r border-safe-border-light/50">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.ageSex")}:</span>
            <span className="text-safe-text font-mono font-bold text-[12px]">{patient.ageSex}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.weight")}:</span>
            <span className="text-safe-text font-mono font-bold text-[12px]">{patient.weightBmi}</span>
          </div>
        </div>

        {/* Column 2: Hemodynamics & Risk Stratification */}
        <div className="flex flex-col justify-around gap-1 px-3 border-r border-safe-border-light/50">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.asaStatus")}:</span>
            <span className="text-safe-yellow font-bold font-mono text-[11.5px] bg-safe-yellow/10 px-2 py-0.2 rounded border border-safe-yellow/40">
              {patient.asaStatus}
            </span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.preopMap")}:</span>
            <span className="text-safe-text font-mono font-bold text-[12px]">{patient.preopMap}</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.baselineCi")}:</span>
            <span className="text-safe-text font-mono font-bold text-[12px]">{patient.baselineCi}</span>
          </div>
        </div>

        {/* Column 3: Allergies, Comorbidities & Surgical Procedure */}
        <div className="flex flex-col justify-around gap-1 pl-2 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.allergies")}:</span>
            <span className="text-safe-red font-bold truncate text-[11.5px]" title={patient.allergies}>
              {patient.allergies}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.comorbidities")}:</span>
            <span className="text-safe-text font-medium truncate text-[11.5px]" title={patient.comorbidities}>
              {patient.comorbidities}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-safe-text-muted text-[11px] shrink-0">{t("patientContext.procedure")}:</span>
            <span className="text-safe-cyan font-bold truncate text-[11.5px]" title={patient.procedure}>
              {patient.procedure}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

