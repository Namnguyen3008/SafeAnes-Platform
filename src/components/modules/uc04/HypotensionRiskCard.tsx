"use client";

import React from "react";
import { TrendingUp, AlertTriangle, Cpu } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";
import { HpiDetailPopover } from "./ui/Popover";
import { valuesToPath } from "./visualization/svgPaths";
import { formatModelOutput, formatModelPercent } from "@/lib/formatModelOutput";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";

export function HypotensionRiskCard() {
  const { vitals, trendSamples, prediction, dataSourceMode, isHpiPopoverOpen, setIsHpiPopoverOpen } = useHemodynamic();
  const vitalDb = useSafeAnesData();
  const { t } = useTranslation("uc04");
  const isVitalDb = dataSourceMode === "VITALDB_REPLAY";
  const modelStatus = vitalDb.modelStatuses.find((item) => item.model_id.includes("UC04"));
  const modelProjection = projectModelOutputState({
    loading: vitalDb.isLoading,
    readinessStatus: prediction.readinessStatus ?? modelStatus?.readiness_status ?? vitalDb.session?.uc04_model_status,
    predictionCacheStatus: prediction.predictionCacheStatus,
    windowEligibility: prediction.windowEligibility,
    hasOutput: prediction.available && prediction.outputValue !== null && prediction.outputValue !== undefined,
  });
  const stateLabel = t(`vitaldb.${modelOutputStateMessageKey(modelProjection.state)}`);
  const risk = isVitalDb && modelProjection.state === "READY" ? prediction.outputValue ?? null : vitals.hpi;
  const riskColor = isVitalDb ? (risk === null ? "#AAB4BB" : "#B392F0")
    : risk === null ? "#AAB4BB" : risk >= 70 ? "#FF3348" : risk >= 35 ? "#F5E328" : "#4AF26F";
  const sparkline = valuesToPath(
    trendSamples.map((sample) => isVitalDb && modelProjection.state !== "READY" ? null : isVitalDb ? sample.modelOutputScore : sample.hpi),
    140, 48, 0, isVitalDb ? 1 : 100
  );
  const sparkArea = sparkline ? `${sparkline} L 135 48 L 0 48 Z` : "";

  return (
    <div className="relative">
      <div
        data-simulation-demo-target="uc04-risk"
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isHpiPopoverOpen}
        onClick={() => setIsHpiPopoverOpen(!isHpiPopoverOpen)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsHpiPopoverOpen(!isHpiPopoverOpen);
          }
        }}
        className="uc04-risk-card shrink-0 min-w-0 bg-safe-surface border-2 rounded-sm p-2.5 flex flex-col justify-between overflow-hidden shadow-none select-none cursor-pointer hover:bg-safe-surface-secondary transition-colors focus:outline-none focus:ring-1 focus:ring-safe-cyan"
        style={{ borderColor: riskColor }}
      >
        {/* Header with Title, Subtitle, and Warning Icon */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 shrink-0" style={{ color: riskColor }} />
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-safe-text leading-none">
                  {isVitalDb ? t("vitaldb.modelOutput") : t("gauge.hypotensionRiskHpi")}
                </h2>
                  <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded-sm leading-none" style={{ backgroundColor: `${riskColor}22`, color: riskColor }}>
                  {isVitalDb ? t("vitaldb.modelPrediction") : t("gauge.aiModel")}
                </span>
              </div>
              <p className="text-[11px] text-safe-text-muted mt-0.5 font-medium">
                {isVitalDb
                  ? modelProjection.state === "READY"
                    ? prediction.calibrated === true ? t("vitaldb.calibratedOutput") : t("vitaldb.uncalibratedOutput")
                    : stateLabel
                  : t("gauge.modelEstimateExplain")}
              </p>
            </div>
          </div>
          {isVitalDb ? <Cpu className="w-5 h-5 shrink-0" style={{ color: riskColor }} />
            : <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: riskColor }} />}
        </div>

        {/* Main Readout and Risk Sparkline */}
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col justify-center">
            <div className="flex items-baseline">
              <span className="uc04-risk-value font-black font-mono leading-none tabular-nums tracking-tighter" style={{ color: riskColor }}>
                {isVitalDb ? modelProjection.state === "READY" && risk !== null ? formatModelOutput(risk) : "—" : vitals.hpi ?? "--"}
              </span>
              <span className={`${isVitalDb ? "text-[11px]" : "text-[20px]"} font-semibold font-mono text-safe-text-muted ml-1`}>
                {isVitalDb ? modelProjection.state === "READY" ? t("vitaldb.scoreUnit") : "" : "/100"}
              </span>
            </div>
            {isVitalDb && modelProjection.state === "READY" && risk !== null && formatModelPercent(risk) && (
              <div className="text-[14px] font-mono font-bold text-[#00E5FF] tabular-nums mt-0.5">
                ≈ {formatModelPercent(risk)}
              </div>
            )}
          </div>

          {/* Upward red risk sparkline */}
          <div className="w-[140px] h-[54px] flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 140 54">
              <defs>
                <linearGradient id="railHpiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF3348" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#FF3348" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {sparkArea && <path d={sparkArea} fill="url(#railHpiGrad)" />}
              <path d={sparkline} fill="none" stroke={riskColor} strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Detail Explainability Popover */}
      <HpiDetailPopover
        isOpen={isHpiPopoverOpen}
        onClose={() => setIsHpiPopoverOpen(false)}
      />
    </div>
  );
}
