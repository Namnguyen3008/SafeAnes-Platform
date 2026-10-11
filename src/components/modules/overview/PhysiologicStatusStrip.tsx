"use client";

import React from "react";
import { Activity, Heart, Wind, Gauge, AlertTriangle, TrendingDown } from "lucide-react";
import { useSafeAnesSimulation } from "@/context/SimulationReplayContext";
import { useTranslation } from "@/context/LocalizationContext";

export function PhysiologicStatusStrip() {
  const simulation = useSafeAnesSimulation();
  const snapshot = simulation.snapshot;
  const { t } = useTranslation("overview");
  const latestMeasured = (signal: string) => snapshot.observations
    .filter((observation) => observation.signal === signal &&
      observation.eventTime <= snapshot.simulationTime && observation.receivedTime <= snapshot.simulationTime &&
      !observation.imputed && observation.quality.status === "GOOD" && typeof observation.value === "number")
    .filter((observation) => {
      const activeQuality = snapshot.qualityStates.find((quality) => quality.signal === signal &&
        quality.sourceDevice === observation.sourceDevice && quality.eventTime <= snapshot.simulationTime &&
        (quality.validUntilTime === undefined || snapshot.simulationTime < quality.validUntilTime));
      return !activeQuality || activeQuality.status === "GOOD";
    })
    .sort((left, right) => right.eventTime - left.eventTime)[0]?.value ?? null;
  const mapValue = latestMeasured("MAP");
  const hrValue = latestMeasured("HR");
  const spo2Value = latestMeasured("SPO2");
  const etco2Value = latestMeasured("ETCO2");
  const rrValue = latestMeasured("RR");
  const ciValue = latestMeasured("CI");
  const svvValue = latestMeasured("SVV");
  const currentHpi = snapshot.predictions
    .filter((prediction) => prediction.modelId === "SAFEANES-DEMO-HPI" && prediction.horizonMinutes === 5 && prediction.timestamp <= snapshot.simulationTime)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  const hpiValue = currentHpi ? Math.round(currentHpi.probability * 100) : null;
  const mapHistory = snapshot.observations.filter((observation) => observation.signal === "MAP" &&
    observation.eventTime <= snapshot.simulationTime && observation.quality.status === "GOOD" && !observation.imputed &&
    typeof observation.value === "number");
  const mapNadir = mapHistory.length ? Math.min(...mapHistory.map((observation) => observation.value as number)) : null;
  const hypotensionThreshold = snapshot.scenarioManifest.hemodynamics.hypotensionThresholdMmHg;
  const display = (value: number | null) => value === null ? "—" : value;
  const riskLabel = hpiValue === null ? "—" : hpiValue >= 70 ? t("vitals.elevated") : hpiValue >= 35 ? t("vitals.monitor") : t("vitals.stable");

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[var(--safe-panel-gap)]">
      {/* 1. MAP (ART) */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between hover:border-safe-cyan/40 transition-colors">
        <div className="flex items-center justify-between text-safe-text-muted text-xs font-semibold">
          <span className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-clinical-map" />
            {t("vitals.mapArt")}
          </span>
          <span className="text-clinical-map font-mono text-[11px]">mmHg</span>
        </div>
        <div className="my-1 flex items-baseline gap-2">
          <span className="text-clinical-xlarge text-clinical-map font-bold leading-none tabular-nums">
            {display(mapValue)}
          </span>
          <span className="text-[11px] font-mono text-safe-orange font-semibold flex items-center">
            <TrendingDown className="w-3 h-3 mr-0.5 inline" />
            {mapNadir === null ? "" : t("vitals.nadir", { value: mapNadir })}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-safe-text-muted font-mono pt-1 border-t border-safe-border-subtle">
          <span>DEMO threshold {hypotensionThreshold} mmHg</span>
          <span className={mapValue !== null && mapValue < hypotensionThreshold ? "text-safe-orange" : "text-safe-text-muted"}>
            {mapValue === null ? t("vitals.unavailable") : mapValue < hypotensionThreshold ? t("vitals.below") : t("vitals.observed")}
          </span>
        </div>
      </div>

      {/* 2. Heart Rate */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between hover:border-safe-cyan/40 transition-colors">
        <div className="flex items-center justify-between text-safe-text-muted text-xs font-semibold">
          <span className="flex items-center gap-1">
            <Heart className="w-3.5 h-3.5 text-safe-green" />
            {t("vitals.heartRate")}
          </span>
          <span className="text-safe-green font-mono text-[11px]">bpm</span>
        </div>
        <div className="my-1 flex items-baseline gap-2">
          <span className="text-clinical-xlarge text-safe-green font-bold leading-none tabular-nums">
            {display(hrValue)}
          </span>
          <span className="text-[11px] font-mono text-safe-green font-medium">
            {hrValue === null ? t("vitals.unavailable") : t("vitals.observed")}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-safe-text-muted font-mono pt-1 border-t border-safe-border-subtle">
          <span>{t("vitals.target")} 50 - 100</span>
          <span className="text-safe-green">{t("vitals.stable")}</span>
        </div>
      </div>

      {/* 3. SpO2 */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between hover:border-safe-cyan/40 transition-colors">
        <div className="flex items-center justify-between text-safe-text-muted text-xs font-semibold">
          <span className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-clinical-spo2" />
            {t("vitals.spo2")}
          </span>
          <span className="text-clinical-spo2 font-mono text-[11px]">%</span>
        </div>
        <div className="my-1 flex items-baseline gap-2">
          <span className="text-clinical-xlarge text-clinical-spo2 font-bold leading-none tabular-nums">
            {display(spo2Value)}
          </span>
          <span className="text-[11px] font-mono text-safe-green font-medium">
            {spo2Value === null ? t("vitals.unavailable") : t("vitals.observed")}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-safe-text-muted font-mono pt-1 border-t border-safe-border-subtle">
          <span>{t("vitals.target")} 95 - 100</span>
          <span className="text-safe-green">{t("vitals.normal")}</span>
        </div>
      </div>

      {/* 4. EtCO2 */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between hover:border-safe-cyan/40 transition-colors">
        <div className="flex items-center justify-between text-safe-text-muted text-xs font-semibold">
          <span className="flex items-center gap-1">
            <Wind className="w-3.5 h-3.5 text-clinical-etco2" />
            {t("vitals.etco2")}
          </span>
          <span className="text-clinical-etco2 font-mono text-[11px]">mmHg</span>
        </div>
        <div className="my-1 flex items-baseline gap-2">
          <span className="text-clinical-xlarge text-clinical-etco2 font-bold leading-none tabular-nums">
            {display(etco2Value)}
          </span>
          <span className="text-[11px] font-mono text-safe-text-dim">
            RR: {display(rrValue)}/min
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-safe-text-muted font-mono pt-1 border-t border-safe-border-subtle">
          <span>{t("vitals.target")} 35 - 45</span>
          <span className={etco2Value === null ? "text-safe-text-muted" : "text-safe-green"}>
            {etco2Value === null ? t("vitals.unavailable") : t("vitals.observed")}
          </span>
        </div>
      </div>

      {/* 5. Cardiac Index */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between hover:border-safe-cyan/40 transition-colors">
        <div className="flex items-center justify-between text-safe-text-muted text-xs font-semibold">
          <span className="flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5 text-safe-green" />
            {t("vitals.cardiacIndex")}
          </span>
          <span className="text-safe-green font-mono text-[11px]">L/min/m²</span>
        </div>
        <div className="my-1 flex items-baseline gap-2">
          <span className="text-clinical-xlarge text-safe-green font-bold leading-none tabular-nums">
            {display(ciValue)}
          </span>
          <span className="text-[11px] font-mono text-safe-text-dim">
            SVV: {display(svvValue)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-safe-text-muted font-mono pt-1 border-t border-safe-border-subtle">
          <span>{t("vitals.target")} 2.5 - 4.0</span>
          <span className="text-safe-green">{t("vitals.optimal")}</span>
        </div>
      </div>

      {/* 6. Hypotension Risk (HPI) */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between hover:border-safe-cyan/40 transition-colors">
        <div className="flex items-center justify-between text-safe-text-muted text-xs font-semibold">
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-safe-orange" />
            {t("vitals.hypotensionRisk")}
          </span>
          <span className="text-safe-orange font-mono text-[11px] font-semibold">5 min</span>
        </div>
        <div className="my-1 flex items-baseline gap-2">
          <span className="text-clinical-xlarge text-safe-orange font-bold leading-none tabular-nums">
            {hpiValue === null ? "—" : `${hpiValue}%`}
          </span>
          <span className="text-[10px] font-mono px-1 py-0.5 rounded-sm bg-safe-orange/15 text-safe-orange font-bold border border-safe-orange/40">
            {riskLabel}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-safe-text-muted font-mono pt-1 border-t border-safe-border-subtle">
          <span>SAFEANES-DEMO-HPI</span>
          <span className="text-safe-orange">{currentHpi ? t("vitals.modelEstimate") : t("vitals.unavailable")}</span>
        </div>
      </div>
    </div>
  );
}
