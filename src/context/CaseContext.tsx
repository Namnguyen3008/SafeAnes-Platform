"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import type {
  CaseContext,
  ClinicalAlert,
  ClinicalVitals,
  DeviceStatus,
  PerioperativePhase,
  PatientContext,
  SafeAnesCaseState,
} from "@/types/clinical";
import type { PerioperativeCaseState } from "@/types/uc01";
import { adaptUc01Snapshot } from "@/simulation/adapters/uc01Adapter";
import { formatCaseTime } from "@/simulation/formatTime";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import type { SimulationAlert, SimulationEvent } from "@/simulation";

export interface SafeAnesCaseContextValue {
  /** Compatibility projection of the active canonical simulation snapshot. */
  caseState: SafeAnesCaseState;
  patient: PatientContext;
  caseContext: CaseContext;
  currentTime: string;
  perioperativePhase: PerioperativePhase;
  deviceStatus: DeviceStatus;
  activeAlerts: ClinicalAlert[];
  vitals: ClinicalVitals;
  activeCaseId: string;
  setCurrentTime: (timeStr: string) => void;
  setPerioperativePhase: (phase: PerioperativePhase) => void;
  acknowledgeAlert: (alertId: string) => void;
  dismissAlert: (alertId: string) => void;
  uc01Data: PerioperativeCaseState;
}

const SafeAnesCaseContext = createContext<SafeAnesCaseContextValue | undefined>(undefined);

/**
 * Legacy shell-facing case projection. Every runtime value is derived from the
 * persistent simulation provider; this context owns no patient or case state.
 */
export function SafeAnesCaseProvider({ children }: { children: React.ReactNode }) {
  const { engine, snapshot } = useSimulationReplay();
  const params = useParams<{ caseId?: string }>();
  const actionSequence = useRef(0);
  const currentTime = formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime);
  const perioperativePhase = getGlobalPhase(snapshot.perioperativePhases);
  const patient = toPatientContext(snapshot);
  const caseContext = toCaseContext(snapshot, perioperativePhase);
  const deviceStatus = toDeviceStatus(snapshot);
  const vitals = toClinicalVitals(snapshot);
  const activeAlerts = snapshot.alerts
    .filter((alert) => alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED")
    .map((alert) => toClinicalAlert(alert, snapshot.encounter.startedAt));
  const caseState = useMemo<SafeAnesCaseState>(() => ({
    patient,
    caseContext,
    devices: deviceStatus,
    vitals,
    activeAlerts,
  }), [patient, caseContext, deviceStatus, vitals, activeAlerts]);
  const uc01Data = useMemo(() => adaptUc01Snapshot(snapshot), [snapshot]);

  const dispatchAction = useCallback((eventType: string, payload: Record<string, unknown>) => {
    const eventTime = engine.simulationTime;
    let id: string;
    do {
      actionSequence.current += 1;
      id = `case-action-${Math.trunc(eventTime)}-${actionSequence.current}`;
    } while (engine.hasEvent(id));
    const event: SimulationEvent<Record<string, unknown>> = {
      id,
      eventTime,
      recordedTime: eventTime,
      source: "safeanes-shell-action",
      sourceType: "MANUAL",
      eventType,
      payload: { ...payload, synthetic: true, clinicalUse: false },
      provenance: "CLINICIAN_CONFIRMED",
    };
    engine.dispatchEvent(event);
  }, [engine]);

  const setCurrentTime = useCallback((time: string) => {
    engine.seek(elapsedForTime(time, snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs));
  }, [engine, snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs]);

  const setPerioperativePhase = useCallback((phase: PerioperativePhase) => {
    const phaseId: Partial<Record<PerioperativePhase, string>> = {
      PREOPERATIVE: "preoperative",
      INDUCTION: "induction",
      MAINTENANCE: "maintenance",
      EMERGENCE: "emergence",
      PACU: "transfer-pacu",
    };
    const target = snapshot.perioperativePhases.find((item) => item.id === phaseId[phase]);
    if (target) engine.seek(target.startTime);
  }, [engine, snapshot.perioperativePhases]);

  const acknowledgeAlert = useCallback((alertId: string) => {
    const alert = snapshot.alerts.find((item) => item.id === alertId);
    if (alert?.status === "ACTIVE") dispatchAction("ALERT_ACKNOWLEDGED", { alertId });
  }, [dispatchAction, snapshot.alerts]);

  const dismissAlert = useCallback((alertId: string) => {
    const alert = snapshot.alerts.find((item) => item.id === alertId);
    if (alert && alert.status !== "RESOLVED") dispatchAction("ALERT_RESOLVED", { alertId });
  }, [dispatchAction, snapshot.alerts]);

  const value = useMemo<SafeAnesCaseContextValue>(() => ({
    caseState,
    patient,
    caseContext,
    currentTime,
    perioperativePhase,
    deviceStatus,
    activeAlerts,
    vitals,
    activeCaseId: params?.caseId ?? "demo",
    setCurrentTime,
    setPerioperativePhase,
    acknowledgeAlert,
    dismissAlert,
    uc01Data,
  }), [
    caseState,
    patient,
    caseContext,
    currentTime,
    perioperativePhase,
    deviceStatus,
    activeAlerts,
    vitals,
    params?.caseId,
    setCurrentTime,
    setPerioperativePhase,
    acknowledgeAlert,
    dismissAlert,
    uc01Data,
  ]);

  return <SafeAnesCaseContext.Provider value={value}>{children}</SafeAnesCaseContext.Provider>;
}

export function useSafeAnesCase(): SafeAnesCaseContextValue {
  const context = useContext(SafeAnesCaseContext);
  if (!context) throw new Error("useSafeAnesCase must be used within SafeAnesCaseProvider");
  return context;
}

export const CaseProvider = SafeAnesCaseProvider;
export const useCase = useSafeAnesCase;
export default SafeAnesCaseProvider;

function toPatientContext(snapshot: ReturnType<ReturnType<typeof useSimulationReplay>["engine"]["getSnapshot"]>): PatientContext {
  return {
    id: snapshot.patient.patientId,
    mrn: snapshot.patient.patientId,
    fullName: "Synthetic Demo Patient",
    ageYears: snapshot.patient.ageYears,
    sex: snapshot.patient.sex === "Unknown" ? "Other" : snapshot.patient.sex,
    weightKg: snapshot.patient.weightKg,
    heightCm: snapshot.patient.heightCm,
    bmi: null,
    asaStatus: `ASA ${snapshot.patient.asa}` as PatientContext["asaStatus"],
    allergies: snapshot.patient.allergies.map((allergy) => ({ ...allergy })),
    comorbidities: [...snapshot.patient.comorbidities],
  };
}

function toCaseContext(
  snapshot: ReturnType<ReturnType<typeof useSimulationReplay>["engine"]["getSnapshot"]>,
  phase: PerioperativePhase,
): CaseContext {
  return {
    caseId: snapshot.encounter.caseId,
    orRoom: snapshot.procedure.operatingRoom,
    procedureName: snapshot.procedure.name,
    primarySurgeon: snapshot.procedure.surgeon ?? "Not recorded in this synthetic case",
    leadAnesthesiologist: "Not recorded in this synthetic case",
    anesthesiaPlan: snapshot.procedure.anesthesia,
    caseStatus: snapshot.encounter.status === "COMPLETED" ? "COMPLETED" : "LIVE",
    startTime: formatCaseTime(snapshot.encounter.startedAt, 0),
    scheduledDurationMin: snapshot.encounter.scheduledDurationMs / 60_000,
    activePhase: phase,
  };
}

function toDeviceStatus(
  snapshot: ReturnType<ReturnType<typeof useSimulationReplay>["engine"]["getSnapshot"]>,
): DeviceStatus {
  const batteryValues = snapshot.devices
    .map((device) => device.batteryPercent)
    .filter((value): value is number => value !== undefined);
  const offsets = snapshot.devices.map((device) => Math.abs(device.clockOffsetMs));
  const hasDisconnected = snapshot.devices.some((device) => device.status === "DISCONNECTED");
  const hasDegraded = snapshot.devices.some((device) => device.status === "DEGRADED");
  return {
    systemClock: formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime),
    elapsedSeconds: Math.floor(snapshot.simulationTime / 1_000),
    isTelemetryOnline: !hasDisconnected,
    batteryPercent: batteryValues.length
      ? Math.round(batteryValues.reduce((sum, value) => sum + value, 0) / batteryValues.length)
      : null,
    batteryBars: batteryValues.length
      ? Math.round(batteryValues.reduce((sum, value) => sum + value, 0) / batteryValues.length / 25)
      : null,
    isWifiConnected: null,
    signalQuality: hasDisconnected ? "UNAVAILABLE" : hasDegraded ? "DEGRADED" : "GOOD",
    syncOffsetMs: Math.max(0, ...offsets),
  };
}

function toClinicalVitals(
  snapshot: ReturnType<ReturnType<typeof useSimulationReplay>["engine"]["getSnapshot"]>,
): ClinicalVitals {
  const measured = (signal: string) => {
    const observation = snapshot.observations
      .filter((item) => item.signal === signal && item.eventTime <= snapshot.simulationTime && item.receivedTime <= snapshot.simulationTime)
      .sort((left, right) => right.eventTime - left.eventTime)[0];
    if (!observation || observation.imputed || observation.quality.status !== "GOOD" || typeof observation.value !== "number") return null;
    const issue = snapshot.qualityStates.find((state) => state.signal === signal && state.sourceDevice === observation.sourceDevice &&
      state.eventTime <= snapshot.simulationTime && (state.validUntilTime === undefined || snapshot.simulationTime < state.validUntilTime));
    if (issue && issue.status !== "GOOD") return null;
    return observation.value;
  };
  const prediction = [...snapshot.predictions]
    .filter((item) => item.timestamp <= snapshot.simulationTime && item.modelId === "SAFEANES-DEMO-HPI" && item.horizonMinutes === 5)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  return {
    map: measured("MAP"),
    sbp: measured("SBP"),
    dbp: measured("DBP"),
    hr: measured("HR"),
    spo2: measured("SPO2"),
    etco2: measured("ETCO2"),
    rr: measured("RR"),
    temperature: null,
    ci: measured("CI"),
    svv: measured("SVV"),
    hpi: prediction ? prediction.probability * 100 : null,
    timestamp: formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime),
  };
}

function toClinicalAlert(alert: SimulationAlert, startedAt: string): ClinicalAlert {
  const sourceModule = {
    UC01: "SITUATION",
    UC02: "RECORD",
    UC03: "MEDICATION",
    UC04: "HEMODYNAMICS",
    UC05: "RESPIRATORY",
  } as const satisfies Record<SimulationAlert["sourceModule"], ClinicalAlert["sourceModule"]>;
  return {
    id: alert.id,
    code: alert.code,
    severity: alert.severity === "CRITICAL" || alert.severity === "HIGH"
      ? alert.severity
      : alert.severity === "INFO" ? "INFO" : "WARNING",
    title: alert.title,
    message: alert.message,
    timestamp: formatCaseTime(startedAt, alert.firstTriggerTime ?? alert.eventTime),
    sourceModule: sourceModule[alert.sourceModule],
    acknowledged: alert.status !== "ACTIVE",
  };
}

function getGlobalPhase(phases: ReturnType<ReturnType<typeof useSimulationReplay>["engine"]["getSnapshot"]>["perioperativePhases"]): PerioperativePhase {
  const current = phases.find((phase) => phase.status === "CURRENT");
  const id = current?.id ?? "preoperative";
  if (id === "preoperative") return "PREOPERATIVE";
  if (id === "induction") return "INDUCTION";
  if (id === "emergence") return "EMERGENCE";
  if (id === "transfer-pacu" || id === "complete") return "PACU";
  return "MAINTENANCE";
}

function elapsedForTime(time: string, startedAt: string, durationMs: number): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time.trim());
  if (!match) return 0;
  const start = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(startedAt);
  const startSeconds = start ? Number(start[1]) * 3_600 + Number(start[2]) * 60 + Number(start[3] ?? 0) : 0;
  const targetSeconds = Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
  return Math.max(0, Math.min(durationMs, (targetSeconds - startSeconds + 86_400) % 86_400 * 1_000));
}
