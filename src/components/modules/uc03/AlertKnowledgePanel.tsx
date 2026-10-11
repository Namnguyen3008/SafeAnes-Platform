"use client";

import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface AlertKnowledgePanelProps {
  className?: string;
}

export function AlertKnowledgePanel({
  className = "",
}: AlertKnowledgePanelProps) {
  const { t } = useTranslation("uc03");
  const { setIsEvidenceOpen, activeDemoAlert } = useMedication();
  const demoRule = activeDemoAlert?.rule;

  return (
      <div className={`px-2 py-1 space-y-1 select-none ${className}`}>
        <div className="text-[14px] font-semibold text-[#F3F6F7] tracking-wide">
          {t("alerts.sourceKnowledgeTitle")}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[10.5px] leading-tight">
          <span className="text-[#A6B0B8]">{t("knowledge.ruleName")}</span>
          <span className="font-mono font-medium text-[#F3F6F7] text-right">{demoRule?.id ?? "—"}</span>
          <span className="text-[#A6B0B8]">{t("knowledge.version")}</span>
          <span className="font-mono font-medium text-[#F3F6F7] text-right">{demoRule?.version ?? "—"}</span>
          <span className="text-[#A6B0B8]">{t("simulation.evidenceSource")}</span>
          <span className="min-w-0 text-right text-[#F3F6F7] break-words">{demoRule?.evidenceSource ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[rgba(50,150,205,0.20)] pt-1">
          <span className="text-[9.5px] font-semibold text-[#FFD828]">{t("simulation.notClinicallyValidated")}</span>
          <button
            type="button"
            onClick={() => setIsEvidenceOpen(true)}
            className="shrink-0 border border-[#19BDF2]/60 text-[#19BDF2] px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] hover:bg-[#19BDF2]/10"
          >
            {t("simulation.evidence")}
          </button>
        </div>
      </div>
  );
}
