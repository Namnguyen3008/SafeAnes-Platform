"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, ChevronDown, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { useTranslation } from "@/context/LocalizationContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import type { VitalDbReplaySpeed } from "@/context/UC04VitalDbContext";
import {
  formatCaseTime,
  formatElapsedTime,
  SIMULATION_FAULT_DEFINITIONS,
  SIMULATION_SPEEDS,
} from "@/simulation";
import {
  getAutoDemoMilestones,
  getSimulationQuickJumps,
} from "@/simulation/demoControllerModel";

const AUTO_DEMO_SPEED = 30;
const HIGHLIGHT_DURATION_MS = 3_600;

interface HighlightRequest {
  routePath: string;
  target: string;
  token: number;
}

/** Compact case-wide playback controls. Auto Demo only navigates and highlights UI. */
export function SimulationControlPopover() {
  const { t, locale } = useTranslation("common");
  const { engine, snapshot } = useSimulationReplay();
  const vitalDb = useSafeAnesData();
  const pathname = usePathname() ?? "/safeanes/case/demo";
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const completedMilestones = useRef(new Set<string>());
  const highlightToken = useRef(0);
  const [open, setOpen] = useState(false);
  const [faultsOpen, setFaultsOpen] = useState(false);
  const [autoDemo, setAutoDemo] = useState(false);
  const [highlightRequest, setHighlightRequest] = useState<HighlightRequest | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const caseId = decodeCaseId(pathname);
  const quickJumps = useMemo(
    () => getSimulationQuickJumps(snapshot.encounter.startedAt),
    [snapshot.encounter.startedAt],
  );
  const milestones = useMemo(
    () => getAutoDemoMilestones(snapshot.encounter.startedAt, caseId),
    [snapshot.encounter.startedAt, caseId],
  );
  const currentTime = formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime);
  const elapsed = formatElapsedTime(snapshot.simulationTime);
  const startTime = formatCaseTime(snapshot.encounter.startedAt, 0);
  const endTime = formatCaseTime(snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs);
  const playing = vitalDb.mode === "VITALDB_REPLAY"
    ? vitalDb.session?.status === "PLAYING"
    : snapshot.status === "PLAYING";
  const statusLabel = t(`caseReplay.status${snapshot.status.charAt(0)}${snapshot.status.slice(1).toLowerCase()}`);
  const controllerLabel = vitalDb.mode === "VITALDB_REPLAY"
    ? (locale === "vi" ? "CA VITALDB ĐÃ GHI" : "VITALDB RECORDED CASE")
    : (locale === "vi" ? "MÔ PHỎNG TỔNG HỢP" : "SYNTHETIC DEMO");
  const controllerTitle = vitalDb.mode === "VITALDB_REPLAY"
    ? (locale === "vi" ? "Điều khiển phát lại VitalDB" : "VitalDB replay controls")
    : t("caseReplay.controller.open");
  const dialogTitle = vitalDb.mode === "VITALDB_REPLAY"
    ? (locale === "vi" ? "VitalDB · Phát lại hồi cứu" : "VitalDB · Retrospective replay")
    : t("caseReplay.controller.title");

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const positionPopover = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const width = Math.max(1, Math.min(464, window.innerWidth - 16));
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
      setPopoverStyle({ left, top: bounds.bottom + 7, width });
    };
    positionPopover();
    window.addEventListener("resize", positionPopover);
    return () => window.removeEventListener("resize", positionPopover);
  }, [open]);

  useEffect(() => {
    if (!autoDemo || vitalDb.mode !== "SYNTHETIC_DEMO") return;
    const nextMilestone = milestones.find((milestone) =>
      !completedMilestones.current.has(milestone.id) && snapshot.simulationTime >= milestone.elapsedMs,
    );
    if (!nextMilestone) return;

    completedMilestones.current.add(nextMilestone.id);
    highlightToken.current += 1;
    setHighlightRequest({
      routePath: nextMilestone.route.split("?")[0],
      target: nextMilestone.target,
      token: highlightToken.current,
    });
    const currentLocation = typeof window === "undefined"
      ? pathname
      : `${window.location.pathname}${window.location.search}`;
    if (currentLocation !== nextMilestone.route) router.push(nextMilestone.route, { scroll: false });
  }, [autoDemo, milestones, pathname, router, snapshot.simulationTime, vitalDb.mode]);

  useEffect(() => {
    if (vitalDb.mode !== "SYNTHETIC_DEMO" || !highlightRequest || pathname !== highlightRequest.routePath) return;

    let tries = 0;
    let highlightTimer: number | undefined;
    const pollTimer = window.setInterval(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-simulation-demo-target="${highlightRequest.target}"]`,
      );
      tries += 1;
      if (target) {
        window.clearInterval(pollTimer);
        target.classList.add("simulation-demo-highlight");
        highlightTimer = window.setTimeout(() => {
          target.classList.remove("simulation-demo-highlight");
          setHighlightRequest((current) => current?.token === highlightRequest.token ? null : current);
        }, HIGHLIGHT_DURATION_MS);
      } else if (tries >= 20) {
        window.clearInterval(pollTimer);
        setHighlightRequest((current) => current?.token === highlightRequest.token ? null : current);
      }
    }, 100);

    return () => {
      window.clearInterval(pollTimer);
      if (highlightTimer !== undefined) window.clearTimeout(highlightTimer);
      document
        .querySelector<HTMLElement>(`[data-simulation-demo-target="${highlightRequest.target}"]`)
        ?.classList.remove("simulation-demo-highlight");
    };
  }, [highlightRequest, pathname, vitalDb.mode]);

  useEffect(() => {
    if (vitalDb.mode !== "VITALDB_REPLAY") return;
    setAutoDemo(false);
    setHighlightRequest(null);
  }, [vitalDb.mode]);

  useEffect(() => {
    if (snapshot.status === "COMPLETED" && autoDemo) setAutoDemo(false);
  }, [autoDemo, snapshot.status]);

  const disableAutoDemo = () => {
    setAutoDemo(false);
    setHighlightRequest(null);
  };

  const handleQuickJump = (elapsedMs: number) => {
    disableAutoDemo();
    completedMilestones.current.clear();
    engine.seek(elapsedMs);
  };

  const handleReset = () => {
    disableAutoDemo();
    completedMilestones.current.clear();
    engine.resetCase();
  };

  const handleResetScenario = () => {
    disableAutoDemo();
    completedMilestones.current.clear();
    engine.resetScenario();
  };

  const handleAutoDemoChange = (enabled: boolean) => {
    setAutoDemo(enabled);
    setHighlightRequest(null);
    completedMilestones.current.clear();
    if (!enabled) return;

    // Auto Demo starts at the beginning so all five module moments run in order.
    engine.resetCase();
    engine.setSpeed(AUTO_DEMO_SPEED);
    engine.play();
  };

  const play = () => {
    if (snapshot.status === "COMPLETED") engine.replayFromStart();
    else engine.play();
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="safeanes-simulation-control"
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 rounded-sm border border-safe-cyan/40 bg-safe-cyan/10 px-2 text-[9px] font-extrabold tracking-wide text-safe-cyan hover:bg-safe-cyan/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
        title={controllerTitle}
      >
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="whitespace-nowrap">{controllerLabel}</span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${playing ? "animate-pulse bg-safe-green" : "bg-safe-cyan"}`}
          aria-hidden="true"
        />
        <ChevronDown className="h-3 w-3 opacity-80" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="safeanes-simulation-control"
          role="dialog"
          aria-label={dialogTitle}
          className="fixed z-[80] max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-sm border border-safe-border bg-safe-surface p-3 text-safe-text shadow-[0_12px_32px_rgba(0,0,0,.55)]"
          style={popoverStyle}
        >
          <div className="mb-2 grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 border-b border-safe-border-subtle pb-2">
            <label htmlFor="safeanes-replay-source" className="text-[10px] font-semibold uppercase tracking-wide text-safe-text-muted">
              {locale === "vi" ? "Nguồn dữ liệu" : "Data source"}
            </label>
            <div className="min-w-0">
              <select
                id="safeanes-replay-source"
                value={vitalDb.mode}
                onChange={(event) => { void vitalDb.setMode(event.target.value as "SYNTHETIC_DEMO" | "VITALDB_REPLAY"); }}
                disabled={vitalDb.isLoading}
                className="h-7 w-full min-w-0 rounded-sm border border-safe-border bg-safe-bg px-2 text-[10px] font-semibold text-safe-text outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan disabled:opacity-60"
              >
                <option value="SYNTHETIC_DEMO">{locale === "vi" ? "Mô phỏng tổng hợp" : "Synthetic demo"}</option>
                <option value="VITALDB_REPLAY">VitalDB · {locale === "vi" ? "phát lại hồi cứu" : "retrospective replay"}</option>
              </select>
              {vitalDb.isLoading && (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-safe-cyan">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  <span>{locale === "vi" ? "Đang đồng bộ phiên VitalDB..." : "Connecting VitalDB session..."}</span>
                </div>
              )}
              {vitalDb.error && (
                <p role="status" className="mt-1 break-words text-[10px] text-safe-red">
                  {vitalDb.error}
                </p>
              )}
            </div>
          </div>
          {vitalDb.mode === "VITALDB_REPLAY" ? (
            <VitalDbReplayControls locale={locale} replay={vitalDb} />
          ) : (
            <>
          <div className="flex min-w-0 items-start justify-between gap-3 border-b border-safe-border-subtle pb-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-[12px] font-bold uppercase tracking-wider text-safe-text">
                  {t("caseReplay.controller.title")}
                </h2>
                <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold ${playing ? "border-safe-green/50 bg-safe-green/10 text-safe-green" : "border-safe-border bg-safe-bg text-safe-text-muted"}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] text-safe-text-muted" title={t("caseReplay.controller.scenarioName")}>
                {t("caseReplay.controller.scenario")}: {t("caseReplay.controller.scenarioName")}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[15px] font-bold tabular-nums text-safe-cyan" aria-live="polite">
                {currentTime}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-safe-text-muted">
                {t("caseReplay.elapsed")}: {elapsed}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 py-2">
            <button
              type="button"
              onClick={play}
              disabled={playing}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-safe-green/50 bg-safe-green/10 px-2 text-[11px] font-semibold text-safe-green hover:bg-safe-green/20 disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />{t("caseReplay.playSimulation")}
            </button>
            <button
              type="button"
              onClick={() => engine.pause()}
              disabled={!playing}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-safe-border bg-safe-bg px-2 text-[11px] font-semibold text-safe-text hover:bg-safe-surface-secondary disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
            >
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />{t("caseReplay.pauseSimulation")}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-sm border border-safe-border bg-safe-bg px-2 text-[11px] font-semibold text-safe-text hover:bg-safe-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{t("caseReplay.resetCase")}
            </button>
          </div>

          <div className="flex min-w-0 items-center justify-between gap-3 border-y border-safe-border-subtle py-2">
            <label htmlFor="safeanes-simulation-speed" className="text-[10px] font-semibold text-safe-text-muted">
              {t("caseReplay.speed")}
            </label>
            <select
              id="safeanes-simulation-speed"
              value={snapshot.speed}
              onChange={(event) => engine.setSpeed(Number(event.target.value))}
              className="h-7 min-w-[6.5rem] rounded-sm border border-safe-border bg-safe-bg px-2 font-mono text-[11px] font-bold text-safe-cyan outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
            >
              {SIMULATION_SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
            </select>
          </div>

          <div className="pt-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-safe-text-muted">
                {t("caseReplay.controller.timeline")}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-safe-text">
                {currentTime}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={snapshot.encounter.scheduledDurationMs}
              step={1_000}
              value={snapshot.simulationTime}
              onChange={(event) => {
                disableAutoDemo();
                engine.seek(Number(event.target.value));
              }}
              aria-label={t("time.scrub")}
              aria-valuetext={`${currentTime}, ${elapsed}`}
              className="h-2 w-full cursor-pointer accent-safe-cyan"
            />
            <div className="mt-1 flex items-center justify-between font-mono text-[9px] tabular-nums text-safe-text-muted">
              <span>{startTime}</span>
              <span>{endTime}</span>
            </div>
          </div>

          <div className="pt-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-safe-text-muted">
              {t("caseReplay.controller.quickJump")}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {quickJumps.map((jump) => (
                <button
                  key={jump.id}
                  type="button"
                  onClick={() => handleQuickJump(jump.elapsedMs)}
                  className="min-h-7 min-w-0 rounded-sm border border-safe-border-light bg-safe-bg px-1.5 py-1 text-left text-[10px] leading-tight text-safe-text hover:border-safe-cyan/60 hover:bg-safe-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
                >
                  {t(`caseReplay.controller.jumps.${jump.labelKey}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_max-content] items-start gap-x-3 gap-y-1 rounded-sm border border-safe-border-subtle bg-safe-bg p-2 text-[10px] leading-snug">
            <span className="text-safe-text-muted">{t("caseReplay.controller.scenario")}</span>
            <span className="text-right font-semibold text-safe-text">{t("caseReplay.controller.scenarioName")}</span>
            <span className="text-safe-text-muted">{t("caseReplay.controller.seed")}</span>
            <span className="text-right font-mono tabular-nums text-safe-text">{snapshot.seed}</span>
            <span className="text-safe-text-muted">{t("caseReplay.controller.syntheticData")}</span>
            <span className="text-right font-bold text-safe-green">{t("caseReplay.controller.yes")}</span>
            <span className="text-safe-text-muted">{t("caseReplay.controller.clinicalUse")}</span>
            <span className="text-right font-bold text-safe-yellow">{t("caseReplay.controller.no")}</span>
          </div>

          <label className="mt-2 flex min-h-8 cursor-pointer items-center justify-between gap-3 rounded-sm border border-safe-cyan/30 bg-safe-cyan/5 px-2 py-1.5 focus-within:ring-2 focus-within:ring-safe-cyan">
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-safe-text">{t("caseReplay.controller.autoDemo")}</span>
              <span className="block text-[9px] leading-snug text-safe-text-muted">{t("caseReplay.controller.autoDemoDescription")}</span>
            </span>
            <input
              type="checkbox"
              checked={autoDemo}
              onChange={(event) => handleAutoDemoChange(event.target.checked)}
              className="h-4 w-4 shrink-0 accent-safe-cyan"
            />
          </label>

          <section className="mt-2 rounded-sm border border-safe-border-subtle bg-safe-bg">
            <button
              type="button"
              aria-expanded={faultsOpen}
              aria-controls="safeanes-simulation-faults"
              onClick={() => setFaultsOpen((value) => !value)}
              className="flex min-h-8 w-full items-center justify-between gap-3 px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-safe-cyan"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold text-safe-text">
                  {t("caseReplay.controller.faults.title")}
                </span>
                <span className="block text-[9px] leading-snug text-safe-text-muted">
                  {t("caseReplay.controller.faults.defaultOff")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-sm border border-safe-border px-1.5 py-0.5 font-mono text-[9px] font-bold text-safe-text-muted">
                  {snapshot.activeFaults.length > 0
                    ? t("caseReplay.controller.faults.active", { count: snapshot.activeFaults.length })
                    : t("caseReplay.controller.faults.off")}
                </span>
                <ChevronDown className={`h-3 w-3 text-safe-text-muted transition-transform ${faultsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </span>
            </button>
            {faultsOpen && (
              <div id="safeanes-simulation-faults" className="border-t border-safe-border-subtle p-2">
                <p className="mb-2 text-[9px] leading-snug text-safe-yellow">
                  {t("caseReplay.controller.faults.demoOnly")}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SIMULATION_FAULT_DEFINITIONS.map((fault) => {
                    const checked = snapshot.activeFaults.some((active) => active.id === fault.id);
                    return (
                      <label
                        key={fault.id}
                        title={t(`caseReplay.controller.faults.targets.${fault.id}`)}
                        className="flex min-h-10 min-w-0 cursor-pointer items-start gap-1.5 rounded-sm border border-safe-border-subtle bg-safe-surface px-1.5 py-1.5 focus-within:ring-2 focus-within:ring-safe-cyan"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => engine.setFault(fault.id, event.target.checked)}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-safe-cyan"
                        />
                        <span className="min-w-0">
                          <span className="block text-[10px] font-semibold leading-tight text-safe-text">
                            {t(`caseReplay.controller.faults.names.${fault.id}`)}
                          </span>
                          <span className="mt-0.5 block text-[8px] leading-tight text-safe-text-muted">
                            {t(`caseReplay.controller.faults.targets.${fault.id}`)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleResetScenario}
                  className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-sm border border-safe-cyan/40 bg-safe-cyan/10 px-2 text-[10px] font-semibold text-safe-cyan hover:bg-safe-cyan/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  {t("caseReplay.controller.faults.resetScenario")}
                </button>
              </div>
            )}
          </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function VitalDbReplayControls({
  locale,
  replay,
}: {
  locale: string;
  replay: ReturnType<typeof useSafeAnesData>;
}) {
  const vi = locale === "vi";
  const session = replay.session;
  const currentTime = session?.current_time_s ?? 0;
  const duration = session?.duration_seconds ?? 1;
  const [scrubTime, setScrubTime] = useState(currentTime);
  const isDraggingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setScrubTime(currentTime);
    }
  }, [currentTime]);

  const run = (action: () => Promise<void>) => { void action().catch(() => undefined); };
  
  const commitSeek = (targetTime?: number) => {
    isDraggingRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const t = targetTime ?? scrubTime;
    run(() => replay.seek(t));
  };

  const handleScrubberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(event.target.value);
    isDraggingRef.current = true;
    setScrubTime(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      commitSeek(val);
    }, 200);
  };

  const primaryAction = () => {
    if (session?.status === "PAUSED") run(replay.resume);
    else run(replay.play);
  };
  const statusText = session?.status ?? "STOPPED";

  return (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-safe-border-subtle pb-2">
        <div className="min-w-0">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-safe-text">
            {vi ? "VitalDB · Phát lại hồi cứu" : "VitalDB · Retrospective replay"}
          </h2>
          <p className="mt-1 max-w-[300px] text-[10px] leading-snug text-safe-yellow">
            {vi ? "Dữ liệu ca đã ghi · không phải theo dõi bệnh nhân trực tiếp" : "Recorded case data · not a live patient monitor"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[15px] font-bold tabular-nums text-safe-cyan" aria-live="polite">{formatReplayTime(currentTime)}</div>
          <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold ${session?.status === "PLAYING" ? "border-safe-green/50 bg-safe-green/10 text-safe-green" : "border-safe-border bg-safe-bg text-safe-text-muted"}`}>
            {statusText}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 py-2">
        <button
          type="button"
          onClick={primaryAction}
          disabled={!session || replay.isLoading || session.status === "PLAYING"}
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-sm border border-safe-green/50 bg-safe-green/10 px-1.5 text-[10px] font-semibold text-safe-green hover:bg-safe-green/20 disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
        >
          <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {session?.status === "PAUSED" ? (vi ? "Tiếp tục" : "Resume") : session?.status === "COMPLETED" ? (vi ? "Phát lại" : "Replay") : (vi ? "Phát" : "Play")}
        </button>
        <button
          type="button"
          onClick={() => run(replay.pause)}
          disabled={!session || replay.isLoading || session.status !== "PLAYING"}
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-sm border border-safe-border bg-safe-bg px-1.5 text-[10px] font-semibold text-safe-text hover:bg-safe-surface-secondary disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
        >
          <Pause className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{vi ? "Tạm dừng" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => run(replay.reset)}
          disabled={!session || replay.isLoading}
          className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-sm border border-safe-border bg-safe-bg px-1.5 text-[10px] font-semibold text-safe-text hover:bg-safe-surface-secondary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan"
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{vi ? "Đặt lại" : "Reset"}
        </button>
      </div>

      <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-y border-safe-border-subtle py-2">
        <label htmlFor="safeanes-vitaldb-case" className="text-[10px] font-semibold text-safe-text-muted">{vi ? "Ca VitalDB" : "VitalDB case"}</label>
        <select
          id="safeanes-vitaldb-case"
          value={replay.selectedCaseId ?? ""}
          onChange={(event) => run(() => replay.selectCase(event.target.value))}
          disabled={replay.isLoading || replay.cases.length === 0}
          className="h-7 min-w-0 rounded-sm border border-safe-border bg-safe-bg px-2 font-mono text-[10px] text-safe-text outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan disabled:opacity-60"
        >
          {replay.cases.map((item) => (
            <option key={item.case_id} value={item.case_id}>
              {item.case_id} · {formatDuration(item.duration_seconds)} · {item.available_signals.length} {vi ? "tín hiệu" : "signals"}
              {item.case_id === "49"
                ? (vi ? " · Cắt thùy phổi (12 đợt SpO2 < 90%) · Ca bệnh lý UC05" : " · Lung lobectomy (12x SpO2 < 90%) · UC05 benchmark")
                : ` · UC04 ${item.uc04_eligible ? (vi ? "đủ đ/k" : "eligible") : (vi ? "không đủ" : "unavailable")} · UC05 ${item.uc05_eligible ? (vi ? "đủ đ/k" : "eligible") : (vi ? "không đủ" : "unavailable")}`}
            </option>
          ))}
          {replay.cases.length === 0 && <option value="">{vi ? "Không có ca VitalDB đã cache" : "No cached VitalDB cases"}</option>}
        </select>

        {replay.selectedCase && (
          <div className="col-span-2 min-w-0 rounded-sm border border-safe-border-subtle bg-safe-bg p-2 text-[9px] leading-snug">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="font-mono font-bold text-safe-cyan">{replay.selectedCase.case_id}</span>
              <span className="shrink-0 font-mono tabular-nums text-safe-text-muted">{formatDuration(replay.selectedCase.duration_seconds)}</span>
            </div>
            {replay.selectedCase.case_id === "49" && (
              <div className="mt-1 rounded-sm border border-safe-cyan/40 bg-safe-cyan/10 px-1.5 py-0.5 text-[9px] font-semibold text-safe-cyan">
                {vi
                  ? "🫁 Ca bệnh lý điển hình UC-05: Phẫu thuật cắt thùy phổi · 12 đợt suy hô hấp SpO2 < 90% kéo dài ≥ 60s"
                  : "🫁 UC-05 Clinical Benchmark: Lung lobectomy · 12 sustained hypoxemia episodes (SpO2 < 90% ≥ 60s)"}
              </div>
            )}
            <div className="mt-1 truncate text-safe-text-muted" title={replay.selectedCase.available_signals.join(", ")}>
              {vi ? "Tín hiệu" : "Signals"} ({replay.selectedCase.available_signals.length}): {replay.selectedCase.available_signals.slice(0, 3).join(", ") || "NOT_RECORDED"}
              {replay.selectedCase.available_signals.length > 3 ? " …" : ""}
            </div>
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-0.5">
              <span className="text-safe-text-muted">{vi ? "Chất lượng tại con trỏ" : "Quality at replay cursor"}</span>
              <span className="font-mono text-safe-text">{summarizeQuality(replay.quality)}</span>
              <span className="text-safe-text-muted">UC04 · {vi ? "độ phủ / sẵn sàng" : "coverage / readiness"}</span>
              <span className={replay.selectedCase.uc04_eligible ? "text-safe-green" : "text-safe-yellow"}>
                {replay.selectedCase.uc04_eligible ? (vi ? "ĐỦ ĐIỀU KIỆN" : "ELIGIBLE") : (vi ? "KHÔNG ĐỦ" : "NOT ELIGIBLE")}
                {` · ${formatCoverage(replay.selectedCase.coverage_summary.uc04)} · ${String(replay.selectedCase.inference_readiness.uc04 ?? "UNKNOWN")}`}
              </span>
              <span className="text-safe-text-muted">UC05 · {vi ? "độ phủ / sẵn sàng" : "coverage / readiness"}</span>
              <span className={replay.selectedCase.uc05_eligible ? "text-safe-green" : "text-safe-yellow"}>
                {replay.selectedCase.uc05_eligible ? (vi ? "ĐỦ ĐIỀU KIỆN" : "ELIGIBLE") : (vi ? "KHÔNG ĐỦ" : "NOT ELIGIBLE")}
                {` · ${formatCoverage(replay.selectedCase.coverage_summary.uc05)} (${vi ? "3/3 sóng đạt chuẩn 100%" : "3/3 core waves 100%"}) · ${String(replay.selectedCase.inference_readiness.uc05 ?? "UNKNOWN")}`}
              </span>
            </div>
          </div>
        )}

        <label htmlFor="safeanes-vitaldb-speed" className="text-[10px] font-semibold text-safe-text-muted">{vi ? "Tốc độ" : "Speed"}</label>
        <select
          id="safeanes-vitaldb-speed"
          value={session?.speed ?? 1}
          onChange={(event) => run(() => replay.setSpeed(Number(event.target.value) as VitalDbReplaySpeed))}
          disabled={!session || replay.isLoading}
          className="h-7 min-w-0 rounded-sm border border-safe-border bg-safe-bg px-2 font-mono text-[10px] font-bold text-safe-cyan outline-none focus-visible:ring-2 focus-visible:ring-safe-cyan disabled:opacity-60"
        >
          {[1, 2, 5, 10, 30, 60].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}
        </select>
      </div>

      <div className="pt-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="safeanes-vitaldb-scrubber" className="text-[10px] font-semibold uppercase tracking-wide text-safe-text-muted">
            {vi ? "Thời gian ca đã ghi" : "Recorded case time"}
          </label>
          <span className="font-mono text-[10px] tabular-nums text-safe-text">{formatReplayTime(currentTime)}</span>
        </div>
        <input
          id="safeanes-vitaldb-scrubber"
          type="range"
          min={0}
          max={duration}
          step={1}
          value={Math.min(scrubTime, duration)}
          onChange={handleScrubberChange}
          onPointerUp={() => commitSeek()}
          onKeyUp={() => commitSeek()}
          aria-valuetext={`${formatReplayTime(scrubTime)} / ${formatReplayTime(duration)}`}
          disabled={!session || replay.isLoading}
          className="h-2 w-full cursor-pointer accent-safe-cyan disabled:cursor-default"
        />
        <div className="mt-1 flex justify-between font-mono text-[9px] tabular-nums text-safe-text-muted">
          <span>00:00:00</span><span>{formatReplayTime(duration)}</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1 rounded-sm border border-safe-border-subtle bg-safe-bg p-2 text-[9px]">
        <span className="text-safe-text-muted">{vi ? "UC04 model" : "UC04 model"}</span><span className="font-mono text-safe-text">{session?.uc04_model_status ?? "UNKNOWN"}</span>
        <span className="text-safe-text-muted">{vi ? "UC05 model" : "UC05 model"}</span><span className="font-mono text-safe-text">{session?.uc05_model_status ?? "UNKNOWN"}</span>
        <span className="text-safe-text-muted">{vi ? "Dữ liệu" : "Data"}</span><span className="font-bold text-safe-cyan">VitalDB · RECORDED</span>
      </div>
      {replay.error && <p role="status" className="mt-2 break-words text-[10px] text-safe-red">{replay.error}</p>}
    </>
  );
}

function formatReplayTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatCoverage(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : "NOT_RECORDED";
}

function summarizeQuality(quality: Record<string, string>): string {
  const counts = new Map<string, number>();
  for (const value of Object.values(quality)) counts.set(value.toUpperCase(), (counts.get(value.toUpperCase()) ?? 0) + 1);
  return counts.size > 0
    ? [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, count]) => `${name} ${count}`).join(" · ")
    : "INSUFFICIENT_DATA";
}

function decodeCaseId(pathname: string): string {
  const match = /\/safeanes\/case\/([^/]+)/.exec(pathname);
  if (!match) return "demo";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
