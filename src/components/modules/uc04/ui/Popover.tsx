"use client";

import React, { useEffect, useRef } from "react";
import { X, ShieldAlert, Cpu } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";
import { formatModelOutput } from "@/lib/formatModelOutput";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";

export interface HpiDetailPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HpiDetailPopover({ isOpen, onClose }: HpiDetailPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const { prediction, dataSourceMode } = useHemodynamic();
  const vitalDb = useSafeAnesData();
  const isVitalDb = dataSourceMode === "VITALDB_REPLAY";
  const { t } = useTranslation("uc04");
  const modelStatus = vitalDb.modelStatuses.find((item) => item.model_id.includes("UC04"));
  const modelProjection = isVitalDb ? projectModelOutputState({
    loading: vitalDb.isLoading,
    readinessStatus: prediction.readinessStatus ?? modelStatus?.readiness_status ?? vitalDb.session?.uc04_model_status,
    predictionCacheStatus: prediction.predictionCacheStatus,
    windowEligibility: prediction.windowEligibility,
    hasOutput: prediction.available && prediction.outputValue !== null && prediction.outputValue !== undefined,
  }) : null;
  const modelStateLabel = modelProjection ? t(`vitaldb.${modelOutputStateMessageKey(modelProjection.state)}`) : null;
  const isRecordedReady = modelProjection?.state === "READY";

  useEffect(() => {
    if (isOpen) {
      popoverRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isVitalDb ? t("vitaldb.modelPrediction") : t("popover.title")}
      className="absolute top-16 right-4 z-50 w-[min(340px,calc(100vw-2rem))] bg-[#071018] border-2 border-[rgba(100,170,210,0.45)] rounded-[3px] p-3 text-[#F4F6F7] shadow-[0_4px_24px_rgba(0,0,0,0.8)] focus:outline-none focus:ring-1 focus:ring-[#00C5FF] select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[rgba(100,170,210,0.32)]">
        <div className={`flex items-center gap-1.5 font-bold text-[12px] tracking-tight ${prediction.available ? isVitalDb ? "text-[#B392F0]" : "text-[#FF3348]" : "text-[#AAB4BB]"}`}>
          <Cpu className="w-4 h-4" />
          <span>{isVitalDb ? t("vitaldb.modelPrediction") : t("popover.title")}</span>
        </div>
        <button
          onClick={onClose}
          className="text-[#AAB4BB] hover:text-white p-0.5 rounded-[2px] focus:outline-none focus:ring-1 focus:ring-[#00C5FF]"
          title={t("events.close")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Model Spec Grid */}
      <div className="py-2.5 space-y-2 text-[12px] font-sans">
        <div className="flex justify-between items-center border-b border-[rgba(100,170,210,0.12)] pb-1">
          <span className="text-[#AAB4BB]">{t("popover.model")}</span>
          <span className="max-w-[165px] break-words text-right font-mono font-bold text-[#F4F6F7]">
            {prediction.modelId} {prediction.modelVersion}
          </span>
        </div>

        <div className="flex justify-between items-center border-b border-[rgba(100,170,210,0.12)] pb-1">
          <span className="text-[#AAB4BB]">{isVitalDb ? t("vitaldb.predictionHorizon") : t("popover.horizon")}</span>
          <span className="font-mono font-bold text-[#F4F6F7]">
            {(!isVitalDb || isRecordedReady) && prediction.horizonMinutes !== null
              ? `${prediction.horizonMinutes} ${t("vitaldb.minuteShort")}` : "—"}
          </span>
        </div>

        {isVitalDb && <div className="flex justify-between items-center border-b border-[rgba(100,170,210,0.12)] pb-1">
          <span className="text-[#AAB4BB]">{t("vitaldb.modelOutput")}</span>
          <span className="font-mono font-bold text-[#B392F0]">
            {isRecordedReady && prediction.outputValue != null ? formatModelOutput(prediction.outputValue) : "—"}
          </span>
        </div>}

        {isVitalDb && <>
          <InfoRow label={t("vitaldb.modelTask")} value={prediction.task ?? modelStatus?.task ?? "NOT_RECORDED"} />
          <InfoRow label={t("vitaldb.modelReadiness")} value={prediction.readinessStatus ?? "UNKNOWN"} />
          <InfoRow label={t("vitaldb.inputQuality")} value={prediction.qualityStatus ?? "UNKNOWN"} />
          <InfoRow label={t("vitaldb.outputSemantics")} value={prediction.outputSemantics ?? "NOT_RECORDED"} />
          <InfoRow label={t("vitaldb.calibration")} value={
            prediction.calibrated === true
              ? t("vitaldb.calibratedOutput")
              : prediction.calibrated === false
                ? t("vitaldb.uncalibratedOutput")
                : t("vitaldb.notRecorded")
          } />
          <InfoRow label={t("vitaldb.modelState")} value={modelStateLabel ?? t("vitaldb.modelNotReady")} />
        </>}

        {!isVitalDb && <div className="flex justify-between items-center border-b border-[rgba(100,170,210,0.12)] pb-1">
          <span className="text-[#AAB4BB]">{t("popover.confidence")}</span>
          <span className={`font-mono font-extrabold px-1.5 py-0.2 rounded-[2px] uppercase ${prediction.available ? "text-[#FF3348] bg-[#FF3348]/20" : "text-[#AAB4BB] bg-[#AAB4BB]/10"}`}>
            {prediction.available ? prediction.confidence : t("popover.unavailable")}
          </span>
        </div>}

        <div className="flex justify-between items-center border-b border-[rgba(100,170,210,0.12)] pb-1">
          <span className="text-[#AAB4BB]">{isVitalDb ? t("vitaldb.inputCoverage") : t("popover.dataCoverage")}</span>
          <span className="font-mono font-bold text-[#00C5FF]">
            {prediction.dataCoverage === null ? "—" : `${prediction.dataCoverage}%`}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[#AAB4BB]">{t("popover.missingness")}</span>
          <span className="font-mono text-[#F4F6F7]">
            {prediction.missingSignals.length > 0 ? prediction.missingSignals.join(", ") : t("popover.none")}
          </span>
        </div>
      </div>

      {/* Footer warning badge */}
      <div className="mt-1 pt-1.5 border-t border-[rgba(100,170,210,0.2)] flex items-start gap-1.5 text-[10px] text-[#AAB4BB] leading-tight">
        <ShieldAlert className="w-3.5 h-3.5 text-[#FF3348] shrink-0 mt-0.5" />
        <span>{isVitalDb ? t("vitaldb.recordedOutputDisclaimer") : t("popover.disclaimer")}</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 border-b border-[rgba(100,170,210,0.12)] pb-1">
      <span className="min-w-0 text-[#AAB4BB]">{label}</span>
      <span className="min-w-0 break-words text-right font-mono text-[#F4F6F7]">{value}</span>
    </div>
  );
}
