"use client";

import React from "react";
import { AlertCircle, Edit3, X, Eye } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

export function CurrentReviewIssue() {
  const { t } = useTranslation("uc02");
  const { claims, selectClaim, editClaim, rejectClaim } = useClinicalReview();

  const issueClaim = Object.values(claims).find((claim) => claim.reviewStatus === "REQUIRES_REVIEW");

  const handleViewEvidence = () => {
    if (issueClaim) selectClaim(issueClaim.id);
  };

  const handleRejectClaim = () => {
    if (issueClaim) rejectClaim(issueClaim.id, "Incorrect interpretation");
  };

  const handleEditClaim = () => {
    if (!issueClaim) return;
    editClaim(issueClaim.id, {
      text: t("reviewRail.temporalAssociationEdit"),
      terminology: t("reviewRail.temporalAssociationTerm"),
    });
  };

  return (
    <div className="bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header: Panel title 15–18px */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-safe-red" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("reviewRail.currentIssue")}
          </h3>
        </div>
        <span
          className={`text-[9.5px] font-mono px-1.5 py-0.2 rounded-[2px] font-bold ${
            issueClaim
              ? "text-safe-red bg-safe-surface-secondary border border-safe-red/40"
              : "text-safe-text-muted bg-safe-surface-secondary border border-safe-border-light"
          }`}
        >
          {issueClaim ? t("reviewRail.highPriority") : t("reviewRail.nonePending")}
        </span>
      </div>

      {/* Main Issue Body */}
      {!issueClaim ? (
        <div className="my-1.5 bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-2 text-[11px] text-safe-text-muted font-mono">
          {t("reviewRail.noCurrentIssue")}
        </div>
      ) : (
        <div className="my-1.5 space-y-1.5">
          {/* Issue Title & Claim Box */}
          <div className="bg-safe-surface-secondary border border-safe-red/40 rounded-[2px] p-1.5">
            <div className="text-[10px] font-mono text-safe-red font-bold uppercase mb-0.5">
              {t("reviewRail.requiresReviewClaim")}
            </div>
            <div className="text-[13px] font-mono text-safe-text font-semibold leading-tight">
              &quot;{issueClaim?.text}&quot;
            </div>
          </div>

          {/* Reason Box */}
          <div className="bg-safe-bg border border-safe-border-light rounded-[2px] p-1.5 text-[11px] font-mono text-safe-text-muted">
            <span className="text-safe-yellow font-bold block text-[10px] uppercase">
              {t("reviewRail.reason")}
            </span>
            <p className="text-safe-text text-[11px] leading-snug">
              {t("reviewRail.temporalOverlapNotice")}
            </p>
          </div>

          {/* Action Buttons: Edit Claim, Reject Claim, View Evidence */}
          <div className="grid grid-cols-3 gap-1 pt-0.5">
            <button
              type="button"
              onClick={handleEditClaim}
              className="bg-safe-surface-secondary hover:bg-safe-surface text-safe-cyan border border-safe-border font-mono text-[10.5px] font-bold py-1 px-1.5 rounded-[2px] flex items-center justify-center gap-1 transition-colors"
            >
              <Edit3 className="w-3 h-3 text-safe-cyan" />
              <span>{t("actions.editClaim")}</span>
            </button>

            <button
              type="button"
              onClick={handleRejectClaim}
              className="bg-safe-surface-secondary hover:bg-safe-red/20 text-safe-red border border-safe-red/40 font-mono text-[10.5px] font-bold py-1 px-1.5 rounded-[2px] flex items-center justify-center gap-1 transition-colors"
            >
              <X className="w-3 h-3 text-safe-red" />
              <span>{t("actions.rejectClaim")}</span>
            </button>

            <button
              type="button"
              onClick={handleViewEvidence}
              className="bg-safe-surface-secondary hover:bg-safe-surface text-safe-text border border-safe-border font-mono text-[10.5px] font-medium py-1 px-1.5 rounded-[2px] flex items-center justify-center gap-1 transition-colors"
            >
              <Eye className="w-3 h-3 text-safe-text-muted" />
              <span>{t("actions.viewEvidence")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
