"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import {
  PatientContext,
  DeviceStatus,
  HemodynamicVitals,
  HemodynamicTrendSample,
  HemodynamicPrediction,
  ForecastHorizon,
  HemodynamicEvent,
  HemodynamicRelationshipState,
  CaseAlert,
} from "@/types/uc04";
import { getUC04SimulationViewModel, getUC04VitalDbWorkspaceViewModel, UC04CaseViewModel } from "@/adapters/uc04Adapter";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import type { UC04VitalDbProjection } from "@/adapters/uc04VitalDbAdapter";
import { projectUC04VitalDbView } from "@/adapters/uc04VitalDbAdapter";
import { formatCaseTime } from "@/simulation/formatTime";
import type { WaveformSegment } from "@/simulation/types/waveforms";
import type { WaveformRenderSource } from "@/simulation/types/waveforms";

export interface TrackHoverInfo {
  visible: boolean;
  x: number;
  y: number;
  time: string;
  param: string;
  value: string | number;
  unit: string;
}

export interface HemodynamicContextType {
  dataSourceMode: "SYNTHETIC_DEMO" | "VITALDB_REPLAY";
  vitalDbProjection: UC04VitalDbProjection | null;
  vitalDbCaseId: string | null;
  vitalDbCurrentTimeSeconds: number | null;
  // Case context & hardware status
  patientContext: PatientContext;
  deviceStatus: DeviceStatus;
  vitals: HemodynamicVitals;
  trendSamples: HemodynamicTrendSample[];
  prediction: HemodynamicPrediction;
  forecastHorizons: ForecastHorizon[];
  relationship: HemodynamicRelationshipState;
  events: HemodynamicEvent[];
  activeAlert: CaseAlert | null;
  simulationTimeMs: number | null;
  trendWindow: { start: string; end: string };
  abpWaveform: WaveformSegment | null;
  abpWaveformSource: WaveformRenderSource;
  abpWaveformTimestamp: string | null;
  medicationOverlap: { timestamp: string; medicationName: string } | null;
  riskAlertThresholdPercent: number | null;

  // Active timeline cursor & live state
  cursorTime: string;
  setCursorTime: (time: string) => void;
  isLive: boolean;
  setIsLive: (live: boolean) => void;

  // Event Selection
  selectedEventId: string | null;
  selectEvent: (event: HemodynamicEvent) => void;

  // Track hover tooltip
  trackHover: TrackHoverInfo | null;
  setTrackHover: (info: TrackHoverInfo | null) => void;

  // Dialog & Popover states
  isHpiPopoverOpen: boolean;
  setIsHpiPopoverOpen: (open: boolean) => void;
  isAlertDialogOpen: boolean;
  setIsAlertDialogOpen: (open: boolean) => void;
}

const HemodynamicContext = createContext<HemodynamicContextType | null>(null);

export function HemodynamicProvider({ children }: { children: React.ReactNode }) {
  const { engine, snapshot } = useSimulationReplay();
  const vitalDb = useSafeAnesData();
  const vitalDbTime = vitalDb.session?.current_time_s ?? 0;
  const vitalDbProjection = useMemo(() => {
    if (vitalDb.mode !== "VITALDB_REPLAY" || !vitalDb.view) return null;
    return projectUC04VitalDbView(
      vitalDb.view,
      Math.min(vitalDb.view.as_of_s, vitalDbTime)
    );
  }, [vitalDb.mode, vitalDb.view, vitalDbTime]);
  const vitalDbModelReadiness = vitalDb.modelStatuses.find((item) => item.model_id.includes("UC04"))?.readiness_status
    ?? vitalDb.session?.uc04_model_status
    ?? "MODEL_NOT_READY";
  const simulationSnapshot = vitalDb.mode === "SYNTHETIC_DEMO" ? snapshot : null;
  const simulationViewModel = useMemo(
    () => simulationSnapshot ? getUC04SimulationViewModel(simulationSnapshot) : null,
    [simulationSnapshot]
  );
  const viewModel: UC04CaseViewModel = useMemo(() => vitalDb.mode === "VITALDB_REPLAY"
    ? getUC04VitalDbWorkspaceViewModel(vitalDbProjection, vitalDbTime, vitalDbModelReadiness)
    : simulationViewModel!,
  [vitalDb.mode, vitalDbProjection, vitalDbTime, vitalDbModelReadiness, simulationViewModel]);

  const [simulationIsLive, setSimulationIsLive] = useState<boolean>(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [trackHover, setTrackHover] = useState<TrackHoverInfo | null>(null);
  const [isHpiPopoverOpen, setIsHpiPopoverOpen] = useState<boolean>(false);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    setSelectedEventId(null);
    setTrackHover(null);
    setIsHpiPopoverOpen(false);
    setIsAlertDialogOpen(false);
    setSimulationIsLive(true);
  }, [vitalDb.selectedCaseId]);

  // Close overlays on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsHpiPopoverOpen(false);
        setIsAlertDialogOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const cursorTime = vitalDb.mode === "VITALDB_REPLAY"
    ? formatCaseRelativeTime(vitalDbTime)
    : formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime);

  const setCursorTime = useCallback((time: string) => {
    if (vitalDb.mode === "VITALDB_REPLAY") {
      void vitalDb.seek(parseCaseRelativeTime(time));
      return;
    }
    if (!engine) return;
    const current = engine.getSnapshot();
    engine.seek(timeToElapsed(time, current.encounter.startedAt, current.encounter.scheduledDurationMs));
  }, [engine, vitalDb.mode, vitalDb.seek]);

  const setIsLive = useCallback((live: boolean) => {
    if (vitalDb.mode === "VITALDB_REPLAY") {
      void (live ? vitalDb.play() : vitalDb.pause());
      return;
    }
    setSimulationIsLive(live);
  }, [vitalDb.mode, vitalDb.play, vitalDb.pause]);

  const selectEvent = useCallback((event: HemodynamicEvent) => {
    setSelectedEventId(event.id);
    if (vitalDb.mode === "VITALDB_REPLAY" && event.simulationTime !== undefined) {
      void vitalDb.seek(event.simulationTime / 1_000);
    } else if (event.simulationTime !== undefined && engine) {
      engine.seek(event.simulationTime);
    } else {
      const cleanedTime = event.timestamp.replace(/\s*[AP]M/i, "").trim();
      setCursorTime(cleanedTime);
    }
    setIsLive(false);
  }, [engine, setCursorTime, setIsLive, vitalDb.mode, vitalDb.seek]);

  const isLive = vitalDb.mode === "VITALDB_REPLAY"
    ? vitalDb.session?.status === "PLAYING"
    : simulationIsLive;

  return (
    <HemodynamicContext.Provider
      value={{
        dataSourceMode: vitalDb.mode,
        vitalDbProjection,
        vitalDbCaseId: vitalDb.selectedCaseId,
        vitalDbCurrentTimeSeconds: vitalDb.mode === "VITALDB_REPLAY" ? vitalDbTime : null,
        patientContext: viewModel.patientContext,
        deviceStatus: viewModel.deviceStatus,
        vitals: viewModel.vitals,
        trendSamples: viewModel.trendSamples,
        prediction: viewModel.prediction,
        forecastHorizons: viewModel.forecastHorizons,
        relationship: viewModel.relationship,
        events: viewModel.events,
        activeAlert: viewModel.activeAlert,
        simulationTimeMs: viewModel.simulationTimeMs,
        trendWindow: viewModel.trendWindow,
        abpWaveform: viewModel.abpWaveform,
        abpWaveformSource: viewModel.abpWaveformSource,
        abpWaveformTimestamp: viewModel.abpWaveformTimestamp,
        medicationOverlap: viewModel.medicationOverlap,
        riskAlertThresholdPercent: viewModel.riskAlertThresholdPercent,
        cursorTime,
        setCursorTime,
        isLive,
        setIsLive,
        selectedEventId,
        selectEvent,
        trackHover,
        setTrackHover,
        isHpiPopoverOpen,
        setIsHpiPopoverOpen,
        isAlertDialogOpen,
        setIsAlertDialogOpen,
      }}
    >
      {children}
    </HemodynamicContext.Provider>
  );
}

function formatCaseRelativeTime(timeSeconds: number): string {
  const total = Math.max(0, Math.floor(timeSeconds));
  const hours = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function parseCaseRelativeTime(value: string): number {
  const parts = value.trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return 0;
  const [hours, minutes, seconds = 0] = parts;
  return Math.max(0, hours * 3_600 + minutes * 60 + seconds);
}

function timeToElapsed(clockTime: string, startedAt: string, durationMs: number): number {
  const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(startedAt);
  const startSeconds = match
    ? Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0)
    : 0;
  const parts = clockTime.replace(/\s*[AP]M/i, "").trim().split(":").map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  const targetSeconds = parts[0] * 3_600 + parts[1] * 60 + (parts[2] ?? 0);
  const elapsedSeconds = (targetSeconds - startSeconds + 86_400) % 86_400;
  return Math.max(0, Math.min(durationMs, elapsedSeconds * 1_000));
}

export function useHemodynamic() {
  const ctx = useContext(HemodynamicContext);
  if (!ctx) {
    throw new Error("useHemodynamic must be used within HemodynamicProvider");
  }
  return ctx;
}

// Backward-compatibility alias matching source USECASE 04
export const useClinicalDashboard = useHemodynamic;
export const ClinicalDashboardProvider = HemodynamicProvider;
