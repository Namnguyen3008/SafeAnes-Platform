"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  SearchCheck,
  Columns2,
} from "lucide-react";
import { StructuredAnaesthesiaRecord } from "./StructuredAnaesthesiaRecord";
import { EvidenceInspector } from "./EvidenceInspector";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { useTranslation } from "@/context/LocalizationContext";

interface RecordReviewColumnProps {
  className?: string;
}

export function RecordReviewColumn({ className = "" }: RecordReviewColumnProps) {
  const { t } = useTranslation("uc02");
  const { selectedClaimId, claims, totalClaimsCount } = useClinicalReview();
  const [activeTab, setActiveTab] = useState<"record" | "evidence">("record");
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);

  // Automatically switch tab or highlight when a claim is selected
  useEffect(() => {
    if (selectedClaimId && claims[selectedClaimId]) {
      // If user selected a claim, make evidence inspector easily accessible
      // but do not forcefully hide record unless user is ready
    }
  }, [selectedClaimId, claims]);

  const selectedClaim = selectedClaimId ? claims[selectedClaimId] : null;

  return (
    <div
      className={`h-full min-h-0 min-w-0 flex flex-col bg-safe-surface border border-safe-border rounded-[2px] overflow-hidden select-none shadow-sm ${className}`}
    >
      {/* 21st.dev Card Tabs Header Bar */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-safe-surface-secondary border-b border-safe-border shrink-0 gap-2">
        {/* Tab Triggers */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setIsSplitMode(false);
              setActiveTab("record");
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-[11px] font-mono font-semibold transition-all cursor-pointer ${
              !isSplitMode && activeTab === "record"
                ? "bg-safe-bg text-safe-cyan border border-safe-cyan/60 shadow-sm"
                : "text-safe-text-muted hover:text-safe-text hover:bg-safe-surface border border-transparent"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-safe-cyan" />
            <span>{t("header.title") || "Hồ sơ gây mê"}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-safe-surface-secondary text-safe-cyan border border-safe-border-light">
              {totalClaimsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSplitMode(false);
              setActiveTab("evidence");
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-[11px] font-mono font-semibold transition-all cursor-pointer ${
              !isSplitMode && activeTab === "evidence"
                ? "bg-safe-bg text-safe-cyan border border-safe-cyan/60 shadow-sm"
                : "text-safe-text-muted hover:text-safe-text hover:bg-safe-surface border border-transparent"
            }`}
          >
            <SearchCheck className="w-3.5 h-3.5 text-safe-yellow" />
            <span>{t("evidence.title") || "Kiểm tra bằng chứng"}</span>
            {selectedClaim && (
              <span className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-safe-yellow/20 text-safe-yellow border border-safe-yellow/40">
                {selectedClaim.id.replace("claim-", "")}
              </span>
            )}
          </button>
        </div>

        {/* View Mode Actions (Split View / Full View) */}
        <div className="flex items-center gap-1 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setIsSplitMode(!isSplitMode)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-[2px] border transition-colors cursor-pointer ${
              isSplitMode
                ? "bg-safe-cyan/20 border-safe-cyan text-safe-cyan font-bold"
                : "bg-safe-surface border-safe-border-light text-safe-text-muted hover:text-safe-text hover:bg-safe-surface-secondary"
            }`}
            title={isSplitMode ? "Chuyển sang chế độ xem từng Thẻ" : "Chia đôi màn hình xem cùng lúc Hồ sơ và Bằng chứng"}
          >
            <Columns2 className="w-3 h-3 text-safe-cyan" />
            <span>{isSplitMode ? "Chia đôi: BẬT" : "Chia đôi"}</span>
          </button>
        </div>
      </div>

      {/* Body Area */}
      {isSplitMode ? (
        /* Split View Mode: Stacks Record and Evidence with 60/40 ratio */
        <div className="flex-1 min-h-0 flex flex-col gap-1 p-1 overflow-hidden">
          <section className="flex-[1.5] min-h-0 overflow-hidden" aria-label="Structured anaesthesia record">
            <StructuredAnaesthesiaRecord />
          </section>
          <section className="flex-1 min-h-0 overflow-hidden border-t border-safe-border-light pt-1" aria-label="Evidence inspector">
            <EvidenceInspector />
          </section>
        </div>
      ) : (
        /* Full Tabbed View Mode: Each component gets 100% of height */
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {/* Record Tab (Always rendered to preserve state and fast switching) */}
          <section
            className={`h-full w-full min-h-0 overflow-hidden ${
              activeTab === "record" ? "block" : "hidden"
            }`}
            aria-label="Structured anaesthesia record"
          >
            <StructuredAnaesthesiaRecord />
          </section>

          {/* Evidence Tab (Always in DOM for tests with data-simulation-demo-target) */}
          <section
            className={`h-full w-full min-h-0 overflow-hidden ${
              activeTab === "evidence" ? "block" : "hidden"
            }`}
            aria-label="Evidence inspector"
          >
            <EvidenceInspector />
          </section>
        </div>
      )}
    </div>
  );
}
