"use client";

import React, { useRef, useEffect } from "react";
import { X, Info, ShieldCheck } from "lucide-react";
import { useRespiratory } from "@/context/RespiratoryContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { RespiratoryRiskPrediction } from "@/types/uc05";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";

export interface RiskModelInfoPopoverProps {
  prediction: RespiratoryRiskPrediction;
}

export function RiskModelInfoPopover({
  prediction,
}: RiskModelInfoPopoverProps) {
  const { isRiskPopoverOpen, setIsRiskPopoverOpen } = useRespiratory();
  const vitalDb = useSafeAnesData();
  const { t } = useTranslation("uc05");
  const popoverRef = useRef<HTMLDivElement>(null);
  const recordedModelState = projectModelOutputState({
    loading: vitalDb.isLoading,
    readinessStatus: prediction.readinessStatus,
    predictionCacheStatus: prediction.predictionCacheStatus,
    windowEligibility: prediction.windowEligibility,
    hasOutput: (prediction.outputRows ?? []).some((row) => row.horizonMinutes !== null),
  });
  const recordedModelStateLabel = t(`vitalDb.${modelOutputStateMessageKey(recordedModelState.state)}`);
  useDialogFocusTrap(isRiskPopoverOpen, popoverRef, () => setIsRiskPopoverOpen(false));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsRiskPopoverOpen(false);
      }
    }
    if (isRiskPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRiskPopoverOpen, setIsRiskPopoverOpen]);

  if (!isRiskPopoverOpen) return null;

  if (prediction.sourceMode === "VITALDB_REPLAY") {
    return (
      <div role="dialog" aria-modal="true" aria-label={t("trend.modelInfo")}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 select-none">
        <div ref={popoverRef} tabIndex={-1}
          className="w-full max-w-[min(560px,calc(100vw-2rem))] max-h-[85vh] overflow-y-auto bg-[#061019] border border-[rgba(80,160,210,0.5)] rounded-[2px] shadow-2xl p-4 focus:outline-none">
          <div className="flex items-center justify-between border-b border-[rgba(80,160,210,0.3)] pb-2">
            <h3 className="text-[#F4F6F7] text-sm font-bold">{t("trend.modelInfo")}</h3>
            <button onClick={() => setIsRiskPopoverOpen(false)} aria-label={t("trend.closeEsc")}
              className="p-1 text-[#A7B0B6] hover:text-[#F4F6F7] focus-visible:ring-1 focus-visible:ring-[#12B9F2]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 space-y-3 text-[12px]">
            <div><div className="text-[#A7B0B6]">{t("vitalDb.task")}</div><p className="mt-1 text-[#F4F6F7] leading-relaxed">{prediction.task}</p></div>
            <InfoRow label={t("trend.model")} value={prediction.modelName} />
            <InfoRow label={t("trend.version")} value={prediction.modelVersion ?? "NOT_RECORDED"} />
            <InfoRow label="SHA-256" value={prediction.artifactHash ?? "NOT_RECORDED"} />
            <InfoRow label={t("vitalDb.readiness")} value={prediction.readinessStatus ?? "UNKNOWN"} />
            <InfoRow label={t("vitalDb.strictSchema")} value={t("vitalDb.strictSchemaValue")} />
            <InfoRow label={t("vitalDb.predictionTime")} value={prediction.timestamp} />
            <InfoRow label={t("trend.dataCoverage")} value={prediction.dataCoverage === null ? "—" : `${prediction.dataCoverage}%`} />
            <div>
              <div className="text-[#A7B0B6]">{t("trend.missingModalities")}</div>
              <div className="mt-1 break-words font-mono text-[#F4F6F7]">{prediction.missingModalities.length ? prediction.missingModalities.join(", ") : t("trend.none")}</div>
            </div>
            <div className="border-t border-[rgba(80,160,210,0.2)] pt-2">
              <div className="mb-1 text-[#A7B0B6]">{t("vitalDb.modelOutputTitle")}</div>
              {recordedModelState.state === "READY" && (prediction.outputRows ?? []).filter((row) => row.horizonMinutes !== null).map((row) => (
                <InfoRow key={`${row.predictionTime}-${row.horizonMinutes}`} label={`${row.horizonMinutes} ${t("vitalDb.minuteShort")} · ${row.kind} · ${row.calibrated ? t("vitalDb.temperatureScaledOutput") : t("vitalDb.uncalibratedOutput")}`} value={`${row.value.toPrecision(6)} · ${t("vitalDb.rawLogit")} ${row.rawOutput?.toPrecision(6) ?? "—"}`} />
              ))}
              {recordedModelState.state === "READY" && (prediction.outputRows ?? []).filter((row) => row.horizonMinutes === null).map((row) => (
                <InfoRow key={`${row.predictionTime}-aux`} label={t("vitalDb.auxiliaryOutput")} value={`${row.value.toPrecision(6)} · ${t("vitalDb.auxiliaryUncalibrated")}`} />
              ))}
              {recordedModelState.state !== "READY" && <p className="text-[#A7B0B6]">{recordedModelStateLabel}</p>}
            </div>
            <p className="border-l-2 border-amber-400/70 pl-2 text-amber-200">{t("vitalDb.notClinical")}</p>
            <p className="text-[10px] leading-relaxed text-[#A7B0B6]">{t("vitalDb.readinessDetails", { status: prediction.readinessStatus ?? "UNKNOWN" })}</p>
          </div>
        </div>
      </div>
    );
  }

  const missingModalitiesStr =
    prediction.missingModalities.length > 0
      ? prediction.missingModalities.join(", ")
      : t("trend.none");

  const confidenceLabel = t(`risks.status.${prediction.confidence}`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("trend.modelInfo")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 select-none animate-in fade-in duration-100"
    >
      <div
        ref={popoverRef}
        tabIndex={-1}
        className="w-full max-w-[min(460px,calc(100vw-2rem))] max-h-[85vh] bg-[#061019] border border-[rgba(80,160,210,0.5)] rounded-[2px] shadow-2xl overflow-hidden flex flex-col focus:outline-none"
      >
        {/* Header accent */}
        <div className="h-0.5 bg-[#12B9F2]" />

        <div className="min-h-0 overflow-y-auto overscroll-contain p-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-[rgba(80,160,210,0.3)]">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#12B9F2]" />
              <h3 className="min-w-0 text-[#F4F6F7] text-[13.5px] font-bold whitespace-normal break-words">{t("trend.modelInfo")}</h3>
            </div>
            <button
              onClick={() => setIsRiskPopoverOpen(false)}
              aria-label={t("trend.closeEsc")}
              className="p-1 text-[#A7B0B6] hover:text-[#F4F6F7] hover:bg-[#09151D] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-[12.5px]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-0.5 border-b border-[rgba(80,160,210,0.15)]">
              <span className="text-[#A7B0B6]">{t("trend.model")}</span>
              <span className="text-[#F4F6F7] font-medium">{prediction.modelName}</span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-0.5 border-b border-[rgba(80,160,210,0.15)]">
              <span className="text-[#A7B0B6]">{t("trend.horizon")}</span>
              <span className="text-[#F4F6F7] font-mono tabular-nums font-semibold">
                {prediction.horizonMinutes === null ? "—" : `${prediction.horizonMinutes} min`}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-0.5 border-b border-[rgba(80,160,210,0.15)]">
              <span className="text-[#A7B0B6]">{t("trend.confidence")}</span>
              <span className="text-[#39E336] font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> {confidenceLabel}
              </span>
            </div>

            {prediction.modelVersion && (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-0.5 border-b border-[rgba(80,160,210,0.15)]">
                <span className="text-[#A7B0B6]">{t("trend.version")}</span>
                <span className="text-[#F4F6F7] font-mono tabular-nums">{prediction.modelVersion}</span>
              </div>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-0.5 border-b border-[rgba(80,160,210,0.15)]">
              <span className="text-[#A7B0B6]">{t("trend.dataCoverage")}</span>
              <span className="text-[#12B9F2] font-mono tabular-nums font-semibold">
                {prediction.dataCoverage === null ? "—" : `${prediction.dataCoverage}%`}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-0.5">
              <span className="text-[#A7B0B6]">{t("trend.missingModalities")}</span>
              <span className="min-w-0 text-right text-[#F4F6F7] font-mono whitespace-normal break-words">{missingModalitiesStr}</span>
            </div>
          </div>

          {prediction.synthetic && prediction.clinicalUse === false && (
            <div className="mt-3 p-2 border border-amber-500/50 bg-amber-950/30 text-amber-200 text-[12px] leading-relaxed">
              {t("simulation.demoDisclaimer")}
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-[rgba(80,160,210,0.25)] flex justify-end">
            <button
              onClick={() => setIsRiskPopoverOpen(false)}
              className="px-3 py-1 bg-[#09151D] hover:bg-[#0c1a24] text-[#F4F6F7] text-[12px] font-medium border border-[rgba(80,160,210,0.45)] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
            >
              {t("trend.closeEsc")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,1.3fr)] gap-3 border-b border-[rgba(80,160,210,0.12)] py-1">
    <span className="text-[#A7B0B6]">{label}</span>
    <span className="min-w-0 break-words text-right font-mono text-[#F4F6F7]">{value}</span>
  </div>;
}

export default RiskModelInfoPopover;
