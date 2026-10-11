"use client";

import React from "react";
import { BarChart3 } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";
import { formatModelOutput } from "@/lib/formatModelOutput";

export function PredictedHpiPanel() {
  const { forecastHorizons, prediction, dataSourceMode } = useHemodynamic();
  const vitalDb = useSafeAnesData();
  const { t } = useTranslation("uc04");
  const isVitalDb = dataSourceMode === "VITALDB_REPLAY";
  const modelStatus = vitalDb.modelStatuses.find((item) => item.model_id.includes("UC04"));
  const readinessStatus = modelStatus?.readiness_status ?? vitalDb.session?.uc04_model_status ?? "MODEL_NOT_READY";
  const modelProjection = projectModelOutputState({
    loading: vitalDb.isLoading,
    readinessStatus: prediction.readinessStatus ?? readinessStatus,
    predictionCacheStatus: prediction.predictionCacheStatus,
    windowEligibility: prediction.windowEligibility,
    hasOutput: forecastHorizons.length > 0 && prediction.available,
  });
  const modelState = modelProjection.state;
  const stateLabel = t(`vitaldb.${modelOutputStateMessageKey(modelState)}`);
  const calibrationLabel = prediction.calibrated === true
    ? t("vitaldb.calibratedOutput")
    : prediction.calibrated === false
      ? t("vitaldb.uncalibratedOutput")
      : t("vitaldb.notRecorded");
  const modelTask = prediction.task ?? modelStatus?.task ?? "NOT_RECORDED";

  if (isVitalDb) {
    return (
      <div className="uc04-forecast-panel shrink-0 min-w-0 bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-visible select-none">
        <div className="flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-0.5 pb-1 border-b border-[rgba(100,170,210,0.32)]">
          <BarChart3 className="mt-0.5 w-4 h-4 shrink-0 text-[#F4F6F7]" />
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 break-words text-[14px] font-bold text-[#F4F6F7] tracking-tight">
              {t("vitaldb.modelOutput")}
            </h2>
            <p className="mt-0.5 break-words text-[10px] leading-tight text-[#AAB4BB]">
              {t("vitaldb.modelTask")}: {modelTask}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1 text-[10px] text-[#AAB4BB]">
          <span>{t("vitaldb.modelReadiness")}: <span className="font-mono text-[#F4F6F7]">{readinessStatus}</span></span>
          <span>{t("vitaldb.inputCoverage")}: {prediction.dataCoverage === null ? "—" : `${prediction.dataCoverage}%`}</span>
          <span>{t("vitaldb.inputQuality")}: {prediction.available ? prediction.qualityStatus ?? "UNKNOWN" : "—"}</span>
        </div>

        {modelState === "READY" ? (
          <>
            <div className={`grid ${forecastHorizons.length > 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1"} min-w-0 gap-2 py-1 text-center`}>
              {forecastHorizons.map((f) => (
                <div key={f.minute} className="min-w-0 bg-[#0A131B] border border-[rgba(100,170,210,0.2)] rounded-[3px] p-1.5">
                  <div className="text-[11px] text-[#AAB4BB]">
                    {f.minute} {t("vitaldb.minuteShort")}
                  </div>
                  <div className="text-[clamp(1.25rem,1.5vw,1.8rem)] font-black font-mono mt-0.5 tabular-nums leading-none text-[#B392F0]">
                    {f.outputValue === null || f.outputValue === undefined ? "—" : formatModelOutput(f.outputValue)}
                  </div>
                  <div className="break-words text-[9px] leading-tight text-[#AAB4BB]">
                    {calibrationLabel} · {prediction.outputSemantics ?? "NOT_RECORDED"}
                  </div>
                </div>
              ))}
            </div>
            <p className="break-words text-[9px] leading-tight text-[#AAB4BB]">{t("vitaldb.recordedOutputDisclaimer")}</p>
          </>
        ) : (
          <div className="py-2 text-center text-[10px] leading-relaxed text-[#AAB4BB]">{stateLabel}</div>
        )}
      </div>
    );
  }

  return (
    <div className="uc04-forecast-panel shrink-0 min-w-0 bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2.5 flex flex-col justify-between overflow-hidden select-none">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 pb-1 border-b border-[rgba(100,170,210,0.32)]">
        <BarChart3 className="w-4 h-4 text-[#F4F6F7]" />
        <h2 className="min-w-0 break-words text-[14px] font-bold text-[#F4F6F7] tracking-tight">
          {t("gauge.hpiTitle")}
        </h2>
          <span className="min-w-0 break-words text-[11px] text-[#AAB4BB]">
            ({t("gauge.hpiSubtitle")})
          </span>
      </div>

      {/* Typed Forecast Horizon Columns */}
      <div className="grid grid-cols-4 gap-2 py-1 text-center">
        {forecastHorizons.map((f) => {
          const colorClass = f.riskLevel === "unavailable"
            ? "text-[#AAB4BB]"
            : f.riskLevel === "high"
            ? "text-[#FF3348]"
            : f.riskLevel === "medium"
              ? "text-[#F5E328]"
              : "text-[#4AF26F]";
          return (
            <div
              key={f.minute}
              className="bg-[#0A131B] border border-[rgba(100,170,210,0.2)] rounded-[3px] p-1.5"
            >
              <div className="text-[11px] text-[#AAB4BB]">
                {f.minute} min
              </div>
              <div
                className={`text-[clamp(1.25rem,1.5vw,1.8rem)] font-black font-mono mt-0.5 tabular-nums leading-none ${colorClass}`}
              >
                {f.riskPercent === null ? "—" : `${f.riskPercent}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
