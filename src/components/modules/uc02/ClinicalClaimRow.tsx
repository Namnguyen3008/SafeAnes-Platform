"use client";

import React from "react";
import { ClinicalClaim } from "@/types/uc02";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { Link2 } from "lucide-react";
import { ProvenanceBadge, SeverityBadge } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

interface ClinicalClaimRowProps {
  claim: ClinicalClaim;
}

export function ClinicalClaimRow({ claim }: ClinicalClaimRowProps) {
  const { t } = useTranslation("uc02");
  const { selectedClaimId, selectClaim } = useClinicalReview();
  const isSelected = selectedClaimId === claim.id;

  // Validation state badge text & severity
  const isAllValid =
    claim.validation.numeric &&
    claim.validation.unit &&
    claim.validation.temporal &&
    claim.validation.evidence &&
    claim.validation.terminology;

  const valStateText = !claim.validation.evidence
    ? t("status.requiresReview")
    : isAllValid
    ? t("status.verified")
    : t("status.warning");

  const valSeverity =
    !claim.validation.evidence
      ? ("REQUIRES_REVIEW" as const)
      : isAllValid
      ? ("PASS" as const)
      : ("FAIL" as const);

  const getReviewSeverity = () => {
    switch (claim.reviewStatus) {
      case "ACCEPTED":
        return "ACCEPTED" as const;
      case "EDITED":
        return "EDITED" as const;
      case "REJECTED":
        return "REJECTED" as const;
      case "REQUIRES_REVIEW":
        return "REQUIRES_REVIEW" as const;
      case "UNREVIEWED":
      default:
        return "WARNING" as const;
    }
  };

  const getReviewLabel = () => {
    switch (claim.reviewStatus) {
      case "ACCEPTED":
        return t("status.accepted");
      case "EDITED":
        return t("status.edited");
      case "REJECTED":
        return t("status.rejected");
      case "REQUIRES_REVIEW":
        return t("status.requiresReview");
      case "UNREVIEWED":
      default:
        return t("status.unreviewed");
    }
  };

  const timeDisplay = claim.clinicalTime.end
    ? `${claim.clinicalTime.start}–${claim.clinicalTime.end}`
    : claim.clinicalTime.start;

  return (
    <div
      onClick={() => selectClaim(claim.id)}
      className={`p-2 rounded-[2px] transition-colors cursor-pointer select-none text-[12px] flex flex-col gap-1 ${
        isSelected
          ? "bg-safe-surface-secondary border border-safe-cyan shadow-sm"
          : "bg-safe-surface border border-safe-border-light hover:border-safe-border hover:bg-safe-surface-secondary/70"
      }`}
    >
      {/* Top Meta Line: Time, Provenance Badge, Evidence Count, Validation, Review State */}
      <div className="flex items-center justify-between gap-1 text-[10px] font-mono leading-none">
        <div className="flex items-center gap-1.5">
          {/* Clinical Time */}
          <span className="text-safe-cyan font-semibold tabular-nums">
            {timeDisplay}
          </span>

          <span className="text-safe-border">•</span>

          {/* Provenance Badge */}
          <ProvenanceBadge provenance={claim.provenance} size="xs" />

          {/* Evidence Count */}
          <span className="flex items-center gap-0.5 text-safe-text-muted bg-safe-surface-secondary px-1 py-0.2 rounded-[2px] border border-safe-border-light">
            <Link2 className="w-2.5 h-2.5 text-safe-cyan" />
            <span>{t("evidence.evidenceCount", { count: claim.evidenceRefs.length })}</span>
          </span>
        </div>

        {/* Validation & Clinician Review Badges */}
        <div className="flex items-center gap-1.5">
          {/* Validation State */}
          <SeverityBadge
            severity={valSeverity}
            label={valStateText}
            size="xs"
          />

          {/* Clinician Review State */}
          <SeverityBadge
            severity={getReviewSeverity()}
            label={getReviewLabel()}
            size="xs"
          />
        </div>
      </div>

      {/* Atomic Clinical Statement: 13–15px */}
      <div
        className={`text-[13.5px] font-mono leading-tight tracking-tight ${
          isSelected ? "text-safe-text font-semibold" : "text-safe-text/90"
        }`}
      >
        {claim.text}
      </div>
    </div>
  );
}
