"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  Wifi,
  Activity,
  BatteryMedium,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "@/context/LocalizationContext";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { useSafeAnesData } from "@/context/UC04VitalDbContext";
import { resolveHeaderCaseContext } from "@/adapters/clinicalHeaderAdapter";
import { formatCaseTime, formatElapsedTime } from "@/simulation";
import { SimulationControlPopover } from "@/components/simulation/SimulationControlPopover";

export function GlobalClinicalHeader() {
  const { t, locale, setLocale } = useTranslation("shell");
  const { snapshot: replaySnapshot } = useSimulationReplay();
  const vitalDb = useSafeAnesData();
  const pathname = usePathname() ?? "";
  const headerCase = resolveHeaderCaseContext({
    mode: vitalDb.mode,
    pathname,
    caseId: vitalDb.selectedCaseId,
    simulation: {
      patientAgeYears: replaySnapshot.patient.ageYears,
      patientSex: replaySnapshot.patient.sex,
      operatingRoom: replaySnapshot.procedure.operatingRoom,
      procedure: replaySnapshot.procedure.name,
      anesthesia: replaySnapshot.procedure.anesthesia,
    },
  });
  const recordedCase = headerCase.source === "VITALDB_REPLAY";
  const patientValue = recordedCase
    ? t("vitalDbCase", { caseId: headerCase.caseId ?? "—" })
    : `${headerCase.ageYears ?? "—"} ${t("yearsShort")} / ${headerCase.sex === "Female" ? t("female") : headerCase.sex === "Male" ? t("male") : headerCase.sex ?? t("notRecorded")}`;
  const vitalDbTimeMs = (vitalDb.session?.current_time_s ?? 0) * 1_000;
  const currentTime = recordedCase
    ? formatElapsedTime(vitalDbTimeMs)
    : formatCaseTime(replaySnapshot.encounter.startedAt, replaySnapshot.simulationTime);
  const elapsedStr = recordedCase
    ? formatElapsedTime(vitalDbTimeMs)
    : formatElapsedTime(replaySnapshot.simulationTime);
  const visibleAlertCount = recordedCase
    ? null
    : replaySnapshot.alerts.filter((alert) => alert.status === "ACTIVE").length;
  const disconnectedDevice = replaySnapshot.devices.some((device) => device.status === "DISCONNECTED");
  const degradedDevice = replaySnapshot.devices.some((device) => device.status === "DEGRADED");
  const activeSignalIssue = replaySnapshot.qualityStates.some((quality) =>
    quality.status !== "GOOD" &&
    (quality.validUntilTime === undefined || replaySnapshot.simulationTime < quality.validUntilTime)
  );
  const batteryValues = replaySnapshot.devices
    .map((device) => device.batteryPercent)
    .filter((value): value is number => value !== undefined);
  const batteryLabel = !recordedCase && batteryValues.length
    ? `${Math.round(batteryValues.reduce((sum, value) => sum + value, 0) / batteryValues.length)}%`
    : "—";
  const telemetryLabel = recordedCase
    ? t("recordedData")
    : disconnectedDevice ? t("telOffline") : degradedDevice ? t("telDegraded") : t("telOn");
  const telemetryClass = recordedCase
    ? "text-safe-cyan"
    : disconnectedDevice ? "text-safe-red" : degradedDevice ? "text-safe-yellow" : "text-safe-green";
  const signalLabel = recordedCase
    ? t("qualityUnknown")
    : activeSignalIssue ? t("sensorsDegraded") : t("sensors");
  const signalClass = recordedCase ? "text-safe-yellow" : activeSignalIssue ? "text-safe-yellow" : "text-safe-green";
  const anesthesiaPlan = headerCase.anesthesia?.toLowerCase().startsWith("general")
    ? t("anesthesiaTypes.general")
    : headerCase.anesthesia ?? t("notRecorded");
  const headerValue = (value: string | null) => value ?? t("notRecorded");

  return (
    <header className="safe-clinical-header w-full bg-safe-surface border-b border-safe-border px-2 flex items-center gap-2 select-none shrink-0 z-30">
      {/* 1. SafeAnes Branding + Case Status: LIVE */}
      <div className="safe-header-brand flex items-center gap-2 shrink-0">
        <div className="flex items-baseline text-[21px] font-black tracking-tight leading-none">
          <span className="text-safe-text">Safe</span>
          <span className="text-safe-cyan">Anes</span>
        </div>

        {/* Replay route uses the simulation clock, not live case status. */}
        <SimulationControlPopover />
      </div>

      {/* 2. Patient or selected recorded case */}
      <div className="safe-header-patient flex min-w-0 items-center gap-1 text-xs bg-safe-bg px-1.5 py-1 rounded-sm border border-safe-border-light">
        <span className="text-safe-text-muted text-[9px] font-semibold tracking-wide whitespace-nowrap">
          {t(recordedCase ? "case" : "patient")}
        </span>
        <span title={patientValue} className="text-safe-text font-mono font-bold text-[13px] tabular-nums whitespace-nowrap">
          {patientValue}
        </span>
      </div>

      {/* 3. OR: OR 2 */}
      <div className="safe-header-or flex min-w-0 items-center gap-1 text-xs bg-safe-bg px-1.5 py-1 rounded-sm border border-safe-border-light">
        <span className="text-safe-text-muted text-[10px] font-semibold tracking-wide">
          {t("or")}
        </span>
        <span className="text-safe-cyan font-mono font-bold text-sm whitespace-nowrap">
          {headerValue(headerCase.operatingRoom)}
        </span>
      </div>

      {/* 4. Procedure: Total Hip Arthroplasty */}
      <div className="safe-header-procedure flex items-center gap-1 text-xs min-w-0 bg-safe-bg px-1.5 py-1 rounded-sm border border-safe-border-light">
        <span className="text-safe-text-muted text-[10px] font-semibold tracking-wide">
          {t("procedure")}
        </span>
        <span className="text-safe-text font-semibold text-sm truncate min-w-0 flex-1" title={headerValue(headerCase.procedure)}>
          {headerValue(headerCase.procedure)}
        </span>
      </div>

      {/* 5. Anesthesia: General */}
      <div className="safe-header-anesthesia flex min-w-0 items-center gap-1 text-xs bg-safe-bg px-1.5 py-1 rounded-sm border border-safe-border-light">
        <span className="text-safe-text-muted text-[10px] font-semibold tracking-wide">
          {t("anesthesia")}
        </span>
        <span className="text-safe-green font-mono font-bold text-sm whitespace-nowrap">
          {anesthesiaPlan}
        </span>
      </div>

      {/* 6. Case time and replay status */}
      <div className="safe-header-clock grid min-w-0 grid-rows-2 content-center gap-y-0.5 bg-safe-bg px-1.5 py-1 rounded-sm border border-safe-border-light font-mono" aria-label={`${t(recordedCase ? "caseRelativeTime" : "clock")}: ${currentTime}; ${recordedCase ? t("replay") : t("elapsed")}: ${recordedCase ? vitalDb.session?.status ?? "STOPPED" : elapsedStr}`}>
        <span className="flex items-center gap-1 whitespace-nowrap text-[11px] leading-none">
          <Clock className="w-3.5 h-3.5 text-safe-cyan shrink-0" />
          <span className="text-safe-text font-bold tabular-nums" title={recordedCase ? t("caseRelativeTime") : undefined}>{currentTime}</span>
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap text-[9px] leading-none">
          <span className="text-safe-text-muted">{recordedCase ? t("replay") : t("elapsed")}</span>
          <span className="text-safe-cyan font-bold tabular-nums">{recordedCase ? vitalDb.session?.status ?? "STOPPED" : elapsedStr}</span>
        </span>
      </div>

      {/* 7. Device Connectivity Summary */}
      <div className="safe-header-status flex min-w-0 items-center gap-1 bg-safe-bg px-1.5 py-1 rounded-sm border border-safe-border-light text-xs font-mono">
        <span className={`flex items-center gap-1 ${telemetryClass}`} title={telemetryLabel}>
          <Wifi className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold">{telemetryLabel}</span>
        </span>
        <span className="text-safe-border-subtle">|</span>
        <span className={`flex items-center gap-1 ${signalClass}`} title={signalLabel}>
          <Activity className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold">{signalLabel}</span>
        </span>
        <span className="text-safe-border-subtle">|</span>
        <span className="flex items-center gap-1 text-safe-green" title={t("battery")}>
          <BatteryMedium className="w-3.5 h-3.5" />
          <span className="text-[9px] font-bold tabular-nums">{batteryLabel}</span>
        </span>
      </div>

      {/* 8. Global Active-Alert Count */}
      <div title={recordedCase ? t("authoritativeAlarmUnavailable") : undefined} className={`safe-header-alerts flex min-w-0 items-center gap-1 px-1.5 py-1 rounded-sm border text-[11px] font-bold font-mono whitespace-nowrap ${visibleAlertCount !== null && visibleAlertCount > 0 ? "bg-safe-red/20 border-safe-red/70 text-safe-red" : "bg-safe-surface-secondary border-safe-border text-safe-text-muted"}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>{visibleAlertCount ?? "—"} {t("alerts")}</span>
      </div>

      {/* 9. Language Switcher: Compact EN | VI Pill */}
      <div className="safe-header-locale flex items-center bg-safe-bg border border-safe-border-light rounded-sm text-[10px] font-mono font-bold shrink-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={`px-1.5 py-0.5 transition-colors ${
            locale === "en"
              ? "bg-safe-cyan/25 text-safe-cyan border-r border-safe-border-light font-extrabold"
              : "text-safe-text-muted hover:text-safe-text border-r border-safe-border-light"
          }`}
          title={t("lang.switchToEn")}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLocale("vi")}
          className={`px-1.5 py-0.5 transition-colors ${
            locale === "vi"
              ? "bg-safe-cyan/25 text-safe-cyan font-extrabold"
              : "text-safe-text-muted hover:text-safe-text"
          }`}
          title={t("lang.switchToVi")}
        >
          VI
        </button>
      </div>
    </header>
  );
}
