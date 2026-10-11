"use client";

import React, { useState } from "react";
import { CheckCircle2, Navigation, AlertTriangle } from "lucide-react";
import { ClinicalModal } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SituationAwarenessState } from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface SituationAwarenessPanelProps {
  state: SituationAwarenessState;
  onModelDetailsClick?: () => void;
}

export const SituationAwarenessPanel: React.FC<SituationAwarenessPanelProps> = ({
  state,
  onModelDetailsClick,
}) => {
  const { t } = useTranslation("uc01");
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  const handleOpenModelModal = () => {
    setIsModelModalOpen(true);
    if (onModelDetailsClick) onModelDetailsClick();
  };

  const {
    hemodynamicStatus,
    anesthesiaDepth,
    surgicalProgress,
    predictedRisk,
  } = state;
  const predictionAvailable = predictedRisk.available !== false;

  return (
    <>
      <div data-simulation-demo-target="uc01-quality" className="bg-safe-surface border border-safe-border rounded-sm p-2 flex flex-col justify-between select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-safe-border mb-1.5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-safe-text">
            {t("situation.title")}
          </h3>
        </div>

        {/* 2x2 Awareness Status Cells */}
        <div className="grid grid-cols-2 gap-1.5">
          {/* Cell 1: Hemodynamic Status (Derived Clinical Metric - Green) */}
          <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
            <div className="text-xs text-safe-text-muted font-medium mb-1">
              {t("situation.hemodynamicStatus")}
            </div>
            <div className="flex items-center space-x-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-safe-green shrink-0" />
              <span className="text-[15px] font-bold text-safe-green">
                {hemodynamicStatus.status}
              </span>
            </div>
            <span className="text-[11.5px] text-safe-text-muted leading-tight">
              {hemodynamicStatus.details}
            </span>
          </div>

          {/* Cell 2: Anesthesia Depth (Processed Depth Metric - Green) */}
          <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
            <div className="text-xs text-safe-text-muted font-medium mb-1">
              {t("situation.anesthesiaDepth")}
            </div>
            <div className="flex items-center space-x-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-safe-green shrink-0" />
              <span className="text-[15px] font-bold text-safe-green">
                {anesthesiaDepth.status}
              </span>
            </div>
            <span className="text-[11.5px] text-safe-text-muted leading-tight">
              BIS {anesthesiaDepth.bisValue}{" "}
              <span className="text-safe-text-muted">
                ({t("situation.target")} {anesthesiaDepth.targetRange})
              </span>
            </span>
          </div>

          {/* Cell 3: Surgical Progress (Derived Workflow State - Cyan) */}
          <div className="bg-safe-surface-secondary border border-safe-border-light rounded-sm p-2 flex flex-col justify-between">
            <div className="text-xs text-safe-text-muted font-medium mb-1">
              {t("situation.surgicalProgress")}
            </div>
            <div className="flex items-center space-x-1.5 mb-1">
              <div className="w-4 h-4 rounded-full bg-safe-cyan flex items-center justify-center shrink-0">
                <Navigation className="w-2.5 h-2.5 text-black transform rotate-45" />
              </div>
              <span className="text-[15px] font-bold text-safe-cyan">
                {surgicalProgress.status}
              </span>
            </div>
            <span className="text-[11.5px] text-safe-text-muted leading-tight">
              {surgicalProgress.phaseDetail}
            </span>
          </div>

          {/* Cell 4: Predicted Risk */}
          <div
            onClick={handleOpenModelModal}
            className="bg-safe-surface-secondary hover:bg-safe-surface-elevated border border-safe-border-light rounded-sm p-2 flex flex-col justify-between relative cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-safe-cyan focus-visible:outline-none"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleOpenModelModal();
              }
            }}
            title={t("situation.modelModalSubtitle")}
          >
            <div className="text-xs text-safe-text-muted font-medium mb-1">
              {predictionAvailable
                ? t("situation.predictedRisk", { minutes: predictedRisk.horizonMinutes })
                : t("situation.predictionPending")}
            </div>

            {/* Predicted Value */}
            <div className="flex items-center space-x-1.5 mb-1">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${predictionAvailable ? "bg-safe-yellow" : "bg-safe-surface-elevated"}`}>
                <AlertTriangle className={`w-2.5 h-2.5 ${predictionAvailable ? "text-black" : "text-safe-text-muted"}`} />
              </div>
              <span className={`text-[15px] font-bold ${predictionAvailable ? "text-safe-yellow" : "text-safe-text-muted"}`}>
                {predictionAvailable ? predictedRisk.riskLevel : t("situation.unavailable")}
              </span>
            </div>

            {/* Model Subtext */}
            <span className="text-[11.5px] text-[#A7B2B9] leading-tight">
              {predictionAvailable ? predictedRisk.primaryRisk : t("situation.noPredictionYet")}
            </span>
          </div>
        </div>
      </div>

      {/* Predicted Risk Model Explanation Popover */}
      <ClinicalModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        title={t("situation.modelModalTitle")}
        subtitle={t("situation.modelModalSubtitle")}
      >
        <div className="space-y-3 text-[12.5px] leading-relaxed">
          {/* Exact model parameters grid */}
          <div className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-2 bg-[#0A1822] border border-[rgba(35,160,220,0.3)] p-3 rounded-[2px]">
            <span className="text-[#A7B2B9]">{t("situation.model")}</span>
            <span className="font-mono font-semibold text-[#13BDF3]">
              {predictedRisk.modelName}
            </span>

            <span className="text-[#A7B2B9]">{t("situation.horizon")}</span>
            <span className="font-mono text-[#F4F7F8]">
              {predictionAvailable ? `${predictedRisk.horizonMinutes} min` : "—"}
            </span>

            <span className="text-[#A7B2B9]">{t("situation.probability")}</span>
            <span className="font-mono font-bold text-[#FFD429]">
              {predictionAvailable ? `${predictedRisk.probabilityPercent}%` : "—"}
            </span>

            <span className="text-[#A7B2B9]">{t("situation.confidence")}</span>
            <span className="font-medium text-[#31E874]">
              {predictionAvailable ? predictedRisk.confidence : "—"}
            </span>

            <span className="text-[#A7B2B9]">{t("situation.dataCoverage")}</span>
            <span className="font-mono text-[#F4F7F8]">
              {predictionAvailable ? `${predictedRisk.dataCoveragePercent}%` : "—"}
            </span>

            <span className="text-[#A7B2B9]">{t("situation.missingSignals")}</span>
            <span className="text-[#31E874] font-medium">
              {predictedRisk.missingSignals.length > 0
                ? predictedRisk.missingSignals.join(", ")
                : t("situation.none")}
            </span>
          </div>

          <div className="text-[11px] text-[#A7B2B9] bg-[#07131B] border border-[rgba(35,160,220,0.2)] p-2 rounded-[2px] leading-snug">
            {t("situation.disclaimer")}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              variant="workstation"
              size="sm"
              onClick={() => setIsModelModalOpen(false)}
            >
              {t("situation.closeEsc")}
            </Button>
          </div>
        </div>
      </ClinicalModal>
    </>
  );
};
