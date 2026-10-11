"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { RespiratoryEvent, RespiratoryCaseData } from "@/types/uc05";
import { getUC05SimulationViewModel } from "@/adapters/uc05Adapter";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { projectUC05VitalDbView } from "@/adapters/uc05VitalDbAdapter";
import { toRespiratoryVitalDbCaseData } from "@/adapters/uc05VitalDbCaseAdapter";

export const TIME_RANGE_OPTIONS = [1, 2, 4, 8, 12];

export interface RespiratoryContextType {
  caseData: RespiratoryCaseData;
  simulationMode: boolean;
  simulationTimeMs: number | null;
  caseStartTimestamp: number;
  caseEndTimestamp: number;
  cursorTimestamp: number;
  setCursorTimestamp: (timestamp: number) => void;
  timeRangeHours: number;
  setTimeRangeHours: (hours: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  highlightedEventId: string | null;
  setHighlightedEventId: (id: string | null) => void;
  selectedAlarm: RespiratoryEvent | null;
  setSelectedAlarm: (alarm: RespiratoryEvent | null) => void;
  isAlertDrawerOpen: boolean;
  setIsAlertDrawerOpen: (open: boolean) => void;
  isRiskPopoverOpen: boolean;
  setIsRiskPopoverOpen: (open: boolean) => void;
  closeAllOverlays: () => void;
}

const RespiratoryContext = createContext<RespiratoryContextType | null>(null);

export function RespiratoryProvider({ children }: {
  children: ReactNode;
}) {
  const { engine, snapshot } = useSimulationReplay();
  const vitalDb = useSafeAnesData();
  const projectedVitalDb = useMemo(() => vitalDb.mode === "VITALDB_REPLAY" && vitalDb.uc05View
    ? projectUC05VitalDbView(vitalDb.uc05View, Math.min(
      vitalDb.uc05View.as_of_s,
      vitalDb.session?.current_time_s ?? vitalDb.uc05View.as_of_s,
    ))
    : null, [vitalDb.mode, vitalDb.uc05View, vitalDb.session?.current_time_s]);
  const simulationCaseData = useMemo(() => getUC05SimulationViewModel(snapshot), [snapshot]);
  const caseData = useMemo(() => {
    if (projectedVitalDb) return toRespiratoryVitalDbCaseData(
      projectedVitalDb,
      vitalDb.session?.status ?? "PAUSED",
      vitalDb.session?.speed ?? 1,
    );
    if (vitalDb.mode !== "VITALDB_REPLAY") return simulationCaseData;
    const modelStatus = vitalDb.modelStatuses.find((item) => item.model_id.includes("UC05"));
    return {
      sourceMode: "VITALDB_REPLAY" as const,
      caseId: vitalDb.selectedCaseId ?? undefined,
      dataset: vitalDb.dataset ?? "VitalDB",
      datasetVersion: vitalDb.datasetVersion ?? "NOT_RECORDED",
      asOfSeconds: vitalDb.session?.current_time_s ?? 0,
      modelReadinessStatus: modelStatus?.readiness_status ?? vitalDb.session?.uc05_model_status ?? "MODEL_NOT_READY",
      patient: { category: "NOT_RECORDED" as const, operatingRoom: "NOT_RECORDED", anesthesiaType: "NOT_RECORDED", patientId: "NOT_RECORDED" },
      device: { batteryLevelPercent: null, batteryBars: null, isWifiConnected: null, isSensorConnected: null, isSystemOk: null, dateTimeDisplay: "NOT_RECORDED" },
      vitals: {
        etco2: null, respiratoryRate: null, spo2: null, pulseRate: null,
        timestamp: "00:00:00",
        units: { etco2: "NOT_RECORDED", respiratoryRate: "NOT_RECORDED", spo2: "NOT_RECORDED", pulseRate: "NOT_RECORDED" },
      },
      capnogramWaveform: null,
      plethWaveform: null,
      trendSeries: [],
      eventRegions: [],
      alarmReview: [],
      tabularTrends: [],
      activeAlert: null,
      signalQuality: { capnogram: "unavailable" as const, pleth: "unavailable" as const },
      riskPrediction: {
        timestamp: formatCaseRelativeTime(vitalDb.session?.current_time_s ?? 0),
        horizonMinutes: null,
        available: false,
        risk: null,
        confidence: "unavailable" as const,
        dataCoverage: null,
        missingModalities: [],
        riskStatus: "Unavailable" as const,
        subCategories: {
          ventilation: "Unavailable" as const,
          oxygenation: "Unavailable" as const,
          apneaRisk: "Unavailable" as const,
          overall: "Unavailable" as const,
        },
        sourceMode: "VITALDB_REPLAY" as const,
        task: modelStatus?.task ?? "NOT_RECORDED",
        modelName: modelStatus?.model_id ?? "SafeAnes-UC05-RespFormer",
        modelVersion: modelStatus?.model_version ?? "NOT_RECORDED",
        artifactHash: modelStatus?.artifact_hash ?? "NOT_RECORDED",
        outputRows: [],
        readinessStatus: modelStatus?.readiness_status ?? vitalDb.session?.uc05_model_status ?? "MODEL_NOT_READY",
        auxiliaryOutput: null,
      },
    };
  }, [projectedVitalDb, simulationCaseData, vitalDb.dataset, vitalDb.datasetVersion, vitalDb.mode,
    vitalDb.modelStatuses, vitalDb.selectedCaseId, vitalDb.session?.current_time_s,
    vitalDb.session?.status, vitalDb.session?.speed, vitalDb.session?.uc05_model_status]);
  const simulationMode = vitalDb.mode !== "VITALDB_REPLAY";
  const caseStartTimestamp = simulationMode ? Date.parse(snapshot.encounter.startedAt) : 0;
  const caseEndTimestamp = simulationMode
    ? caseStartTimestamp + snapshot.encounter.scheduledDurationMs
    : (vitalDb.session?.duration_seconds ?? 0) * 1_000;
  const cursorTimestamp = simulationMode
    ? caseStartTimestamp + snapshot.simulationTime
    : (vitalDb.session?.current_time_s ?? projectedVitalDb?.as_of_s ?? 0) * 1_000;
  const [timeRangeHours, setTimeRangeHoursState] = useState<number>(1);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);
  const [isAlertDrawerOpen, setIsAlertDrawerOpen] = useState<boolean>(false);
  const [isRiskPopoverOpen, setIsRiskPopoverOpen] = useState<boolean>(false);

  useEffect(() => {
    setHighlightedEventId(null);
    setSelectedAlarmId(null);
    setIsAlertDrawerOpen(false);
    setIsRiskPopoverOpen(false);
  }, [vitalDb.selectedCaseId]);

  useEffect(() => {
    if (!simulationMode && timeRangeHours > 1) setTimeRangeHoursState(1);
  }, [simulationMode, timeRangeHours]);

  const setCursorTimestamp = useCallback((timestamp: number) => {
    if (!Number.isFinite(timestamp)) return;
    if (!simulationMode) {
      void vitalDb.seek(Math.max(0, Math.min(caseEndTimestamp, timestamp)) / 1_000);
      return;
    }
    if (!engine) return;
    const targetElapsed = Math.max(0, Math.min(snapshot.encounter.scheduledDurationMs, timestamp - Date.parse(snapshot.encounter.startedAt)));
    engine.seek(targetElapsed);
  }, [simulationMode, vitalDb, engine, snapshot, caseEndTimestamp]);

  const setTimeRangeHours = useCallback((hours: number) => {
    if (!Number.isFinite(hours) || hours <= 0) return;
    setTimeRangeHoursState(simulationMode ? hours : Math.min(1, hours));
  }, [simulationMode]);

  const setSelectedAlarm = useCallback((alarm: RespiratoryEvent | null) => {
    setSelectedAlarmId(alarm?.id ?? null);
    if (alarm) setCursorTimestamp(alarm.timestampMs);
  }, [setCursorTimestamp]);

  const selectedAlarm = useMemo(
    () => caseData.alarmReview.find((alarm) => alarm.id === selectedAlarmId) ?? null,
    [caseData.alarmReview, selectedAlarmId]
  );

  useEffect(() => {
    if (selectedAlarmId && !caseData.alarmReview.some((alarm) => alarm.id === selectedAlarmId)) {
      setSelectedAlarmId(null);
    }
    if (highlightedEventId && !caseData.alarmReview.some((alarm) => alarm.id === highlightedEventId) &&
      !caseData.eventRegions.some((region) => region.id === highlightedEventId || region.alarmId === highlightedEventId)) {
      setHighlightedEventId(null);
    }
  }, [caseData.alarmReview, caseData.eventRegions, selectedAlarmId, highlightedEventId]);

  const zoomIn = useCallback(() => {
    setTimeRangeHoursState((previous) => {
      const index = TIME_RANGE_OPTIONS.indexOf(previous);
      return index > 0 ? TIME_RANGE_OPTIONS[index - 1] : previous;
    });
  }, [simulationMode]);

  const zoomOut = useCallback(() => {
    if (!simulationMode) return;
    setTimeRangeHoursState((previous) => {
      const index = TIME_RANGE_OPTIONS.indexOf(previous);
      return index >= 0 && index < TIME_RANGE_OPTIONS.length - 1 ? TIME_RANGE_OPTIONS[index + 1] : previous;
    });
  }, [simulationMode]);

  const closeAllOverlays = useCallback(() => {
    setSelectedAlarmId(null);
    setIsAlertDrawerOpen(false);
    setIsRiskPopoverOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAllOverlays();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAllOverlays]);

  return (
    <RespiratoryContext.Provider value={{
      caseData,
      simulationMode,
      simulationTimeMs: simulationMode ? snapshot?.simulationTime ?? null : (vitalDb.session?.current_time_s ?? 0) * 1_000,
      caseStartTimestamp,
      caseEndTimestamp,
      cursorTimestamp,
      setCursorTimestamp,
      timeRangeHours,
      setTimeRangeHours,
      zoomIn,
      zoomOut,
      highlightedEventId,
      setHighlightedEventId,
      selectedAlarm,
      setSelectedAlarm,
      isAlertDrawerOpen,
      setIsAlertDrawerOpen,
      isRiskPopoverOpen,
      setIsRiskPopoverOpen,
      closeAllOverlays,
  }}>
      {children}
    </RespiratoryContext.Provider>
  );
}

function formatCaseRelativeTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

export function useRespiratory() {
  const context = useContext(RespiratoryContext);
  if (!context) throw new Error("useRespiratory must be used within RespiratoryProvider");
  return context;
}

export const useTrendSync = useRespiratory;
export const TrendSyncProvider = RespiratoryProvider;
