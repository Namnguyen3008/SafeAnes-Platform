"use client";

import React from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  FileText,
  Syringe,
  Activity,
  Wind,
  ArrowRight,
  HeartPulse,
} from "lucide-react";
import { useSafeAnesSimulation } from "@/context/SimulationReplayContext";
import { useTranslation } from "@/context/LocalizationContext";

interface ModuleSummaryGridProps {
  caseId: string;
}

export function ModuleSummaryGrid({ caseId }: ModuleSummaryGridProps) {
  const simulation = useSafeAnesSimulation();
  const snapshot = simulation.snapshot;
  const { t } = useTranslation("overview");

  const basePath = `/safeanes/case/${caseId}`;
  const latestMeasured = (signal: string) => snapshot.observations
    .filter((observation) => observation.signal === signal && observation.eventTime <= snapshot.simulationTime &&
      observation.receivedTime <= snapshot.simulationTime && observation.quality.status === "GOOD" &&
      !observation.imputed && typeof observation.value === "number")
    .filter((observation) => {
      const activeQuality = snapshot.qualityStates.find((quality) => quality.signal === signal &&
        quality.sourceDevice === observation.sourceDevice && quality.eventTime <= snapshot.simulationTime &&
        (quality.validUntilTime === undefined || snapshot.simulationTime < quality.validUntilTime));
      return !activeQuality || activeQuality.status === "GOOD";
    })
    .sort((left, right) => right.eventTime - left.eventTime)[0]?.value ?? null;
  const display = (value: number | null) => value === null ? "—" : value;
  const currentQuality = [...snapshot.qualityStates]
    .filter((quality) => quality.eventTime <= snapshot.simulationTime &&
      (quality.validUntilTime === undefined || snapshot.simulationTime < quality.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const qualityLabel = currentQuality?.status ?? "GOOD";
  const connectedDevices = snapshot.devices.filter((device) => device.status === "CONNECTED").length;
  const devicesWithTelemetry = snapshot.devices.length;
  const averageLatency = devicesWithTelemetry
    ? Math.round(snapshot.devices.reduce((sum, device) => sum + device.latencyMs, 0) / devicesWithTelemetry)
    : null;
  const workflowMarkers = new Set<string>();
  for (const event of snapshot.events) {
    if (event.eventTime > snapshot.simulationTime) continue;
    const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
    if (["CASE_STARTED", "PATIENT_ENTERED_OR", "AIRWAY_SECURED", "PROCEDURE_STARTED", "PATIENT_TRANSFERRED", "CASE_COMPLETED"].includes(event.eventType)) {
      workflowMarkers.add(event.eventType);
    }
    if (event.eventType === "PHASE_STARTED" && ["induction", "maintenance", "emergence"].includes(String(payload.phaseId))) {
      workflowMarkers.add(`phase-${String(payload.phaseId)}`);
    }
  }
  const completedWorkflowSteps = workflowMarkers.size;
  const workflowTotal = 9;
  const claims = simulation.claims;
  const claimsRequiringReview = claims.filter((claim) => claim.reviewStatus === "REQUIRES_REVIEW").length;
  const blockingClaims = claims.filter((claim) => claim.reviewStatus !== "REJECTED" && claim.validation &&
    (!claim.validation.evidenceId || !claim.validation.number || !claim.validation.unit || !claim.validation.timestamp || !claim.validation.entity)).length;
  const firstClaim = claims[0];
  const medicationAlerts = snapshot.alerts.filter((alert) => alert.sourceModule === "UC03" &&
    (alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED"));
  const activeMedicationAlert = medicationAlerts.find((alert) => alert.status === "ACTIVE");
  const activeMedications = snapshot.medications.filter((medication) => ["ORDERED", "PROPOSED", "INFUSING", "RATE_CHANGED"].includes(medication.status)).length;
  const hpiPrediction = [...snapshot.predictions]
    .filter((prediction) => prediction.modelId === "SAFEANES-DEMO-HPI" && prediction.horizonMinutes === 5 && prediction.timestamp <= snapshot.simulationTime)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  const respiratoryPrediction = [...snapshot.predictions]
    .filter((prediction) => prediction.modelId === "SAFEANES-DEMO-RESP-v0.1" && prediction.timestamp <= snapshot.simulationTime)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  const respiratoryAlerts = snapshot.alerts.filter((alert) => alert.sourceModule === "UC05" &&
    (alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED"));
  const activeRespiratoryAlert = respiratoryAlerts.find((alert) => alert.status === "ACTIVE");
  const lowMapEpisode = snapshot.episodes.find((episode) => episode.id === "episode-hemodynamic-low-map" && episode.startTime <= snapshot.simulationTime);
  const respiratoryEpisode = snapshot.episodes.find((episode) => episode.id === "episode-respiratory-deterioration-candidate" && episode.startTime <= snapshot.simulationTime);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[var(--safe-panel-gap)]">
      {/* 1. SITUATION — Data & Workflow */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-3.5 flex flex-col justify-between hover:border-safe-cyan/60 transition-all duration-200 group">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-safe-border-subtle mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-safe-cyan/10 border border-safe-cyan/30 text-safe-cyan">
                <ClipboardCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-panel-title text-safe-text font-bold">{t("modules.situationTitle")}</h3>
                <p className="text-[11px] text-safe-text-muted">{t("modules.situationSubtitle")}</p>
              </div>
            </div>
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-sm border ${qualityLabel === "GOOD" ? "bg-safe-green/10 text-safe-green border-safe-green/30" : "bg-safe-yellow/10 text-safe-yellow border-safe-yellow/30"}`}>
              {qualityLabel === "GOOD" ? t("modules.onTrack") : qualityLabel}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.workflowMetric")}</span>
              <span className="text-base font-bold text-safe-text tabular-nums font-mono mt-0.5">
                {completedWorkflowSteps} / {workflowTotal}
              </span>
              <span className="text-[10px] text-safe-green font-mono">{Math.round(completedWorkflowSteps / workflowTotal * 100)}%</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.devicesMetric")}</span>
              <span className="text-base font-bold text-safe-text tabular-nums font-mono mt-0.5">
                {connectedDevices} / {devicesWithTelemetry}
              </span>
              <span className={`text-[10px] font-mono ${connectedDevices === devicesWithTelemetry ? "text-safe-green" : "text-safe-yellow"}`}>
                {connectedDevices === devicesWithTelemetry ? t("modules.subBadges.healthy") : t("command.degraded")}
              </span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.dataQualityMetric")}</span>
              <span className={`text-base font-bold tabular-nums font-mono mt-0.5 ${qualityLabel === "GOOD" ? "text-safe-green" : "text-safe-yellow"}`}>
                {qualityLabel}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">{t("modules.subBadges.latencyMs", { ms: averageLatency ?? "—" })}</span>
            </div>
          </div>

          {/* Context note */}
          <p className="text-xs text-safe-text-muted mt-2.5 line-clamp-2">
            {t("modules.situationDesc")}
          </p>
        </div>

        {/* Action Link */}
        <div className="pt-3 mt-3 border-t border-safe-border-subtle">
          <Link
            href={`${basePath}/situation`}
            className="flex items-center justify-between w-full py-1.5 px-2.5 rounded-sm bg-safe-surface-secondary hover:bg-safe-cyan/15 text-safe-cyan text-xs font-semibold border border-safe-cyan/30 group-hover:border-safe-cyan transition-colors"
          >
            <span>{t("modules.openSituation")}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>


      {/* 2. RECORD — Anaesthesia Record Review */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-3.5 flex flex-col justify-between hover:border-safe-cyan/60 transition-all duration-200 group">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-safe-border-subtle mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-safe-yellow/10 border border-safe-yellow/30 text-safe-yellow">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-panel-title text-safe-text font-bold">{t("modules.recordTitle")}</h3>
                <p className="text-[11px] text-safe-text-muted">{t("modules.recordSubtitle")}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-sm bg-safe-yellow/10 text-safe-yellow border border-safe-yellow/30">
              {t("modules.reviewNeeded")}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.generatedClaimsMetric")}</span>
              <span className="text-base font-bold text-safe-text tabular-nums font-mono mt-0.5">
              {claims.length}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">{t("modules.subBadges.evidenceLinked")}</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.requiresReviewMetric")}</span>
              <span className="text-base font-bold text-safe-yellow tabular-nums font-mono mt-0.5">
                {claimsRequiringReview}
              </span>
              <span className="text-[10px] text-safe-yellow font-mono">{t("modules.subBadges.pendingSignoff")}</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.blockingIssuesMetric")}</span>
              <span className="text-base font-bold text-clinical-alert-critical tabular-nums font-mono mt-0.5">
                {blockingClaims}
              </span>
              <span className="text-[10px] text-clinical-alert-critical font-mono">{t("modules.subBadges.airwayPlan")}</span>
            </div>
          </div>

          {/* Context note */}
          <p className="text-xs text-safe-text-muted mt-2.5 line-clamp-2">
            {t("modules.recordDesc")}
          </p>
        </div>

        {/* Action Link */}
        <div className="pt-3 mt-3 border-t border-safe-border-subtle">
          <Link
            href={`${basePath}/record${firstClaim ? `?claim=${encodeURIComponent(firstClaim.id)}` : ""}`}
            className="flex items-center justify-between w-full py-1.5 px-2.5 rounded-sm bg-safe-surface-secondary hover:bg-safe-cyan/15 text-safe-cyan text-xs font-semibold border border-safe-cyan/30 group-hover:border-safe-cyan transition-colors"
          >
            <span>{t("modules.openRecord")}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

      {/* 3. MEDICATION — Medication Safety */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-3.5 flex flex-col justify-between hover:border-safe-cyan/60 transition-all duration-200 group">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-safe-border-subtle mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-clinical-alert-critical/10 border border-clinical-alert-critical/30 text-clinical-alert-critical">
                <Syringe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-panel-title text-safe-text font-bold">{t("modules.medicationTitle")}</h3>
                <p className="text-[11px] text-safe-text-muted">{t("modules.medicationSubtitle")}</p>
              </div>
            </div>
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-sm border ${activeMedicationAlert ? "bg-clinical-alert-critical/15 text-clinical-alert-critical border-clinical-alert-critical/40" : "bg-safe-surface-secondary text-safe-text-muted border-safe-border-light"}`}>
              {activeMedicationAlert ? t("modules.highAlertCount", { count: medicationAlerts.length }) : t("vitals.stable")}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.activeMedicationsMetric")}</span>
              <span className="text-base font-bold text-safe-text tabular-nums font-mono mt-0.5">
                {activeMedications}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">infusions & bolus</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.highAlertsMetric")}</span>
              <span className="text-base font-bold text-clinical-alert-critical tabular-nums font-mono mt-0.5">
                {medicationAlerts.filter((alert) => ["HIGH", "CRITICAL"].includes(alert.severity)).length}
              </span>
              <span className="text-[10px] text-clinical-alert-critical font-mono">{activeMedicationAlert?.rule?.id ?? "—"}</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.advisoriesMetric")}</span>
              <span className="text-base font-bold text-safe-yellow tabular-nums font-mono mt-0.5">
                {medicationAlerts.filter((alert) => !["HIGH", "CRITICAL"].includes(alert.severity)).length}
              </span>
              <span className="text-[10px] text-safe-yellow font-mono">{t("modules.syntheticDemo")}</span>
            </div>
          </div>

          {/* Context note */}
          <p className="text-xs text-safe-text-muted mt-2.5 line-clamp-2">
            {t("modules.medicationDesc")}
          </p>
        </div>

        {/* Action Link */}
        <div className="pt-3 mt-3 border-t border-safe-border-subtle">
          <Link
            href={`${basePath}/medications${activeMedicationAlert ? `?medication=${encodeURIComponent(activeMedicationAlert.medicationId ?? "")}&alert=${encodeURIComponent(activeMedicationAlert.id)}` : ""}`}
            className="flex items-center justify-between w-full py-1.5 px-2.5 rounded-sm bg-safe-surface-secondary hover:bg-safe-cyan/15 text-safe-cyan text-xs font-semibold border border-safe-cyan/30 group-hover:border-safe-cyan transition-colors"
          >
            <span>{t("modules.openMedications")}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

      {/* 4. HEMODYNAMICS — Hemodynamic Intelligence */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-3.5 flex flex-col justify-between hover:border-safe-cyan/60 transition-all duration-200 group">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-safe-border-subtle mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-safe-orange/10 border border-safe-orange/30 text-safe-orange">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-panel-title text-safe-text font-bold">{t("modules.hemodynamicsTitle")}</h3>
                <p className="text-[11px] text-safe-text-muted">{t("modules.hemodynamicsSubtitle")}</p>
              </div>
            </div>
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-sm border ${hpiPrediction && hpiPrediction.probability >= 0.7 ? "bg-safe-orange/15 text-safe-orange border-safe-orange/40" : "bg-safe-surface-secondary text-safe-text-muted border-safe-border-light"}`}>
              {hpiPrediction ? `${Math.round(hpiPrediction.probability * 100)}%` : "—"}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 py-1">
            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.mapMetric")}</span>
              <span className="text-xl font-bold text-clinical-map tabular-nums font-mono mt-0.5">
                {display(latestMeasured("MAP"))} <span className="text-xs font-normal text-safe-text-dim">mmHg</span>
              </span>
              <span className="text-[10px] text-safe-yellow font-mono">DEMO threshold {snapshot.scenarioManifest.hemodynamics.hypotensionThresholdMmHg} mmHg</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.hypotensionRiskMetric")}</span>
              <span className="text-xl font-bold text-safe-orange tabular-nums font-mono mt-0.5">
                {hpiPrediction ? `${Math.round(hpiPrediction.probability * 100)}%` : "—"} <span className="text-xs font-normal text-safe-text-dim">{t("modules.subBadges.at5Min")}</span>
              </span>
              <span className="text-[10px] text-safe-orange font-mono">SAFEANES-DEMO-HPI · {t("modules.syntheticDemo")}</span>
            </div>
          </div>

          {/* Context note */}
          <p className="text-xs text-safe-text-muted mt-2.5 line-clamp-2">
            {t("modules.hemodynamicsDesc")}
          </p>
        </div>

        {/* Action Link */}
        <div className="pt-3 mt-3 border-t border-safe-border-subtle">
          <Link
            href={`${basePath}/hemodynamics${lowMapEpisode ? "?event=episode-hemodynamic-low-map-detected" : ""}`}
            className="flex items-center justify-between w-full py-1.5 px-2.5 rounded-sm bg-safe-surface-secondary hover:bg-safe-cyan/15 text-safe-cyan text-xs font-semibold border border-safe-cyan/30 group-hover:border-safe-cyan transition-colors"
          >
            <span>{t("modules.openHemodynamics")}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

      {/* 5. RESPIRATORY — Respiratory Intelligence */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-3.5 flex flex-col justify-between hover:border-safe-cyan/60 transition-all duration-200 group">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-safe-border-subtle mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-clinical-spo2/10 border border-clinical-spo2/30 text-clinical-spo2">
                <Wind className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-panel-title text-safe-text font-bold">{t("modules.respiratoryTitle")}</h3>
                <p className="text-[11px] text-safe-text-muted">{t("modules.respiratorySubtitle")}</p>
              </div>
            </div>
            <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-sm border ${activeRespiratoryAlert ? "bg-clinical-alert-critical/15 text-clinical-alert-critical border-clinical-alert-critical/40" : "bg-safe-green/10 text-safe-green border-safe-green/30"}`}>
              {activeRespiratoryAlert ? activeRespiratoryAlert.severity : t("vitals.stable")}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 py-1">
            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">EtCO2</span>
              <span className="text-base font-bold text-clinical-etco2 tabular-nums font-mono mt-0.5">
                {display(latestMeasured("ETCO2"))}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">mmHg · {latestMeasured("ETCO2") === null ? t("vitals.unavailable") : t("vitals.observed")}</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">SpO2</span>
              <span className="text-base font-bold text-clinical-spo2 tabular-nums font-mono mt-0.5">
                {display(latestMeasured("SPO2"))}{latestMeasured("SPO2") === null ? "" : "%"}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">{latestMeasured("SPO2") === null ? t("vitals.unavailable") : t("vitals.observed")}</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.respiratoryRiskMetric")}</span>
              <span className="text-base font-bold text-safe-green tabular-nums font-mono mt-0.5">
                {respiratoryPrediction ? `${Math.round(respiratoryPrediction.probability * 100)}%` : "—"}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">{t("modules.syntheticDemo")}</span>
            </div>
          </div>

          {/* Context note */}
          <p className="text-xs text-safe-text-muted mt-2.5 line-clamp-2">
            {t("modules.respiratoryDesc")}
          </p>
        </div>

        {/* Action Link */}
        <div className="pt-3 mt-3 border-t border-safe-border-subtle">
          <Link
            href={`${basePath}/respiratory${respiratoryEpisode ? "?event=episode-respiratory-deterioration-candidate" : ""}`}
            className="flex items-center justify-between w-full py-1.5 px-2.5 rounded-sm bg-safe-surface-secondary hover:bg-safe-cyan/15 text-safe-cyan text-xs font-semibold border border-safe-cyan/30 group-hover:border-safe-cyan transition-colors"
          >
            <span>{t("modules.openRespiratory")}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

      {/* 6. EXECUTIVE CASE GOVERNANCE & AUDIT TRAIL TILE */}
      <div className="bg-safe-surface border border-safe-border rounded-sm p-3.5 flex flex-col justify-between hover:border-safe-cyan/60 transition-all duration-200 group">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-safe-border-subtle mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-sm bg-safe-cyan/10 border border-safe-cyan/30 text-safe-cyan">
                <HeartPulse className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-panel-title text-safe-text font-bold">{t("modules.governanceTitle")}</h3>
                <p className="text-[11px] text-safe-text-muted">{t("modules.governanceSubtitle")}</p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-sm bg-safe-cyan/10 text-safe-cyan border border-safe-cyan/30">
              {t("modules.syntheticDemo")}
            </span>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 py-1">
            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.auditTelemetryMetric")}</span>
              <span className="text-base font-bold text-safe-text tabular-nums font-mono mt-0.5">
                {snapshot.events.length}
              </span>
              <span className="text-[10px] text-safe-green font-mono">{t("modules.canonicalEvents")}</span>
            </div>

            <div className="p-2 rounded-sm bg-safe-surface-secondary border border-safe-border-light flex flex-col">
              <span className="text-[10px] text-safe-text-muted font-medium">{t("modules.replaySnapshotMetric")}</span>
              <span className="text-base font-bold text-safe-cyan tabular-nums font-mono mt-0.5">
                {snapshot.status}
              </span>
              <span className="text-[10px] text-safe-text-dim font-mono">{formatElapsed(snapshot.simulationTime)} elapsed</span>
            </div>
          </div>

          {/* Context note */}
          <p className="text-xs text-safe-text-muted mt-2.5 line-clamp-2">
            {t("modules.governanceDesc")}
          </p>
        </div>

        {/* Action Link */}
        <div className="pt-3 mt-3 border-t border-safe-border-subtle">
          <Link
            href={`${basePath}/data-integrity`}
            className="flex items-center justify-between w-full py-1.5 px-2.5 rounded-sm bg-safe-surface-secondary hover:bg-safe-cyan/15 text-safe-cyan text-xs font-semibold border border-safe-cyan/30 group-hover:border-safe-cyan transition-colors"
          >
            <span>{t("modules.openGovernance")}</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

    </div>
  );
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}
