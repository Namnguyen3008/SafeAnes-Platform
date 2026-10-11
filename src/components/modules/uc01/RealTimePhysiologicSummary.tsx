"use client";

import React, { useState } from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClinicalModal } from "@/components/ui/popover";
import { PhysiologicObservation, DataIntegrityState } from "@/types/uc01";
import { DataIntegrityDrawer } from "./DataIntegrityDrawer";
import { useTranslation } from "@/context/LocalizationContext";

export interface RealTimePhysiologicSummaryProps {
  observations: PhysiologicObservation[];
  onTileClick?: (obs: PhysiologicObservation) => void;
  dataIntegrity: DataIntegrityState;
}

const paramStyleMap: Record<
  string,
  { colorHex: string; textColorClass: string }
> = {
  MAP: { colorHex: "#FFD429", textColorClass: "text-[#FFD429]" },
  HR: { colorHex: "#31E874", textColorClass: "text-[#31E874]" },
  SPO2: { colorHex: "#13BDF3", textColorClass: "text-[#13BDF3]" },
  ETCO2: { colorHex: "#F4F7F8", textColorClass: "text-[#F4F7F8]" },
};

const qualityStyle: Record<string, string> = {
  GOOD: "text-[#31E874]",
  DEGRADED: "text-[#FFD429]",
  TECHNICAL_DROPOUT: "text-[#FF6675]",
  INVALIDATED_ARTIFACT: "text-[#FF6675]",
  EXPECTED_INTERMITTENT: "text-[#13BDF3]",
  STRUCTURAL_NOT_MONITORED: "text-[#A7B2B9]",
  UNKNOWN: "text-[#A7B2B9]",
  UNAVAILABLE: "text-[#A7B2B9]",
};

export const RealTimePhysiologicSummary: React.FC<
  RealTimePhysiologicSummaryProps
> = ({
  observations,
  onTileClick,
  dataIntegrity,
}) => {
  const { t } = useTranslation("uc01");
  const [isIntegrityDrawerOpen, setIsIntegrityDrawerOpen] = useState(false);
  const [selectedVital, setSelectedVital] =
    useState<PhysiologicObservation | null>(null);

  const handleSelectVital = (vital: PhysiologicObservation) => {
    setSelectedVital(vital);
    if (onTileClick) onTileClick(vital);
  };

  return (
    <>
      <div className="bg-[#07131B] border border-[rgba(35,160,220,0.45)] rounded-[2px] p-2 flex flex-col justify-between select-none">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-1 border-b border-[rgba(35,160,220,0.45)] mb-1.5">
          <h3 className="text-[16px] font-semibold text-[#F4F7F8] tracking-wide whitespace-nowrap">
            {t("realtime.title")}
          </h3>
          <Button
            variant="workstation"
            size="icon"
            onClick={() => setIsIntegrityDrawerOpen(true)}
            title={t("realtime.inspectIntegrity")}
            className="text-[#13BDF3] hover:text-[#F4F7F8] border-[rgba(35,160,220,0.45)] hover:border-[#13BDF3] focus-visible:ring-1 focus-visible:ring-[#13BDF3] focus-visible:outline-none"
          >
            <Activity className="w-3.5 h-3.5 text-[#13BDF3]" />
          </Button>
        </div>

        {/* 2x2 Telemetry Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {observations.map((vital) => {
            const style = paramStyleMap[vital.parameter] || {
              colorHex: "#13BDF3",
              textColorClass: "text-[#13BDF3]",
            };

            return (
              <div
                key={vital.id}
                onClick={() => handleSelectVital(vital)}
                className="bg-[#0A1822] hover:bg-[#0E202D] border border-[rgba(35,160,220,0.35)] rounded-[2px] p-2 flex flex-col justify-between relative cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-[#13BDF3] focus-visible:outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleSelectVital(vital);
                  }
                }}
                title={t("realtime.clickInspectTrend", { label: vital.label })}
              >
                {/* Top row: Label/Unit, Big Value, Limits */}
                <div className="flex items-center justify-between mb-0.5">
                  {/* Parameter Name & Unit */}
                  <div className="flex min-w-0 flex-col leading-none">
                    <span
                      className={`text-[12px] font-bold tracking-tight ${style.textColorClass}`}
                    >
                      {vital.label}
                    </span>
                    <span className="text-[10px] text-[#A7B2B9] font-mono mt-0.5">
                      {vital.unit}
                    </span>
                    <span className={`mt-1 text-[8px] leading-none font-mono ${qualityStyle[vital.quality] ?? qualityStyle.UNKNOWN}`}>
                      {vital.quality.replaceAll("_", " ")}
                    </span>
                  </div>

                  {/* Large Clinical Numerals (46px tabular-nums) */}
                  <div
                    className={`text-[46px] font-bold font-mono tabular-nums leading-none tracking-tight ${style.textColorClass}`}
                  >
                    {vital.value !== null ? vital.value : "--"}
                  </div>

                  {/* Alarm Threshold Limits */}
                  <div className="flex flex-col text-right text-[10px] font-mono tabular-nums text-[#A7B2B9] leading-none">
                    <span>{vital.highLimit}</span>
                    <span className="mt-3">{vital.lowLimit}</span>
                  </div>
                </div>

                {/* Physiological Waveform Mini-trend */}
                <div className="w-full h-5 relative pt-1">
                  <svg
                    className="w-full h-full overflow-visible"
                    viewBox="0 0 100 20"
                    preserveAspectRatio="none"
                  >
                    {vital.sparklinePoints && (
                      <path
                        d={vital.sparklinePoints}
                        fill="none"
                        stroke={style.colorHex}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact Trend Popover Modal */}
      <ClinicalModal
        isOpen={Boolean(selectedVital)}
        onClose={() => setSelectedVital(null)}
        title={t("realtime.trendTitle", { label: selectedVital?.label || "" })}
        subtitle={t("realtime.sensorSubtitle", { sensor: selectedVital?.source || "" })}
      >
        {selectedVital && (
          <div className="space-y-3 text-[12px]">
            {/* Value & Summary Row */}
            <div className="flex items-center justify-between bg-[#0A1822] border border-[rgba(35,160,220,0.3)] p-2.5 rounded-[2px]">
              <div>
                <span className="text-[11px] text-[#A7B2B9] block">
                  {t("realtime.currentValue")}
                </span>
                <span
                  className={`text-[32px] font-bold font-mono tabular-nums ${
                    paramStyleMap[selectedVital.parameter]?.textColorClass ??
                    "text-[#F4F7F8]"
                  }`}
                >
                  {selectedVital.value !== null ? selectedVital.value : "--"}{" "}
                  <span className="text-[13px] font-normal text-[#A7B2B9]">
                    {selectedVital.unit}
                  </span>
                </span>
              </div>
              <div className="flex flex-col text-right font-mono text-[11.5px] space-y-0.5">
                <span className="text-[#A7B2B9]">
                  {t("realtime.mean60m")}{" "}
                  <strong className="text-[#F4F7F8]">
                    {selectedVital.meanValue ?? selectedVital.value}
                  </strong>
                </span>
                <span className="text-[#A7B2B9]">
                  {t("realtime.min")}{" "}
                  <strong className="text-[#F4F7F8]">
                    {selectedVital.minValue ?? selectedVital.lowLimit}
                  </strong>{" "}
                  / {t("realtime.max")}{" "}
                  <strong className="text-[#F4F7F8]">
                    {selectedVital.maxValue ?? selectedVital.highLimit}
                  </strong>
                </span>
              </div>
            </div>

            {/* Extended 60-min Waveform Canvas */}
            <div className="bg-[#0A1822] border border-[rgba(35,160,220,0.3)] p-3 rounded-[2px]">
              <div className="flex justify-between text-[10px] text-[#A7B2B9] font-mono mb-2">
                <span>{t("realtime.sixtyMinAgo")}</span>
                <span>
                  {t("realtime.signalQuality")}{" "}
                  {selectedVital.quality === "GOOD" ? t("realtime.optimalSignal") : t("realtime.degradedSignal")}
                </span>
                <span>{t("realtime.now", { time: selectedVital.timestamp })}</span>
              </div>
              <div className="w-full h-16 relative">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 280 60"
                  preserveAspectRatio="none"
                >
                  {/* Grid lines */}
                  <line
                    x1="0"
                    y1="15"
                    x2="280"
                    y2="15"
                    stroke="rgba(35,160,220,0.2)"
                    strokeDasharray="2,2"
                  />
                  <line
                    x1="0"
                    y1="45"
                    x2="280"
                    y2="45"
                    stroke="rgba(35,160,220,0.2)"
                    strokeDasharray="2,2"
                  />
                  {/* Trend line */}
                  {selectedVital.fullTrendPoints && (
                    <path
                      d={selectedVital.fullTrendPoints}
                      fill="none"
                      stroke={
                        paramStyleMap[selectedVital.parameter]?.colorHex ??
                        "#13BDF3"
                      }
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="workstation"
                size="sm"
                onClick={() => setSelectedVital(null)}
              >
                {t("realtime.closeEsc")}
              </Button>
            </div>
          </div>
        )}
      </ClinicalModal>

      {/* UC01 Data Integrity & Signal Quality Drawer */}
      <DataIntegrityDrawer
        isOpen={isIntegrityDrawerOpen}
        onClose={() => setIsIntegrityDrawerOpen(false)}
        dataIntegrity={dataIntegrity}
      />
    </>
  );
};
