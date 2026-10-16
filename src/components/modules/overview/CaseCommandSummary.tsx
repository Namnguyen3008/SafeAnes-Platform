"use client";

import React from "react";
import {
  Clock,
  ShieldAlert,
  CheckCircle2,
  Radio,
} from "lucide-react";
import { useSafeAnesSimulation } from "@/context/SimulationReplayContext";
import { useTranslation } from "@/context/LocalizationContext";

const PHASES = [
  { key: "PREOP", labelKey: "phase1", num: "01" },
  { key: "INDUCTION", labelKey: "phase2", num: "02" },
  { key: "INCISION", labelKey: "phase3", num: "03" },
  { key: "MAINTENANCE", labelKey: "phase4", num: "04" },
  { key: "EMERGENCE", labelKey: "phase5", num: "05" },
  { key: "PACU", labelKey: "phase6", num: "06" },
];

export function CaseCommandSummary() {
  const simulation = useSafeAnesSimulation();
  const { snapshot } = simulation;
  const { t } = useTranslation("overview");
  const patient = snapshot.patient;
  const procedure = snapshot.procedure;
  const devices = snapshot.devices;
  const currentPhaseId = snapshot.perioperativePhases.find((phase) => phase.status === "CURRENT")?.id ?? "preoperative";
  const phaseIndexById: Record<string, number> = {
    preoperative: 0, induction: 1, "airway-secured": 1, maintenance: 3, surgery: 3,
    closure: 3, emergence: 4, "transfer-pacu": 5, complete: 5,
  };
  const activeIdx = phaseIndexById[currentPhaseId] ?? 0;
  const connectedDevices = devices.filter((device) => device.status === "CONNECTED").length;
  const degradedDevices = devices.filter((device) => device.status === "DEGRADED").length;
  const meanLatencyMs = devices.length
    ? Math.round(devices.reduce((sum, device) => sum + device.latencyMs, 0) / devices.length)
    : null;
  const healthyLabel = t("command.devicesHealthy", { healthy: connectedDevices, total: devices.length });
  const elapsed = formatElapsed(snapshot.simulationTime);
  const duration = formatElapsed(snapshot.encounter.scheduledDurationMs);
  const progressPercent = Math.round(simulation.clock.progress * 100);

  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm p-3 flex flex-col gap-2.5">
      {/* Top Row: Case Metadata, Allergies & Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-safe-border-subtle">
        {/* Left: Patient Details & Clinical Team */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-safe-text tracking-tight">
              Synthetic Demo Patient
            </span>
            <span className="text-xs font-mono text-safe-text-muted">
              {patient.ageYears}y {patient.sex === "Female" ? "F" : patient.sex === "Male" ? "M" : "—"} • {patient.weightKg}kg
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-safe-cyan/10 text-safe-cyan border border-safe-cyan/30 font-semibold">
              ASA {patient.asa}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-safe-surface-secondary text-safe-text-dim border border-safe-border-light">
              {t("command.mrn")} {patient.patientId}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-safe-border-light hidden md:block" />

          {/* Procedure & Team */}
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <span className="font-semibold text-safe-cyan">{procedure.operatingRoom}</span>
            <span className="text-safe-text-muted">•</span>
            <span className="text-safe-text font-medium">{procedure.name}</span>
            <span className="text-safe-text-muted">•</span>
            <span className="text-safe-text-dim">{t("command.surgeon")} {procedure.surgeon ?? "—"}</span>
            <span className="text-safe-text-muted">•</span>
            <span className="text-safe-text-dim">{t("command.anes")} {procedure.anesthesia}</span>
          </div>
        </div>

        {/* Right: Allergy Warning & Telemetry Pill */}
        <div className="flex items-center gap-2">
          {patient.allergies.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-clinical-alert-critical/15 border border-clinical-alert-critical/40 text-clinical-alert-critical text-xs font-semibold animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t("command.allergyAlert")} {patient.allergies.map((a) => `${a.substance} (${a.severity})`).join(", ")}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-safe-surface-secondary border border-safe-border-light text-xs font-mono">
              <Radio className={`w-3 h-3 ${degradedDevices ? "text-safe-yellow" : "text-safe-green"} ${snapshot.status === "PLAYING" ? "animate-pulse" : ""}`} />
              <span className="text-safe-green font-semibold">
              {healthyLabel}
              </span>
            {degradedDevices > 0 && <span className="text-safe-yellow">{degradedDevices} {t("command.degraded")}</span>}
            <span className="text-safe-border-light">|</span>
            <span className="text-safe-text-muted">{t("command.latency", { ms: meanLatencyMs ?? "—" })}</span>
          </div>
        </div>
      </div>

      {/* Bottom Row: Perioperative Phase Progress Track */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold text-safe-text-muted uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-safe-cyan" />
            {t("command.phaseProgression")}
          </span>
          <span className="text-xs font-mono font-bold text-safe-cyan px-2 py-0.5 rounded-sm bg-safe-cyan/10 border border-safe-cyan/30">
            {t(`command.${PHASES[activeIdx].labelKey}`)} ({activeIdx + 1}/6)
          </span>
          <span className="text-xs font-mono text-safe-text-dim">
            {t("command.elapsed")} {elapsed} / {duration} ({progressPercent}%)
          </span>
        </div>

        {/* Interactive Phase Breadcrumbs */}
        <div className="flex items-center gap-1 flex-1 max-w-xl">
          {PHASES.map((p, idx) => {
            const isCompleted = idx < activeIdx;
            const isCurrent = idx === activeIdx;

            return (
              <div
                key={p.key}
                className={`flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-sm border text-[11px] font-mono transition-colors ${
                  isCurrent
                    ? "bg-safe-cyan/20 border-safe-cyan text-safe-cyan font-bold shadow-[0_0_8px_rgba(0,229,255,0.2)]"
                    : isCompleted
                    ? "bg-safe-surface-secondary border-safe-green/40 text-safe-green/80"
                    : "bg-safe-surface-secondary/40 border-safe-border-subtle text-safe-text-dim"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3 h-3 text-safe-green shrink-0" />
                ) : isCurrent ? (
                  <span className="w-2 h-2 rounded-full bg-safe-cyan animate-ping shrink-0" />
                ) : (
                  <span className="text-[9px] text-safe-text-dim">{p.num}</span>
                )}
                <span className="truncate">{t(`command.${p.labelKey}`)}</span>
              </div>
            );
          })}
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
