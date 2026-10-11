"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { UC04VitalDbView, VitalDbPrediction as UC04VitalDbPrediction } from "@/adapters/uc04VitalDbAdapter";
import type { UC05VitalDbPrediction, UC05VitalDbView } from "@/adapters/uc05VitalDbAdapter";
import {
  safeAnesClient,
  type AvailabilityStatus,
  type CaseDetailResponse,
  type ModelStatusResponse,
  type Observation,
  type VitalDbCaseSummary,
  type ReplaySessionResponse,
} from "@/lib/api/safeanesClient";
import {
  persistDataSourceMode,
  readPersistedDataSourceMode,
} from "@/lib/api/dataSourcePersistence";
import {
  filterUC04ViewAsOf,
  filterUC05ViewAsOf,
  hasReplaySessionChanged,
  mergeRecordedSamples,
  mergeVitalDbReplayDelta,
  replaceVitalDbReplaySnapshot,
  type ReplayDeltaFrame,
  type ReplaySnapshotFrame,
  type VitalDbReplayBuffers,
} from "@/adapters/vitalDbReplayBuffer";
import { retainReplayEventSelectionAtTime } from "./vitalDbReplaySelection";
import { fetchSupabaseCases } from "@/lib/api/supabaseVitalDbClient";

export type SafeAnesDataSourceMode = "SYNTHETIC_DEMO" | "VITALDB_REPLAY";
export type UC04SourceMode = SafeAnesDataSourceMode;
export type VitalDbReplayStatus = ReplaySessionResponse["status"];
export type VitalDbReplaySpeed = ReplaySessionResponse["speed"];
export type { VitalDbCaseSummary };
export type VitalDbReplaySession = ReplaySessionResponse;

export interface VitalDbRecordedSelection {
  id: string;
  timestamp: number;
  source: string;
  kind: "OBSERVED" | "DERIVED";
}

export interface UC04VitalDbContextValue {
  mode: UC04SourceMode;
  setMode: (mode: UC04SourceMode) => Promise<void>;
  cases: VitalDbCaseSummary[];
  selectedCase: VitalDbCaseSummary | null;
  selectedCaseId: string | null;
  selectedCaseDetail: CaseDetailResponse | null;
  selectCase: (caseId: string) => Promise<void>;
  session: VitalDbReplaySession | null;
  replayTime: number | null;
  replayStatus: VitalDbReplayStatus | null;
  view: UC04VitalDbView | null;
  uc05View: UC05VitalDbView | null;
  observations: Observation[];
  quality: Record<string, string>;
  events: Array<Record<string, unknown> & { id: string; timestamp: number; classification: "OBSERVED" | "DERIVED" }>;
  uc04Predictions: UC04VitalDbPrediction[];
  uc05Predictions: UC05VitalDbPrediction[];
  modelStatuses: ModelStatusResponse[];
  availability: Record<string, AvailabilityStatus>;
  dataset: string | null;
  datasetVersion: string | null;
  trackMetadata: Array<Record<string, unknown>>;
  availableTracks: string[];
  medicationTracks: Array<Record<string, any>>;
  selectedRecordedEvent: VitalDbRecordedSelection | null;
  selectRecordedEvent: (selection: VitalDbRecordedSelection) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  setSpeed: (speed: VitalDbReplaySpeed) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (timeSeconds: number) => Promise<void>;
  reset: () => Promise<void>;
}

const SafeAnesDataContext = createContext<UC04VitalDbContextValue | null>(null);
const SESSION_KEY = "safeanes.uc04.vitaldb.replay";
const EMPTY_BUFFERS: VitalDbReplayBuffers = {
  uc04View: null,
  uc05View: null,
  medicationTracks: [],
  trackMetadata: [],
  availableTracks: [],
};

export function SafeAnesDataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UC04SourceMode>("SYNTHETIC_DEMO");
  const [cases, setCases] = useState<VitalDbCaseSummary[]>([]);
  const [modelStatuses, setModelStatuses] = useState<ModelStatusResponse[]>([]);
  const [dataset, setDataset] = useState<string | null>(null);
  const [datasetVersion, setDatasetVersion] = useState<string | null>(null);
  const [selectedCaseDetail, setSelectedCaseDetail] = useState<CaseDetailResponse | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [session, setSession] = useState<VitalDbReplaySession | null>(null);
  const [buffers, setBuffers] = useState<VitalDbReplayBuffers>(EMPTY_BUFFERS);
  const [selectedRecordedEvent, setSelectedRecordedEvent] = useState<VitalDbRecordedSelection | null>(null);
  // Keep source switching unavailable until the case catalog and model status
  // have loaded; otherwise a fast first click can be discarded before a case
  // is selected and leave the control showing Synthetic Demo.
  const [isLoading, setIsLoading] = useState(true);
  const [initialStateLoaded, setInitialStateLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<VitalDbReplaySession | null>(null);
  const buffersRef = useRef<VitalDbReplayBuffers>(EMPTY_BUFFERS);
  const persistedSessionRef = useRef("");
  const selectedCaseIdRef = useRef<string | null>(null);

  const selectedCase = useMemo(
    () => cases.find((item) => item.case_id === selectedCaseId) ?? null,
    [cases, selectedCaseId],
  );

  const applyBuffers = useCallback((next: VitalDbReplayBuffers) => {
    buffersRef.current = next;
    setBuffers(next);
  }, []);

  const updateSession = useCallback((value: VitalDbReplaySession) => {
    const next = normalizeSession(value);
    const previous = sessionRef.current;
    if (!hasReplaySessionChanged(previous, next)) return;
    sessionRef.current = next;
    setSession(next);
    if (previous?.session_id === next.session_id && next.current_time_s < previous.current_time_s) {
      const current = buffersRef.current;
      applyBuffers({
        ...current,
        uc04View: current.uc04View ? filterUC04ViewAsOf(current.uc04View, next.current_time_s) : null,
        uc05View: current.uc05View ? filterUC05ViewAsOf(current.uc05View, next.current_time_s) : null,
        medicationTracks: current.medicationTracks.map((track) => ({
          ...track,
          observations: mergeRecordedSamples([], track.observations ?? [], next.current_time_s, 1_800),
        })),
      });
      setSelectedRecordedEvent((selection) =>
        selection && selection.timestamp > next.current_time_s ? null : selection,
      );
    }
    const persistedKey = `${next.session_id}:${next.case_id}`;
    if (typeof window !== "undefined" && persistedSessionRef.current !== persistedKey) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: next.session_id, caseId: next.case_id }));
      persistedSessionRef.current = persistedKey;
    }
  }, [applyBuffers]);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([safeAnesClient.listCases(), safeAnesClient.listModels()])
      .then(async ([caseResult, modelResult]) => {
        if (cancelled) return;
        let selectable: VitalDbCaseSummary[] = [];
        if (caseResult.status === "fulfilled") {
          const catalog = caseResult.value;
          selectable = catalog.cases.filter(safeAnesClient.isCaseSelectable);
          setCases(selectable);
          setDataset(catalog.dataset);
          setDatasetVersion(catalog.dataset_version);
        } else {
          setError(errorText(caseResult.reason));
        }

        // Direct Supabase fallback if backend catalog is empty, unreachable, or cold-starting
        if (selectable.length === 0) {
          try {
            const supaCases = await fetchSupabaseCases();
            if (supaCases.length > 0) {
              selectable = supaCases;
              setCases(selectable);
              setDataset("VitalDB");
              setDatasetVersion("1.0.1");
              setError(null);
            }
          } catch {
            // Keep existing error if Supabase also fails
          }
        }
        if (modelResult.status === "fulfilled") setModelStatuses(modelResult.value.models);
        else setError(errorText(modelResult.reason));
        let storedCaseId: string | null = null;
        try {
          const stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null") as { caseId?: string } | null;
          storedCaseId = stored?.caseId ?? null;
        } catch {
          storedCaseId = null;
        }
        const nextCaseId = selectable.some((item) => item.case_id === storedCaseId)
          ? storedCaseId
          : selectable[0]?.case_id ?? null;
        selectedCaseIdRef.current = nextCaseId;
        setSelectedCaseId(nextCaseId);
        const restoredMode = nextCaseId
          ? readPersistedDataSourceMode(window.sessionStorage)
          : "SYNTHETIC_DEMO";
        setModeState(restoredMode);
        setInitialStateLoaded(true);
        setIsLoading(false);
        if (nextCaseId) {
          void safeAnesClient.getCase(nextCaseId).then((detail) => {
            if (!cancelled && selectedCaseIdRef.current === nextCaseId) setSelectedCaseDetail(detail);
          }).catch(() => {
            if (!cancelled && selectedCaseIdRef.current === nextCaseId) setSelectedCaseDetail(null);
          });
        }
      })
      .catch((cause: Error) => {
        if (!cancelled) {
          setError(cause.message);
          setInitialStateLoaded(true);
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const createOrRestoreSession = useCallback(async (caseId: string, restart = false) => {
    const current = sessionRef.current;
    if (!restart && current?.case_id === caseId) return current;

    if (!restart && typeof window !== "undefined") {
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? "null") as {
          sessionId?: string; caseId?: string;
        } | null;
        if (stored?.caseId === caseId && stored.sessionId) {
          const restored = await safeAnesClient.getReplaySession(stored.sessionId);
          if (restored.case_id === caseId && selectedCaseIdRef.current === caseId) {
            updateSession(restored);
            return normalizeSession(restored);
          }
        }
      } catch {
        // Backend restarts discard in-memory replay sessions; start a clean one.
      }
    }

    const created = await safeAnesClient.createReplaySession(caseId, current?.speed ?? 1, 0);
    const normalized = normalizeSession(created);
    if (selectedCaseIdRef.current !== caseId) return null;
    updateSession(normalized);
    applyBuffers(EMPTY_BUFFERS);
    setSelectedRecordedEvent(null);
    return normalized;
  }, [applyBuffers, updateSession]);

  useEffect(() => {
    if (!initialStateLoaded || mode !== "VITALDB_REPLAY" || !selectedCaseId || session?.case_id === selectedCaseId) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void createOrRestoreSession(selectedCaseId)
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorText(cause));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [createOrRestoreSession, initialStateLoaded, mode, selectedCaseId, session?.case_id]);

  const setMode = useCallback(async (nextMode: UC04SourceMode) => {
    setError(null);
    if (nextMode === "VITALDB_REPLAY") {
      if (!selectedCaseId) {
        setError("No locally cached VitalDB case is available.");
        return;
      }
      setIsLoading(true);
      try {
        await createOrRestoreSession(selectedCaseId);
        if (sessionRef.current?.case_id === selectedCaseId) {
          persistDataSourceMode(window.sessionStorage, nextMode);
          setModeState(nextMode);
        }
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        setIsLoading(false);
      }
      return;
    }
    const active = sessionRef.current;
    if (active?.status === "PLAYING") {
      setIsLoading(true);
      try {
        updateSession(await safeAnesClient.pauseReplay(active.session_id));
      } catch (cause) {
        setError(errorText(cause));
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    }
    persistDataSourceMode(window.sessionStorage, nextMode);
    setModeState(nextMode);
  }, [createOrRestoreSession, selectedCaseId, updateSession]);

  const selectCase = useCallback(async (caseId: string) => {
    if (!cases.some((item) => item.case_id === caseId) || caseId === selectedCaseId) return;
    selectedCaseIdRef.current = caseId;
    setSelectedCaseId(caseId);
    setError(null);
    sessionRef.current = null;
    setSession(null);
    applyBuffers(EMPTY_BUFFERS);
    setSelectedRecordedEvent(null);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
    setSelectedCaseDetail(null);
    void safeAnesClient.getCase(caseId).then((detail) => {
      if (selectedCaseIdRef.current === caseId) setSelectedCaseDetail(detail);
    }).catch((cause: unknown) => {
      if (selectedCaseIdRef.current === caseId) setError(errorText(cause));
    });
    if (mode !== "VITALDB_REPLAY") return;
    setIsLoading(true);
    try {
      await createOrRestoreSession(caseId, true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setIsLoading(false);
    }
  }, [applyBuffers, cases, createOrRestoreSession, mode, selectedCaseId]);

  const mutateSession = useCallback(async (action: string, body?: unknown) => {
    const active = sessionRef.current;
    if (!active) return;
    try {
      const next = await replayAction(active.session_id, action, body);
      if (sessionRef.current?.session_id !== active.session_id) return;
      updateSession(next);
      setError(null);
    } catch (cause) {
      if (sessionRef.current?.session_id !== active.session_id) return;
      setError(errorText(cause));
      throw cause;
    }
  }, [updateSession]);

  const play = useCallback(async () => mutateSession("/play"), [mutateSession]);
  const pause = useCallback(async () => mutateSession("/pause"), [mutateSession]);
  const resume = useCallback(async () => mutateSession("/resume"), [mutateSession]);
  const seek = useCallback(async (timeSeconds: number) => {
    if (!Number.isFinite(timeSeconds)) return;
    setSelectedRecordedEvent(null);
    await mutateSession("/seek", { time_s: timeSeconds });
  }, [mutateSession]);
  const reset = useCallback(async () => {
    applyBuffers(EMPTY_BUFFERS);
    setSelectedRecordedEvent(null);
    await mutateSession("/reset");
  }, [applyBuffers, mutateSession]);
  const setSpeed = useCallback(async (speed: VitalDbReplaySpeed) => {
    await mutateSession("/speed", { speed });
  }, [mutateSession]);

  const selectRecordedEvent = useCallback(async (selection: VitalDbRecordedSelection) => {
    setSelectedRecordedEvent(selection);
    await seek(selection.timestamp);
    setSelectedRecordedEvent(selection);
  }, [seek]);

  useEffect(() => {
    if (mode !== "VITALDB_REPLAY" || !session?.session_id || session.case_id !== selectedCaseId) return;
    const source = new EventSource(safeAnesClient.replayStreamUrl(session.session_id));
    const onSnapshot = (event: Event) => {
      try {
        updateSession(JSON.parse((event as MessageEvent<string>).data) as VitalDbReplaySession);
      } catch {
        setError("VitalDB replay sent an unreadable session update.");
      }
    };
    const onReset = (event: Event) => {
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as ReplaySnapshotFrame;
        if (frame.case_id !== selectedCaseId || sessionRef.current?.session_id !== session.session_id) return;
        applyBuffers(replaceVitalDbReplaySnapshot(frame));
        setSelectedRecordedEvent((selection) =>
          retainReplayEventSelectionAtTime(selection, frame.as_of_s),
        );
        setError(null);
      } catch {
        setError("VitalDB replay sent an unreadable recorded-data snapshot.");
      }
    };
    const onData = (event: Event) => {
      try {
        const frame = JSON.parse((event as MessageEvent<string>).data) as ReplayDeltaFrame;
        if (frame.case_id !== selectedCaseId || sessionRef.current?.session_id !== session.session_id) return;
        applyBuffers(mergeVitalDbReplayDelta(buffersRef.current, frame));
      } catch {
        setError("VitalDB replay data chunk could not be applied.");
      }
    };
    const onComplete = (event: Event) => {
      try {
        updateSession(JSON.parse((event as MessageEvent<string>).data) as VitalDbReplaySession);
      } catch {
        // The latest session snapshot already contains the completed cursor.
      }
    };
    const onStreamError = (event: Event) => {
      const message = (event as MessageEvent<string>).data;
      if (!message) return; // Native EventSource reconnect/error event.
      try {
        const body = JSON.parse(message) as { code?: string; message?: string };
        setError(`${body.code ?? "REPLAY_STREAM_FAILED"}: ${body.message ?? "Recorded data stream failed."}`);
      } catch {
        setError("Recorded VitalDB replay stream failed.");
      }
    };
    source.addEventListener("snapshot", onSnapshot);
    source.addEventListener("reset", onReset);
    source.addEventListener("data", onData);
    source.addEventListener("complete", onComplete);
    source.addEventListener("error", onStreamError);
    return () => {
      source.removeEventListener("snapshot", onSnapshot);
      source.removeEventListener("reset", onReset);
      source.removeEventListener("data", onData);
      source.removeEventListener("complete", onComplete);
      source.removeEventListener("error", onStreamError);
      source.close();
    };
  }, [applyBuffers, mode, selectedCaseId, session?.session_id, updateSession]);

  useEffect(() => () => {
    // EventSource is owned by the effect above and closes on session changes/unmount.
  }, []);

  const replayTime = session?.current_time_s ?? 0;
  const replayObservations = useMemo(() => mode === "VITALDB_REPLAY"
    ? collectObservations(buffers, replayTime)
    : [], [buffers, mode, replayTime]);
  const replayQuality = useMemo(() => mode === "VITALDB_REPLAY"
    ? collectQuality(buffers, replayObservations)
    : {}, [buffers, mode, replayObservations]);
  const replayEvents = useMemo(() => mode === "VITALDB_REPLAY"
    ? collectEvents(buffers, replayTime)
    : [], [buffers, mode, replayTime]);
  const uc04Predictions = useMemo(() => mode === "VITALDB_REPLAY"
    ? buffers.uc04View?.predictions?.predictions ?? []
    : [], [buffers.uc04View, mode]);
  const uc05Predictions = useMemo(() => mode === "VITALDB_REPLAY"
    ? predictionRows<UC05VitalDbPrediction>(buffers.uc05View?.predictions)
    : [], [buffers.uc05View, mode]);
  const availability = useMemo(() => {
    if (mode !== "VITALDB_REPLAY") return {};
    const result: Record<string, AvailabilityStatus> = {
      uc04_model: safeAnesClient.getModelAvailabilityStatus(modelStatuses.find((item) => item.model_id.includes("UC04"))),
      uc05_model: safeAnesClient.getModelAvailabilityStatus(modelStatuses.find((item) => item.model_id.includes("UC05"))),
    };
    const presentAtCursor = new Set(replayObservations.map((item) => item.track_name));
    for (const trackName of selectedCase?.available_signals ?? []) {
      result[`track:${trackName}`] = safeAnesClient.getDataAvailabilityStatus(presentAtCursor.has(trackName));
    }
    return result;
  }, [mode, modelStatuses, replayObservations, selectedCase]);

  const value = useMemo<UC04VitalDbContextValue>(() => ({
    mode,
    setMode,
    cases,
    selectedCase,
    selectedCaseId,
    selectedCaseDetail,
    selectCase,
    session: mode === "VITALDB_REPLAY" ? session : null,
    replayTime: mode === "VITALDB_REPLAY" ? replayTime : null,
    replayStatus: mode === "VITALDB_REPLAY" ? session?.status ?? "STOPPED" : null,
    view: mode === "VITALDB_REPLAY" ? buffers.uc04View as UC04VitalDbView | null : null,
    uc05View: mode === "VITALDB_REPLAY" ? buffers.uc05View as UC05VitalDbView | null : null,
    observations: replayObservations,
    quality: replayQuality,
    events: replayEvents,
    uc04Predictions,
    uc05Predictions,
    modelStatuses,
    availability,
    dataset,
    datasetVersion,
    trackMetadata: mode === "VITALDB_REPLAY" ? buffers.trackMetadata : [],
    availableTracks: mode === "VITALDB_REPLAY" ? buffers.availableTracks : [],
    medicationTracks: mode === "VITALDB_REPLAY" ? buffers.medicationTracks : [],
    selectedRecordedEvent,
    selectRecordedEvent,
    isLoading,
    error,
    setSpeed,
    play,
    pause,
    resume,
    seek,
    reset,
  }), [mode, setMode, cases, selectedCase, selectedCaseId, selectedCaseDetail, selectCase, session,
    replayTime, buffers, replayObservations, replayQuality, replayEvents, uc04Predictions, uc05Predictions,
    modelStatuses, availability, dataset, datasetVersion, selectedRecordedEvent, selectRecordedEvent, isLoading, error,
    setSpeed, play, pause, resume, seek, reset]);

  return <SafeAnesDataContext.Provider value={value}>{children}</SafeAnesDataContext.Provider>;
}

export function useSafeAnesData(): UC04VitalDbContextValue {
  const value = useContext(SafeAnesDataContext);
  if (!value) throw new Error("useSafeAnesData must be used inside SafeAnesDataProvider");
  return value;
}

/** Compatibility exports retained for modules that still use the original context name. */
export const UC04VitalDbProvider = SafeAnesDataProvider;
export const useUC04VitalDb = useSafeAnesData;

function normalizeSession(value: VitalDbReplaySession): VitalDbReplaySession {
  const currentTime = Number(value.current_time_seconds ?? value.current_time_s ?? 0);
  return {
    ...value,
    current_time_s: currentTime,
    current_time_seconds: currentTime,
    started_at: value.started_at ?? null,
    updated_at: value.updated_at ?? "",
    uc04_model_status: value.uc04_model_status ?? "UNKNOWN",
    uc05_model_status: value.uc05_model_status ?? "UNKNOWN",
  };
}

function errorText(value: unknown): string {
  if (value && typeof value === "object" && "code" in value && "message" in value) {
    const error = value as { code?: unknown; message?: unknown };
    return `${String(error.code ?? "API_REQUEST_FAILED")}: ${String(error.message ?? "SafeAnes backend request failed.")}`;
  }
  return value instanceof Error ? value.message : "SafeAnes backend request failed.";
}

async function replayAction(sessionId: string, action: string, body?: unknown): Promise<VitalDbReplaySession> {
  switch (action) {
    case "/play": return safeAnesClient.playReplay(sessionId);
    case "/pause": return safeAnesClient.pauseReplay(sessionId);
    case "/resume": return safeAnesClient.resumeReplay(sessionId);
    case "/reset": return safeAnesClient.resetReplay(sessionId);
    case "/seek": {
      const time = Number((body as { time_s?: number } | undefined)?.time_s);
      if (!Number.isFinite(time)) throw new RangeError("Replay seek requires a finite case-relative time.");
      return safeAnesClient.seekReplay(sessionId, time);
    }
    case "/speed": {
      const speed = Number((body as { speed?: number } | undefined)?.speed);
      if (![1, 2, 5, 10, 30, 60].includes(speed)) throw new RangeError("Replay speed is not supported.");
      return safeAnesClient.setReplaySpeed(sessionId, speed as VitalDbReplaySpeed);
    }
    default: throw new Error(`Unsupported replay action: ${action}`);
  }
}

function predictionRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { predictions?: unknown }).predictions)) {
    return (value as { predictions: T[] }).predictions;
  }
  return [];
}

function collectObservations(buffers: VitalDbReplayBuffers, asOfSeconds: number): Observation[] {
  const byKey = new Map<string, Observation>();
  for (const view of [buffers.uc04View, buffers.uc05View]) {
    for (const series of view?.signals ?? []) {
      for (const row of series.observations ?? []) {
        if (Number(row.timestamp) > asOfSeconds) continue;
        const observation: Observation = {
          case_id: String(view?.case_id ?? ""),
          track_name: String(row.track_name ?? series.track_name ?? ""),
          timestamp: Number(row.timestamp),
          value: row.value == null || !Number.isFinite(Number(row.value)) ? null : Number(row.value),
          unit: String(row.unit ?? series.unit ?? ""),
          source: String(row.source ?? series.source ?? ""),
          quality: String(row.quality ?? series.quality ?? "UNKNOWN"),
          is_missing: Boolean(row.is_missing || row.value == null),
          provenance: row.provenance && typeof row.provenance === "object" ? row.provenance : {},
        };
        if (!Number.isFinite(observation.timestamp) || !observation.track_name) continue;
        byKey.set(`${observation.track_name}|${observation.timestamp}`, observation);
      }
    }
  }
  return [...byKey.values()].sort((left, right) => left.timestamp - right.timestamp || left.track_name.localeCompare(right.track_name));
}

function collectQuality(buffers: VitalDbReplayBuffers, observations: Observation[]): Record<string, string> {
  const quality: Record<string, string> = {};
  const latestAt: Record<string, number> = {};
  for (const observation of observations) {
    if (observation.timestamp < (latestAt[observation.track_name] ?? Number.NEGATIVE_INFINITY)) continue;
    latestAt[observation.track_name] = observation.timestamp;
    quality[observation.track_name] = observation.quality;
  }
  for (const [key, view] of [["UC04", buffers.uc04View], ["UC05", buffers.uc05View]] as const) {
    const waveforms = (view as Record<string, any> | null)?.waveforms ?? {};
    for (const [name, waveform] of Object.entries(waveforms as Record<string, any>)) {
      if (waveform && typeof waveform.quality === "string") quality[`${key}:${name}`] = waveform.quality;
    }
    const abp = (view as Record<string, any> | null)?.abp_waveform;
    if (key === "UC04" && abp?.quality) quality["UC04:abp"] = String(abp.quality);
  }
  return quality;
}

function collectEvents(
  buffers: VitalDbReplayBuffers,
  asOfSeconds: number,
): Array<Record<string, unknown> & { id: string; timestamp: number; classification: "OBSERVED" | "DERIVED" }> {
  const byId = new Map<string, Record<string, unknown> & { id: string; timestamp: number; classification: "OBSERVED" | "DERIVED" }>();
  const add = (event: Record<string, any>, classification: "OBSERVED" | "DERIVED", fallbackId: string) => {
    const timestamp = Number(event.timestamp ?? event.start_time_s);
    const availableAt = Number(event.available_at_s ?? event.end_time_s ?? timestamp);
    if (!Number.isFinite(timestamp) || !Number.isFinite(availableAt) || availableAt > asOfSeconds) return;
    const id = String(event.id ?? fallbackId);
    byId.set(id, { ...event, id, timestamp, classification });
  };
  for (const [index, event] of (buffers.uc04View?.events ?? []).entries()) {
    add(event, "OBSERVED", `uc04:${event.timestamp}:${event.event_type ?? index}`);
  }
  for (const event of buffers.uc05View?.recorded_events ?? []) {
    add(event, "OBSERVED", `uc05-recorded:${event.timestamp}:${event.event_type}`);
  }
  for (const event of buffers.uc05View?.derived_events ?? []) {
    add(event, "DERIVED", `uc05-derived:${event.timestamp}:${event.event_type}`);
  }
  return [...byId.values()].sort((left, right) => left.timestamp - right.timestamp);
}
