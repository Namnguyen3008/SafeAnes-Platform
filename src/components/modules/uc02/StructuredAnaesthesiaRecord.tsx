"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  FileText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { RECORD_SECTIONS } from "@/config/uc02RecordReview";
import { ClinicalClaim, RecordSectionId } from "@/types/uc02";
import { ClinicalClaimRow } from "./ClinicalClaimRow";
import { useTranslation } from "@/context/LocalizationContext";

export function StructuredAnaesthesiaRecord() {
  const { t } = useTranslation("uc02");
  const { claims, selectedClaimId, totalClaimsCount } = useClinicalReview();

  // Group claims by section
  const claimsBySection = useMemo(() => {
    const map = new Map<RecordSectionId, ClinicalClaim[]>();
    for (const sec of RECORD_SECTIONS) {
      map.set(sec.id, []);
    }
    for (const c of Object.values(claims)) {
      const list = map.get(c.section);
      if (list) list.push(c);
    }
    return map;
  }, [claims]);

  // Which sections are expanded. Default key sections (Hemodynamics, Medications, Airway, Major Events) open
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    hemodynamics: true,
    medications: true,
    airway: true,
    patient_context: false,
    pre_induction: false,
    induction: true,
    maintenance: false,
    ventilation: false,
    fluids_blood: false,
    procedures: false,
    major_events: true,
    emergence: false,
    recovery_transfer: false,
  });

  // Automatically expand section if a claim within it is selected
  useEffect(() => {
    if (selectedClaimId && claims[selectedClaimId]) {
      const targetSec = claims[selectedClaimId].section;
      setExpandedSections((prev) => ({
        ...prev,
        [targetSec]: true,
      }));
    }
  }, [selectedClaimId, claims]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const allOpen: Record<string, boolean> = {};
    RECORD_SECTIONS.forEach((s) => (allOpen[s.id] = true));
    setExpandedSections(allOpen);
  };

  const handleCollapseAll = () => {
    const allClosed: Record<string, boolean> = {};
    RECORD_SECTIONS.forEach((s) => (allClosed[s.id] = false));
    setExpandedSections(allClosed);
  };

  return (
    <div className="h-full min-h-0 min-w-0 flex-1 bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between overflow-hidden select-none">
      {/* 1. Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pb-1.5 border-b border-safe-border shrink-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FileText className="w-4 h-4 text-safe-cyan" />
          <h2 className="text-[15px] font-semibold text-safe-text tracking-tight">
            {t("header.title")}
          </h2>
          <span className="text-[10px] font-mono text-safe-cyan bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-border">
            {t("table.atomicClaims", { count: totalClaimsCount })}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <button
            type="button"
            onClick={handleExpandAll}
            className="text-safe-text-muted hover:text-safe-text px-1.5 py-0.5 rounded-[2px] bg-safe-surface-secondary border border-safe-border-light transition-colors"
          >
            {t("actions.expand")}
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="text-safe-text-muted hover:text-safe-text px-1.5 py-0.5 rounded-[2px] bg-safe-surface-secondary border border-safe-border-light transition-colors"
          >
            {t("actions.collapse")}
          </button>
        </div>
      </div>

      {/* 2. Compact Expandable Sections (13 Clinical Sections) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain my-1.5 pr-1 space-y-1.5">
        {RECORD_SECTIONS.map((sec) => {
          const secClaims = claimsBySection.get(sec.id) || [];
          const isOpen = !!expandedSections[sec.id];
          const hasSelectedClaim = secClaims.some((c) => c.id === selectedClaimId);

          return (
            <div
              key={sec.id}
              className={`border rounded-[2px] transition-colors ${
                hasSelectedClaim
                  ? "border-safe-cyan/70 bg-safe-surface-secondary"
                  : "border-safe-border-light bg-safe-surface"
              }`}
            >
              {/* Section Header Accordion Bar */}
              <button
                type="button"
                onClick={() => toggleSection(sec.id)}
                className="w-full px-2 py-1.5 flex items-center justify-between text-left hover:bg-safe-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-safe-cyan shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-safe-text-muted shrink-0" />
                  )}
                  <span
                    className={`text-[13px] font-bold tracking-tight ${
                      hasSelectedClaim ? "text-safe-cyan" : "text-safe-text"
                    }`}
                  >
                    {t(`recordSections.${sec.id}`)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-mono font-medium text-safe-text-muted bg-safe-bg px-1.5 py-0.2 rounded-[2px] border border-safe-border-light">
                    {t("table.claimsCount", { count: secClaims.length })}
                  </span>
                </div>
              </button>

              {/* Collapsible Claim Rows List */}
              {isOpen && (
                <div className="p-1.5 pt-0.5 space-y-1 border-t border-safe-border-light/60 bg-safe-bg/40">
                  {secClaims.length === 0 ? (
                    <div className="text-[11px] text-safe-text-muted italic p-1.5 font-mono">
                      {t("table.noClaimsSection")}
                    </div>
                  ) : (
                    secClaims.map((claim) => (
                      <ClinicalClaimRow key={claim.id} claim={claim} />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 3. Footer Audit Notice */}
      <div className="pt-1 border-t border-safe-border flex items-center justify-between text-[10px] font-mono text-safe-text-muted shrink-0">
        <span>{t("table.hint")}</span>
        <span className="text-safe-cyan font-semibold">
          {t("header.sectionsActive", { count: 13 })}
        </span>
      </div>
    </div>
  );
}
