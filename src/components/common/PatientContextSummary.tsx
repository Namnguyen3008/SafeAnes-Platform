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
      className={`bg-safe-surface border border-safe-border rounded-[2px] p-1.5 px-2.5 flex flex-col justify-between ${className}`}
    >
      {/* Top Header with Review Status Badges */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-safe-text">
            {t("patientContext.title")}
          </span>
          <span className="text-[10px] font-mono text-safe-cyan bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-border">
            {patient.caseId}
          </span>
        </div>

        {/* Clinician Review: In Progress / Locked badge */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold ${
            isRecordSigned
              ? "bg-safe-surface-secondary border border-safe-green/50 text-safe-green"
              : "bg-safe-surface-secondary border border-safe-yellow/50 text-safe-yellow"
          }`}
        >
          {isRecordSigned ? (
            <>
              <Lock className="w-3 h-3 text-safe-green" />
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

      {/* Record Completeness Strip (if provided) */}
      {reviewProgressPercent !== undefined && (
        <div className="flex items-center justify-between bg-safe-surface-secondary border border-safe-border-light rounded-[2px] px-2 py-0.5 my-0.5">
          <div className="flex items-center gap-1.5 text-[10.5px] text-safe-text-muted">
            <CheckCircle2 className="w-3 h-3 text-safe-green" />
            <span>{t("patientContext.recordCompleteness")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 bg-safe-surface h-1.5 rounded-none overflow-hidden border border-safe-border-light">
              <div
                className="bg-safe-green h-full transition-all duration-300"
                style={{ width: `${reviewProgressPercent}%` }}
              />
            </div>
            <span className="font-mono text-[11.5px] font-bold text-safe-green tabular-nums">
              {reviewProgressPercent}%
            </span>
          </div>
        </div>
      )}

      {/* 2-Column Clinical Metadata Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] leading-snug">
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.ageSex")}</span>
          <span className="text-safe-text font-mono font-medium truncate">{patient.ageSex}</span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.allergies")}</span>
          <span className="text-safe-red font-medium truncate max-w-[125px]" title={patient.allergies}>
            {patient.allergies}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.weight")}</span>
          <span className="text-safe-text font-mono font-medium truncate">{patient.weightBmi}</span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.comorbidities")}</span>
          <span className="text-safe-text truncate max-w-[125px]" title={patient.comorbidities}>
            {patient.comorbidities}
          </span>
        </div>

        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.asaStatus")}</span>
          <span className="text-safe-yellow font-semibold font-mono">
            {patient.asaStatus}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.preopMap")}</span>
          <span className="text-safe-text font-mono font-medium">{patient.preopMap}</span>
        </div>

        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.procedure")}</span>
          <span className="text-safe-text truncate max-w-[125px]" title={patient.procedure}>
            {patient.procedure}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-1">
          <span className="text-safe-text-muted shrink-0">{t("patientContext.baselineCi")}</span>
          <span className="text-safe-text font-mono font-medium">{patient.baselineCi}</span>
        </div>
      </div>
    </div>
  );
}

