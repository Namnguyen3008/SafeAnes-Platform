"use client";

import React from "react";
import { Heart, Info, Bell, ChevronRight, Check } from "lucide-react";
import { useTrendSync } from "@/context/RespiratoryContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";
import { formatModelOutput, formatModelPercent } from "@/lib/formatModelOutput";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";
import {
  RespiratoryVitals,
  RespiratoryRiskPrediction,
  RespiratoryAlert,
} from "@/types/uc05";

// Medical Lung SVG Icon
export function LungsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 3v8m0 0l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 7c-2.5 0-5.5 1-6.5 4.5C3.5 15 5 21 8.5 21c2 0 2.5-2 2.5-4V7zm2 0c2.5 0 5.5 1 6.5 4.5 1 3.5-.5 9.5-4 9.5-2 0-2.5-2-2.5-4V7z" />
    </svg>
  );
}

// Reusable Thin Vertical Range Indicator Bar
export function VerticalRangeBar({
  high,
  low,
  fillPercentage,
  color,
}: {
  high: number | string;
  low: number | string;
  fillPercentage: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 my-auto select-none">
      <div className="flex flex-col justify-between h-11 text-[10px] font-mono text-[#A7B0B6] tabular-nums text-right">
        <span>{high}</span>
        <span>{low}</span>
      </div>
      {/* Thin vertical bar scale */}
      <div className="w-1.5 h-11 bg-[#09151D] border border-[rgba(80,160,210,0.35)] rounded-full overflow-hidden flex flex-col justify-end p-[0.5px]">
        <div
          className="w-full rounded-full transition-all duration-300"
          style={{ height: `${fillPercentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// 1. EtCO2 Numeric Module (Yellow Theme)
export function EtCO2Numeric({
  value,
  unit = "mmHg",
  unavailableLabel,
  showRange = true,
  range = { min: 20, max: 60 },
}: {
  value?: number | null;
  unit?: string;
  unavailableLabel?: string;
  showRange?: boolean;
  range?: { min: number; max: number };
}) {
  const displayVal = value != null ? value : "—";
  const pct =
    value != null
      ? Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100))
      : 0;

  return (
    <section className="uc05-vital-tile shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] px-3.5 py-2 flex items-center justify-between rounded-[2px] relative select-none shadow-none">
      <div className="flex items-center gap-2 self-start pt-1">
        <LungsIcon className="w-7 h-7 text-[#FFE800]" />
        <span className="text-[#FFE800] font-bold text-[20px] tracking-wide leading-none">EtCO₂</span>
      </div>

      <div className="flex items-baseline">
        <span className={`${unavailableLabel && value == null ? "max-w-[145px] text-right text-[12px] leading-tight" : "text-[clamp(3.5rem,6vw,5.125rem)] leading-none"} font-mono font-bold text-[#FFE800] tabular-nums tracking-tighter`}>
          {unavailableLabel && value == null ? unavailableLabel : displayVal}
        </span>
      </div>

      <div className="flex flex-col items-end justify-between h-full py-0.5 pl-2">
        <span className="text-[#A7B0B6] text-[15px] font-medium">{unit}</span>
        {showRange && <VerticalRangeBar high={range.max} low={range.min} fillPercentage={pct} color="#FFE800" />}
      </div>
    </section>
  );
}

// 2. RR Numeric Module (White Theme)
export function RRNumeric({
  value,
  unit = "/min",
  showRange = true,
  range = { min: 6, max: 30 },
}: {
  value?: number | null;
  unit?: string;
  showRange?: boolean;
  range?: { min: number; max: number };
}) {
  const displayVal = value != null ? value : "—";
  const pct =
    value != null
      ? Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100))
      : 0;

  return (
    <section className="uc05-vital-tile shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] px-3.5 py-2 flex items-center justify-between rounded-[2px] relative select-none shadow-none">
      <div className="flex items-center gap-2 self-start pt-1">
        <LungsIcon className="w-7 h-7 text-[#F4F6F7]" />
        <span className="text-[#F4F6F7] font-bold text-[20px] tracking-wide leading-none">RR</span>
      </div>

      <div className="flex items-baseline">
        <span className="font-mono font-bold text-[clamp(3.5rem,6vw,5.125rem)] leading-none text-[#F4F6F7] tabular-nums tracking-tighter">
          {displayVal}
        </span>
      </div>

      <div className="flex flex-col items-end justify-between h-full py-0.5 pl-2">
        <span className="text-[#A7B0B6] text-[15px] font-medium">{unit}</span>
        {showRange && <VerticalRangeBar high={range.max} low={range.min} fillPercentage={pct} color="#F4F6F7" />}
      </div>
    </section>
  );
}

// 3. SpO2 Numeric Module (Cyan Theme)
export function SpO2Numeric({
  value,
  unit = "%",
  showRange = true,
  range = { min: 90, max: 100 },
}: {
  value?: number | null;
  unit?: string;
  showRange?: boolean;
  range?: { min: number; max: number };
}) {
  const displayVal = value != null ? value : "—";
  const pct =
    value != null
      ? Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100))
      : 0;

  return (
    <section className="uc05-vital-tile shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] px-3.5 py-2 flex items-center justify-between rounded-[2px] relative select-none shadow-none">
      <div className="flex items-center gap-2 self-start pt-1">
        <Heart className="w-7 h-7 text-[#12B9F2] fill-[#12B9F2]" />
        <span className="text-[#12B9F2] font-bold text-[20px] tracking-wide leading-none">SpO₂</span>
      </div>

      <div className="flex items-baseline">
        <span className="font-mono font-bold text-[clamp(3.5rem,6vw,5.125rem)] leading-none text-[#12B9F2] tabular-nums tracking-tighter">
          {displayVal}
        </span>
      </div>

      <div className="flex flex-col items-end justify-between h-full py-0.5 pl-2">
        <span className="text-[#A7B0B6] text-[15px] font-medium">{unit}</span>
        {showRange && <VerticalRangeBar high={range.max} low={range.min} fillPercentage={pct} color="#12B9F2" />}
      </div>
    </section>
  );
}

// 4. PR Numeric Module (Green Theme)
export function PRNumeric({
  value,
  unit = "bpm",
  showRange = true,
  range = { min: 50, max: 140 },
}: {
  value?: number | null;
  unit?: string;
  showRange?: boolean;
  range?: { min: number; max: number };
}) {
  const displayVal = value != null ? value : "—";
  const pct =
    value != null
      ? Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100))
      : 0;

  return (
    <section className="uc05-vital-tile shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] px-3.5 py-2 flex items-center justify-between rounded-[2px] relative select-none shadow-none">
      <div className="flex items-center gap-2 self-start pt-1">
        <Heart className="w-7 h-7 text-[#39E336] fill-[#39E336]" />
        <span className="text-[#39E336] font-bold text-[20px] tracking-wide leading-none">PR</span>
      </div>

      <div className="flex items-baseline">
        <span className="font-mono font-bold text-[clamp(3.5rem,6vw,5.125rem)] leading-none text-[#39E336] tabular-nums tracking-tighter">
          {displayVal}
        </span>
      </div>

      <div className="flex flex-col items-end justify-between h-full py-0.5 pl-2">
        <span className="text-[#A7B0B6] text-[15px] font-medium">{unit}</span>
        {showRange && <VerticalRangeBar high={range.max} low={range.min} fillPercentage={pct} color="#39E336" />}
      </div>
    </section>
  );
}

// 5. Respiratory Risk Card (Model / Predictive Estimation Interface)
export function RespiratoryRiskCard({
  prediction,
}: {
  prediction: RespiratoryRiskPrediction;
}) {
  const { setIsRiskPopoverOpen } = useTrendSync();
  const { t } = useTranslation("uc05");
  const vitalDb = useSafeAnesData();
  if (prediction.sourceMode === "VITALDB_REPLAY") {
    const primary = prediction.outputRows?.filter((row) => row.horizonMinutes !== null) ?? [];
    const auxiliary = prediction.outputRows?.find((row) => row.horizonMinutes === null);
    const modelState = projectModelOutputState({
      loading: vitalDb.isLoading,
      readinessStatus: prediction.readinessStatus,
      predictionCacheStatus: prediction.predictionCacheStatus,
      windowEligibility: prediction.windowEligibility,
      hasOutput: primary.length > 0,
    });
    const stateLabel = t(`vitalDb.${modelOutputStateMessageKey(modelState.state)}`);
    return (
      <section className="uc05-risk-card shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] p-3.5 flex flex-col gap-2 rounded-[2px] relative select-none shadow-none">
        <div className="flex items-center justify-between pb-1.5 border-b border-[rgba(80,160,210,0.35)]">
          <h2 className="min-w-0 break-words text-[#F4F6F7] text-[14px] font-bold tracking-wide leading-tight">{t("vitalDb.modelOutputTitle")}</h2>
          <button type="button" onClick={() => setIsRiskPopoverOpen(true)} aria-label={t("trend.modelInfo")}
            className="shrink-0 p-1 text-[#A7B0B6] hover:text-[#12B9F2] rounded-full focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none">
            <Info className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] leading-snug text-[#A7B0B6]">{t("vitalDb.task")}: {prediction.task ?? "NOT_RECORDED"}</p>
        {modelState.state === "READY" ? (
          <div className="grid grid-cols-3 gap-2">
            {primary.map((row) => (
              <div key={`${row.predictionTime}-${row.horizonMinutes}`} className="min-w-0 border border-[rgba(80,160,210,0.3)] bg-[#09151D] px-1.5 py-1.5 text-center flex flex-col justify-between">
                <div className="text-[10px] text-[#A7B0B6] leading-none">{row.horizonMinutes} {t("vitalDb.minuteShort")}</div>
                <div className="my-1 flex flex-col items-center">
                  <div className="font-mono text-[16px] font-semibold tabular-nums text-[#12B9F2] leading-none">{formatModelOutput(row.value)}</div>
                  {formatModelPercent(row.value) && (
                    <div className="font-mono text-[11px] font-bold tabular-nums text-[#00E5FF] mt-0.5 leading-none">
                      {formatModelPercent(row.value)}
                    </div>
                  )}
                </div>
                <div className="break-words text-[8.5px] leading-tight text-[#A7B0B6]">
                  {row.calibrated ? t("vitalDb.temperatureScaledOutput") : t("vitalDb.uncalibratedOutput")}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] leading-relaxed text-[#A7B0B6]">{stateLabel}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1 text-[9px] font-mono text-[#A7B0B6]">
          <span>{t("vitalDb.readiness")}: {prediction.readinessStatus}</span>
          <span>{t("trend.dataCoverage")}: {prediction.dataCoverage === null ? "—" : `${prediction.dataCoverage}%`}</span>
        </div>
        {modelState.state === "READY" && auxiliary && <div className="break-words text-[9px] leading-tight text-[#A7B0B6]">{t("vitalDb.auxiliaryOutput")}: <span className="font-mono">{formatModelOutput(auxiliary.value)}</span> · {t("vitalDb.modelUseDisclaimer")}</div>}
        {modelState.state === "READY" && <p className="break-words text-[9px] leading-tight text-[#A7B0B6]">{t("vitalDb.recordedOutputDisclaimer")}</p>}
      </section>
    );
  }
  const riskColor = prediction.risk === null ? "#A7B0B6" : prediction.risk >= 70 ? "#E00014" : prediction.risk >= 30 ? "#FFE800" : "#39E336";
  const riskTextColor = prediction.risk === null ? "text-[#A7B0B6]" : prediction.risk >= 70 ? "text-[#E00014]" : prediction.risk >= 30 ? "text-[#FFE800]" : "text-[#39E336]";
  const statusLabel = (value: string) => {
    const key = value.toLowerCase();
    return t(`risks.status.${key}`);
  };

  return (
    <section className="uc05-risk-card shrink-0 min-w-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] p-3.5 flex flex-col justify-between rounded-[2px] relative select-none shadow-none">
      {/* Card Header: Title + Explicit "Model estimate" distinction */}
      <div className="flex min-w-0 items-start justify-between gap-2 pb-1.5 border-b border-[rgba(80,160,210,0.35)]">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <LungsIcon className="w-5 h-5 shrink-0 text-[#F4F6F7]" />
            <h2 className="min-w-0 break-words text-[#F4F6F7] text-[15px] font-bold tracking-wide leading-tight">
              {t("risks.title")}
            </h2>
          </div>
          {prediction.synthetic && (
            <span className="mt-0.5 block whitespace-normal break-words pl-7 text-[9px] text-[#12B9F2] font-mono leading-tight">
              {prediction.available
                ? t("simulation.modelEstimate", { minutes: prediction.horizonMinutes ?? "—" })
                : t("risks.status.unavailable")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsRiskPopoverOpen(true)}
          aria-label={t("trend.modelInfo")}
          className="p-1 text-[#A7B0B6] hover:text-[#12B9F2] rounded-full transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
        >
          <Info className="w-4 h-4 text-[#A7B0B6]" strokeWidth={2} />
        </button>
      </div>

      {/* Body: Semicircular Risk Gauge on Left, Status List on Right */}
      <div className="flex min-w-0 items-center justify-between gap-2 py-1 px-1">
        {/* Semicircular Risk Gauge */}
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-24 flex items-center justify-center">
            {/* SVG Semicircular Arc Gauge */}
            <svg viewBox="0 0 100 65" className="w-full h-full overflow-visible">
              <path
                d="M 12 55 A 40 40 0 0 1 88 55"
                fill="none"
                stroke="rgba(80,160,210,0.22)"
                strokeWidth="8.5"
                strokeLinecap="round"
              />
              {/* Dynamic Risk Gauge Arc */}
              {prediction.risk !== null && <path
                d="M 12 55 A 40 40 0 0 1 88 55"
                fill="none"
                stroke={riskColor}
                strokeWidth="8.5"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray={`${Math.max(0, Math.min(100, prediction.risk))} 100`}
              />}
            </svg>
            <div className="absolute top-6 flex items-baseline font-mono font-bold text-[#F4F6F7]">
              <span className="text-[34px] leading-none">{prediction.risk ?? "—"}</span>
              {prediction.risk !== null && <span className="text-[14px] text-[#A7B0B6] ml-0.5">%</span>}
            </div>
          </div>
          {/* Risk Level Badge */}
          <div className={`px-4 py-0.5 font-bold text-[13px] rounded-[2px] mt-1 tracking-wide ${prediction.available ? "text-[#03070A]" : "text-[#F4F6F7]"}`} style={{ backgroundColor: riskColor }}>
            {statusLabel(prediction.riskStatus)}
          </div>
        </div>

        {/* Right Side Status List with small green indicators */}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5 text-[12px]">
          <div className="min-w-0 flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-1.5">
              {prediction.available && <Check className={`mt-0.5 w-4 h-4 shrink-0 ${riskTextColor} stroke-[3]`} />}
              <span className="min-w-0 break-words leading-tight text-[#F4F6F7]">{t("risks.ventilation")}</span>
            </div>
            <span className={`${riskTextColor} shrink-0 whitespace-nowrap font-semibold text-right`}>{statusLabel(prediction.subCategories.ventilation)}</span>
          </div>

          <div className="min-w-0 flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-1.5">
              {prediction.available && <Check className={`mt-0.5 w-4 h-4 shrink-0 ${riskTextColor} stroke-[3]`} />}
              <span className="min-w-0 break-words leading-tight text-[#F4F6F7]">{t("risks.oxygenation")}</span>
            </div>
            <span className={`${riskTextColor} shrink-0 whitespace-nowrap font-semibold text-right`}>{statusLabel(prediction.subCategories.oxygenation)}</span>
          </div>

          <div className="min-w-0 flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-1.5">
              {prediction.available && <Check className={`mt-0.5 w-4 h-4 shrink-0 ${riskTextColor} stroke-[3]`} />}
              <span className="min-w-0 break-words leading-tight text-[#F4F6F7]">{t("risks.apneaRisk")}</span>
            </div>
            <span className={`${riskTextColor} shrink-0 whitespace-nowrap font-semibold text-right`}>{statusLabel(prediction.subCategories.apneaRisk)}</span>
          </div>

          <div className="min-w-0 flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-1.5">
              {prediction.available && <Check className={`mt-0.5 w-4 h-4 shrink-0 ${riskTextColor} stroke-[3]`} />}
              <span className="min-w-0 break-words leading-tight text-[#F4F6F7]">{t("risks.overall")}</span>
            </div>
            <span className={`${riskTextColor} shrink-0 whitespace-nowrap font-semibold text-right`}>{statusLabel(prediction.subCategories.overall)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// 6. Current Respiratory Alert Module
export function CurrentRespiratoryAlert({
  alert,
  realRecordedData = false,
}: {
  alert: RespiratoryAlert | null;
  realRecordedData?: boolean;
}) {
  const { setIsAlertDrawerOpen } = useTrendSync();
  const { t } = useTranslation("uc05");

  return (
    <section data-simulation-demo-target="uc05-respiratory" className="uc05-current-alert shrink-0 bg-[#061019] border border-[rgba(80,160,210,0.45)] p-3.5 flex flex-col justify-between rounded-[2px] relative select-none shadow-none">
      {/* Header: Title + High Priority Badge */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#E00014] fill-[#E00014]" />
          <h2 className="text-[#F4F6F7] text-[16px] font-bold tracking-wide">{t("alarms.currentAlert")}</h2>
        </div>
        {alert ? (
          <span className="px-2.5 py-0.5 text-[12px] font-bold bg-[#E00014]/20 border border-[#E00014] text-[#E00014] rounded-[2px]">
            {alert.priority === "HIGH" ? t("alarms.highPriority") : `${alert.priority} Priority`}
          </span>
        ) : <span className="text-[11px] font-mono text-[#A7B0B6]">{realRecordedData ? t("vitalDb.noRecordedAlarm") : t("simulation.noActiveAlert")}</span>}
      </div>

      {/* Red Semantic Banner Warning Box */}
      {alert ? <div
        role="button"
        tabIndex={0}
        onClick={() => setIsAlertDrawerOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsAlertDrawerOpen(true);
          }
        }}
        className="bg-[#8A0E18] border border-[#E00014]/60 p-3.5 rounded-[2px] flex items-center justify-between my-auto cursor-pointer hover:bg-[#99111c] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none"
      >
        <div className="flex items-center gap-3.5">
          <LungsIcon className="w-9 h-9 text-[#F4F6F7] shrink-0" />
          <div className="flex flex-col">
            <span className="text-[#F4F6F7] font-bold text-[17px] tracking-wide leading-tight">
              {alert.code === "DEMO-RESP-02" ? t("alarms.noBreathDetected") : alert.title}
            </span>
            <span className="text-red-100/90 text-[13px] leading-tight mt-1">
              {alert.code === "DEMO-RESP-02" ? t("simulation.syntheticRespiratoryAlert") : alert.subtitle}
            </span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-red-100" />
      </div> : (
        <div className="my-auto border border-[rgba(80,160,210,0.3)] bg-[#09151D] px-3 py-4 text-sm text-[#A7B0B6] rounded-[2px]">
          {realRecordedData ? t("vitalDb.noRecordedAlarm") : t("simulation.noActiveAlert")}
        </div>
      )}
    </section>
  );
}

// Alias for backwards compatibility
export const CurrentAlertCard = CurrentRespiratoryAlert;

export interface ClinicalSummaryRailProps {
  vitals: RespiratoryVitals;
  riskPrediction: RespiratoryRiskPrediction;
  activeAlert: RespiratoryAlert | null;
  realRecordedData?: boolean;
}

// Right Clinical Summary Rail Container
export function ClinicalSummaryRail({
  vitals,
  riskPrediction,
  activeAlert,
  realRecordedData = false,
}: ClinicalSummaryRailProps) {
  const { t } = useTranslation("uc05");
  const isAlertActive = activeAlert !== null && activeAlert.isActive;
  return (
    <div className="uc05-summary-rail flex flex-col justify-between gap-1.5 h-full min-h-0 min-w-0 overflow-visible select-none">
      {isAlertActive && <CurrentRespiratoryAlert alert={activeAlert} realRecordedData={realRecordedData} />}
      {/* 1. EtCO2 Numeric Module (110px) */}
      <EtCO2Numeric value={vitals.etco2} unit={vitals.units?.etco2 ?? "mmHg"}
        unavailableLabel={realRecordedData ? t("simulation.signalUnavailable") : undefined} showRange={!realRecordedData} />

      {/* 2. RR Numeric Module (110px) */}
      <RRNumeric value={vitals.respiratoryRate} unit={vitals.units?.respiratoryRate ?? "/min"} showRange={!realRecordedData} />

      {/* 3. SpO2 Numeric Module (110px) */}
      <SpO2Numeric value={vitals.spo2} unit={vitals.units?.spo2 ?? "%"} showRange={!realRecordedData} />

      {/* 4. PR Numeric Module (110px) */}
      <PRNumeric value={vitals.pulseRate} unit={vitals.units?.pulseRate ?? "bpm"} showRange={!realRecordedData} />

      {/* 5. Respiratory Risk Card (215px) */}
      <RespiratoryRiskCard prediction={riskPrediction} />

      {/* 6. Current Respiratory Alert Module (174px) */}
      {!isAlertActive && <CurrentRespiratoryAlert alert={activeAlert} realRecordedData={realRecordedData} />}
    </div>
  );
}

// Alias for backwards compatibility
export { ClinicalSummaryRail as RespiratoryVitalRail };
export default ClinicalSummaryRail;
