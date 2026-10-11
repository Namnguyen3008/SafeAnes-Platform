"use client";

import React from "react";
import { Lock, FileCheck, CheckCircle2, AlertOctagon, ArrowRight } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function RecordApproval() {
  const { t } = useTranslation("uc02");
  const {
    selectClaim,
    totalBlockingIssues,
    canSignRecord,
    isRecordSigned,
    signedTimestamp,
    signRecord,
    claims,
  } = useClinicalReview();

  const handleReviewRemaining = () => {
    // Jump to first pending claim requiring review
    const pendingClaim = Object.values(claims).find(
      (c) => c.reviewStatus === "REQUIRES_REVIEW" || c.reviewStatus === "UNREVIEWED"
    );
    if (pendingClaim) {
      selectClaim(pendingClaim.id);
    }
  };

  return (
    <div className="bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header: Panel title 15–18px */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-1.5">
          <FileCheck className="w-3.5 h-3.5 text-safe-green" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("reviewRail.recordApproval")}
          </h3>
        </div>
        <span
          className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded-[2px] font-bold ${
            isRecordSigned
              ? "text-safe-green bg-safe-surface-secondary border border-safe-green/40"
              : "text-safe-yellow bg-safe-surface-secondary border border-safe-yellow/40"
          }`}
        >
          {isRecordSigned ? t("status.approvedLocked") : t("status.draft")}
        </span>
      </div>

      {/* Status Details Grid */}
      <div className="my-1.5 space-y-1 font-mono text-[10.5px]">
        <div className="flex justify-between items-center bg-safe-surface-secondary px-2 py-0.5 rounded-[2px] border border-safe-border-light">
          <span className="text-safe-text-muted">{t("reviewRail.recordStatus")}</span>
          <span className="text-safe-text font-bold">
            {isRecordSigned ? t("status.signedLocked") : t("status.draftStatus")}
          </span>
        </div>

        <div className="flex justify-between items-center bg-safe-surface-secondary px-2 py-0.5 rounded-[2px] border border-safe-border-light">
          <span className="text-safe-text-muted">{t("reviewRail.reviewer")}</span>
          <span className="text-safe-cyan font-semibold">{t("reviewRail.reviewerUnassigned")}</span>
        </div>

        <div className="flex justify-between items-center bg-safe-surface-secondary px-2 py-0.5 rounded-[2px] border border-safe-border-light">
          <span className="text-safe-text-muted">{t("reviewRail.blocking")}</span>
          <span
            className={`font-bold tabular-nums flex items-center gap-1 ${
              totalBlockingIssues > 0 ? "text-safe-red" : "text-safe-green"
            }`}
          >
            {totalBlockingIssues > 0 ? (
              <AlertOctagon className="w-3 h-3 text-safe-red" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-safe-green" />
            )}
            <span>{totalBlockingIssues}</span>
          </span>
        </div>
      </div>

      {/* Two Action Buttons: Review Remaining & Sign Record */}
      <div className="space-y-1 pt-0.5">
        <div className="grid grid-cols-2 gap-1">
          {/* Button 1: Review Remaining */}
          <button
            type="button"
            onClick={handleReviewRemaining}
            className="w-full bg-safe-surface-secondary hover:bg-safe-surface text-safe-text border border-safe-border font-mono text-[10.5px] font-medium py-1.5 px-2 rounded-[2px] flex items-center justify-center gap-1 transition-colors"
          >
            <span>{t("reviewRail.reviewRemaining")}</span>
            <ArrowRight className="w-3 h-3 text-safe-text-muted" />
          </button>

          {/* Button 2: Sign Record (Strictly disabled while blocking issues remain) */}
          <button
            type="button"
            disabled={!canSignRecord || isRecordSigned}
            onClick={signRecord}
            className={`w-full font-mono text-[10.5px] font-bold py-1.5 px-2 rounded-[2px] flex items-center justify-center gap-1 transition-colors ${
              canSignRecord && !isRecordSigned
                ? "bg-safe-blue hover:bg-safe-blue/80 text-safe-text border border-safe-cyan/60 cursor-pointer shadow-none"
                : "bg-safe-surface-secondary text-safe-text-muted/50 border border-safe-border-light cursor-not-allowed opacity-50"
            }`}
            title={
              totalBlockingIssues > 0
                ? t("reviewRail.signRecordDisabled", { count: totalBlockingIssues })
                : isRecordSigned
                ? t("reviewRail.lockedNotice")
                : !canSignRecord
                ? t("reviewRail.caseNotComplete")
                : t("reviewRail.signRecord")
            }
          >
            <Lock className="w-3 h-3" />
            <span>{isRecordSigned ? t("reviewRail.signed") : t("reviewRail.signRecord")}</span>
          </button>
        </div>

        {/* Audit footer explaining disabled state or showing signature */}
        <div className="text-[9px] font-mono text-center">
          {totalBlockingIssues > 0 ? (
            <span className="text-safe-red">
              {t("reviewRail.signRecordDisabled", { count: totalBlockingIssues })}
            </span>
          ) : isRecordSigned ? (
            <span className="text-safe-green">
              {t("reviewRail.signedBy", { timestamp: signedTimestamp ?? "—" })}
            </span>
          ) : !canSignRecord ? (
            <span className="text-safe-text-muted">
              {t("reviewRail.caseNotComplete")}
            </span>
          ) : (
            <span className="text-safe-green">
              {t("reviewRail.readyForSignature")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
