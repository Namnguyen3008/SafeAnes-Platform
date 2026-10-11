"use client";

import React from "react";
import { CircularMetricGauge } from "./CircularMetricGauge";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { useTranslation } from "@/context/LocalizationContext";
import { formatModelOutput, formatModelPercent } from "@/lib/formatModelOutput";
import { modelOutputStateMessageKey, projectModelOutputState } from "@/lib/modelOutputStatus";

export function OverviewGaugeStrip() {
  const { vitals, prediction, dataSourceMode } = useHemodynamic();
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
  const score = modelProjection.state === "READY" ? prediction.outputValue ?? null : null;
  const modelStateLabel = t(`vitaldb.${modelOutputStateMessageKey(modelProjection.state)}`);

  return (
    <div className="bg-[#071018] border border-[rgba(100,170,210,0.32)] rounded-[3px] p-2 flex items-center justify-between overflow-hidden h-full select-none">
      <div className="grid grid-cols-5 gap-1 w-full h-full items-center">
        {/* 1. HPI (Red Risk) */}
        <CircularMetricGauge
          label={isVitalDb ? t("vitaldb.modelOutput") : "HPI"}
          subtitle={isVitalDb
            ? modelProjection.state === "READY"
              ? prediction.calibrated === true ? t("vitaldb.calibratedOutput") : t("vitaldb.uncalibratedOutput")
              : modelStateLabel
            : t("gauge.predictiveRisk")}
          value={isVitalDb ? score === null ? "—" : formatModelOutput(score) : vitals.hpi ?? "--"}
          unit={isVitalDb ? (score !== null && formatModelPercent(score) ? `${formatModelPercent(score)} · ${t("vitaldb.scoreUnit")}` : t("vitaldb.scoreUnit")) : "/100"}
          themeColor={isVitalDb ? "#B392F0" : "#FF3348"}
          valueColor={isVitalDb ? "#B392F0" : "#FF3348"}
          topInnerLabel={isVitalDb ? "MODEL" : "50"}
          currentPercent={isVitalDb ? (score === null ? null : score * 100) : vitals.hpi}
          ticks={isVitalDb ? {} : {
            topLeft: "50",
            topRight: "75",
            bottomLeft: "0",
            bottomRight: "0",
          }}
          zones={isVitalDb ? [{ startPercent: 0, endPercent: 100, color: "#B392F0" }] : [
            { startPercent: 0, endPercent: 50, color: "#4AF26F" },
            { startPercent: 50, endPercent: 75, color: "#F5E328" },
            { startPercent: 75, endPercent: 100, color: "#FF3348" },
          ]}
        />

        {/* 2. MAP (Yellow) */}
        <CircularMetricGauge
          label="MAP"
          value={vitals.map ?? "--"}
          unit="mmHg"
          subtitle={isVitalDb ? (vitals.map === null ? t("vitaldb.dataNotAvailable") : t("vitaldb.signalQualityUnknown")) : undefined}
          themeColor="#F5E328"
          topInnerLabel="MAP"
          currentPercent={isVitalDb || vitals.map === null ? null : (vitals.map / 120) * 100}
          ticks={{
            topCenter: "75",
            bottomLeft: "0",
            bottomRight: "5",
          }}
          zones={isVitalDb ? [{ startPercent: 0, endPercent: 100, color: "#61717C" }] : [
            { startPercent: 0, endPercent: 45, color: "#FF3348" },
            { startPercent: 45, endPercent: 65, color: "#F5E328" },
            { startPercent: 65, endPercent: 100, color: "#4AF26F" },
          ]}
        />

        {/* 3. CI (Green) */}
        <CircularMetricGauge
          label="CI"
          value={vitals.ci !== null ? vitals.ci.toFixed(1) : "--"}
          unit="L/min/m²"
          subtitle={isVitalDb ? (vitals.ci === null ? t("vitaldb.dataNotAvailable") : t("vitaldb.recordedDataLabel")) : undefined}
          themeColor="#4AF26F"
          topInnerLabel="CI"
          currentPercent={isVitalDb ? null : vitals.ci === null ? null : (vitals.ci / 5) * 100}
          ticks={{
            topCenter: "75",
            bottomLeft: "0",
            bottomRight: "5",
          }}
          zones={isVitalDb ? [{ startPercent: 0, endPercent: 100, color: "#61717C" }] : [
            { startPercent: 0, endPercent: 35, color: "#FF3348" },
            { startPercent: 35, endPercent: 80, color: "#4AF26F" },
            { startPercent: 80, endPercent: 100, color: "#F5E328" },
          ]}
        />

        {/* 4. SV (Green) */}
        <CircularMetricGauge
          label="SV"
          value={vitals.sv ?? "--"}
          unit="mL/b"
          subtitle={isVitalDb ? (vitals.sv === null ? t("vitaldb.dataNotAvailable") : t("vitaldb.recordedDataLabel")) : undefined}
          themeColor="#4AF26F"
          topInnerLabel="SV"
          currentPercent={isVitalDb ? null : vitals.sv === null ? null : (vitals.sv / 120) * 100}
          ticks={{
            topCenter: "75",
            bottomLeft: "0",
            bottomRight: "5",
          }}
          zones={isVitalDb ? [{ startPercent: 0, endPercent: 100, color: "#61717C" }] : [
            { startPercent: 0, endPercent: 30, color: "#FF3348" },
            { startPercent: 30, endPercent: 50, color: "#F5E328" },
            { startPercent: 50, endPercent: 100, color: "#4AF26F" },
          ]}
        />

        {/* 5. SVV (Green-Yellow) */}
        <CircularMetricGauge
          label="SVV"
          value={vitals.svv ?? "--"}
          unit="%"
          subtitle={isVitalDb ? (vitals.svv === null ? t("vitaldb.dataNotAvailable") : t("vitaldb.recordedDataLabel")) : undefined}
          themeColor="#A3E635"
          topInnerLabel="75"
          currentPercent={isVitalDb ? null : vitals.svv === null ? null : (vitals.svv / 30) * 100}
          ticks={{
            topCenter: "75",
            bottomLeft: "0",
          }}
          zones={isVitalDb ? [{ startPercent: 0, endPercent: 100, color: "#61717C" }] : [
            { startPercent: 0, endPercent: 45, color: "#4AF26F" },
            { startPercent: 45, endPercent: 70, color: "#F5E328" },
            { startPercent: 70, endPercent: 100, color: "#FF3348" },
          ]}
        />
      </div>
    </div>
  );
}

export { OverviewGaugeStrip as HemodynamicOverview };
