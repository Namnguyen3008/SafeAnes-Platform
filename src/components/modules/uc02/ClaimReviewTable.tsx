"use client";

import React, { useMemo } from "react";
import { Clock } from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { ProvenanceStatus, ReviewStatus } from "@/types/uc02";
import { ProvenanceBadge, SeverityBadge } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

export function ClaimReviewTable() {
  const { claims, selectedClaimId, selectClaim, totalClaimsCount } =
    useClinicalReview();
  const { t } = useTranslation("uc02");

  const claimsList = useMemo(() => Object.values(claims), [claims]);

  const getValidationBadgeMeta = (c: (typeof claimsList)[0]) => {
    if (!c.validation.evidence) {
      return { label: t("header.fail"), severity: "FAIL" as const };
    }
    const allValid =
      c.validation.numeric &&
      c.validation.unit &&
      c.validation.temporal &&
      c.validation.terminology;

    if (allValid) {
      return { label: t("header.pass"), severity: "PASS" as const };
    }
    return { label: "WARN", severity: "WARN" as const };
  };

  const getReviewBadgeSeverity = (r: ReviewStatus) => {
    switch (r) {
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

  const getReviewLabel = (r: ReviewStatus) => {
    switch (r) {
      case "ACCEPTED":
        return t("status.accepted");
      case "EDITED":
        return t("status.edited");
      case "REJECTED":
        return t("status.rejected");
      case "REQUIRES_REVIEW":
        return t("actions.reviewShort");
      case "UNREVIEWED":
      default:
        return t("status.unreviewed");
    }
  };

  return (
    <div className="flex-1 min-w-0 bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between select-none">
      {/* Header: Panel title 15–18px */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-safe-cyan" />
          <h3 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("header.title")}
          </h3>
          <span className="text-[10px] font-mono text-safe-cyan bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-border">
            {totalClaimsCount} {t("header.claimsAudited")}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-safe-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-safe-cyan" />
            {t("table.synchronized")}
          </span>
        </div>
      </div>

      {/* Dense Clinical Workstation Table */}
      <div className="clinical-table-scroll clinical-table-sticky flex-1 min-w-0 overflow-auto my-1 border border-safe-border-light rounded-[2px] bg-safe-bg">
        <table className="min-w-[620px] w-full text-left font-mono text-[11px] border-collapse">
          {/* Table Header */}
          <thead className="bg-safe-surface-secondary text-safe-text-muted text-[10px] uppercase border-b border-safe-border z-10">
            <tr>
              <th className="py-1 px-2 font-semibold whitespace-nowrap">{t("table.time")}</th>
              <th className="py-1 px-2 font-semibold whitespace-nowrap">{t("table.section")}</th>
              <th className="py-1 px-2 font-semibold">{t("table.claim")}</th>
              <th className="py-1 px-1.5 text-center font-semibold whitespace-nowrap">{t("table.provenance")}</th>
              <th className="py-1 px-1.5 text-center font-semibold whitespace-nowrap">{t("reviewRail.deterministic")}</th>
              <th className="py-1 px-2 text-center font-semibold whitespace-nowrap">{t("table.statusShort")}</th>
            </tr>
          </thead>

          {/* Table Rows */}
          <tbody className="divide-y divide-safe-border-light/40">
            {claimsList.map((row) => {
              const isSelected = selectedClaimId === row.id;
              const val = getValidationBadgeMeta(row);
              const revSeverity = getReviewBadgeSeverity(row.reviewStatus);
              const sectionName = t(`recordSections.${row.section}`);
              const timeDisplay = row.clinicalTime.end
                ? `${row.clinicalTime.start}–${row.clinicalTime.end}`
                : row.clinicalTime.start;

              return (
                <tr
                  key={row.id}
                  onClick={() => selectClaim(row.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-safe-surface-secondary text-safe-text border-l-2 border-safe-cyan"
                      : "hover:bg-safe-surface-secondary/60 text-safe-text/90"
                  }`}
                >
                  {/* Column 1: Time */}
                  <td className="py-1 px-2 tabular-nums text-safe-cyan font-semibold whitespace-nowrap">
                    {timeDisplay}
                  </td>

                  {/* Column 2: Section */}
                  <td className="py-1 px-2 text-safe-text-muted whitespace-nowrap">
                    {sectionName}
                  </td>

                  {/* Column 3: Claim text */}
                  <td className="py-1 px-2 text-safe-text font-medium leading-tight max-w-[280px] truncate" title={row.text}>
                    {row.text}
                  </td>

                  {/* Column 4: Provenance */}
                  <td className="py-1 px-1.5 text-center whitespace-nowrap">
                    <ProvenanceBadge provenance={row.provenance} size="xs" />
                  </td>

                  {/* Column 5: Validation */}
                  <td className="py-1 px-1.5 text-center whitespace-nowrap">
                    <SeverityBadge severity={val.severity} label={val.label} size="xs" />
                  </td>

                  {/* Column 6: Review */}
                  <td className="py-1 px-2 text-center whitespace-nowrap">
                    <SeverityBadge severity={revSeverity} label={getReviewLabel(row.reviewStatus)} size="xs" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Info Strip */}
      <div className="pt-0.5 border-t border-safe-border-light flex items-center justify-between text-[9.5px] font-mono text-safe-text-muted shrink-0">
        <span>{t("table.hint")}</span>
        <span className="text-safe-cyan">{t("table.expandSection")}</span>
      </div>
    </div>
  );
}
