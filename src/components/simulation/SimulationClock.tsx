"use client";

import React from "react";
import { Pause, Play, RotateCcw, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/context/LocalizationContext";
import {
  SIMULATION_SPEEDS,
  formatCaseTime,
  formatElapsedTime,
  type SimulationClockStatus,
  type SimulationEngine,
  type SimulationJumpTarget,
} from "@/simulation";
import { useSimulationReplay } from "@/context/SimulationReplayContext";

export interface SimulationClockProps {
  engine: SimulationEngine;
  className?: string;
}

const jumpTargets: ReadonlyArray<{ target: SimulationJumpTarget; labelKey: string }> = [
  { target: "PRE_OP", labelKey: "preOp" },
  { target: "INDUCTION", labelKey: "induction" },
  { target: "MAINTENANCE", labelKey: "maintenance" },
  { target: "HEMODYNAMIC_EVENT", labelKey: "hemodynamicEvent" },
  { target: "RESPIRATORY_EVENT", labelKey: "respiratoryEvent" },
  { target: "EMERGENCE", labelKey: "emergence" },
];

/** Standalone replay controls. The host page supplies the simulation ticker. */
export function SimulationClock({ engine, className = "" }: SimulationClockProps) {
  const { t } = useTranslation("common");
  const { snapshot } = useSimulationReplay();

  const playing = snapshot.status === "PLAYING";
  const playLabel = snapshot.status === "PAUSED"
    ? t("caseReplay.resumeSimulation")
    : t("caseReplay.playSimulation");
  const statusLabel = statusLabelFor(snapshot.status, t);
  const elapsed = formatElapsedTime(snapshot.simulationTime);
  const caseTime = formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime);

  return (
    <section className={`min-w-0 border border-safe-border bg-safe-surface rounded-sm p-2.5 ${className}`} aria-label={t("caseReplay.clockStatus")}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-safe-border-subtle pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-safe-text-muted">
            {t("caseReplay.clockStatus")}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-bold ${statusClass(snapshot.status)}`} aria-live="polite">
            <span className={`h-1.5 w-1.5 rounded-full ${playing ? "bg-safe-green animate-pulse" : "bg-current"}`} />
            {statusLabel}
          </span>
          <span className="whitespace-nowrap font-mono text-sm font-bold tabular-nums text-safe-cyan">
            {caseTime}
          </span>
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-safe-text-muted">
            {t("caseReplay.elapsed")}: {elapsed}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {playing ? (
            <Button type="button" size="sm" variant="active" onClick={() => engine.pause()} aria-label={t("caseReplay.pauseSimulation")}>
              <Pause className="mr-1 h-3.5 w-3.5" />{t("caseReplay.pauseSimulation")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="active"
              onClick={() => snapshot.status === "COMPLETED" ? engine.replayFromStart() : snapshot.status === "PAUSED" ? engine.resume() : engine.play()}
              disabled={snapshot.status === "COMPLETED"}
              aria-label={playLabel}
            >
              <Play className="mr-1 h-3.5 w-3.5" />{playLabel}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => engine.replayFromStart()} aria-label={t("caseReplay.replayFromStart")}>
            <SkipBack className="mr-1 h-3.5 w-3.5" />{t("caseReplay.replayFromStart")}
          </Button>
          <Button type="button" size="sm" variant="workstation" onClick={() => engine.resetCase()} aria-label={t("caseReplay.resetCase")}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />{t("caseReplay.resetCase")}
          </Button>
          <label className="flex h-7 items-center gap-1.5 rounded-sm border border-safe-border bg-safe-bg px-2 text-[11px] text-safe-text-muted">
            <span>{t("caseReplay.speed")}</span>
            <select
              className="h-full bg-transparent font-mono font-bold text-safe-cyan outline-none"
              value={snapshot.speed}
              onChange={(event) => engine.setSpeed(Number(event.target.value))}
              aria-label={t("caseReplay.speed")}
            >
              {SIMULATION_SPEEDS.map((speed) => (
                <option key={speed} value={speed}>{speed}x</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 pt-2">
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-safe-text-muted">
          {formatCaseTime(snapshot.encounter.startedAt, 0)}
        </span>
        <input
          className="h-2 min-w-16 flex-1 cursor-pointer accent-safe-cyan"
          type="range"
          min={0}
          max={snapshot.encounter.scheduledDurationMs}
          step={1_000}
          value={snapshot.simulationTime}
          onChange={(event) => engine.seek(Number(event.target.value))}
          aria-label={t("time.scrub")}
          aria-valuetext={`${caseTime}, ${elapsed}`}
        />
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-safe-text-muted">
          {formatCaseTime(snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs)}
        </span>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pt-2">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-safe-text-muted">
          {t("caseReplay.jumpTo")}
        </span>
        {jumpTargets.map(({ target, labelKey }) => (
          <Button key={target} type="button" size="xs" variant="workstation" onClick={() => engine.jumpTo(target)}>
            {t(`caseReplay.${labelKey}`)}
          </Button>
        ))}
      </div>
    </section>
  );
}

function statusLabelFor(status: SimulationClockStatus, t: (key: string) => string): string {
  const labels: Record<SimulationClockStatus, string> = {
    STOPPED: t("caseReplay.statusStopped"),
    PLAYING: t("caseReplay.statusPlaying"),
    PAUSED: t("caseReplay.statusPaused"),
    COMPLETED: t("caseReplay.statusCompleted"),
  };
  return labels[status];
}

function statusClass(status: SimulationClockStatus): string {
  if (status === "PLAYING") return "border-safe-green/50 bg-safe-green/10 text-safe-green";
  if (status === "COMPLETED") return "border-safe-cyan/50 bg-safe-cyan/10 text-safe-cyan";
  return "border-safe-border bg-safe-bg text-safe-text-muted";
}
