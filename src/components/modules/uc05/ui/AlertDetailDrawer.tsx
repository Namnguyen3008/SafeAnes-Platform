"use client";

import React, { useRef, useEffect } from "react";
import { X, AlertOctagon, VolumeX, CheckCircle } from "lucide-react";
import { useRespiratory } from "@/context/RespiratoryContext";
import { RespiratoryAlert } from "@/types/uc05";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";

export interface AlertDetailDrawerProps {
  alert: RespiratoryAlert | null;
}

export function AlertDetailDrawer({
  alert,
}: AlertDetailDrawerProps) {
  const { isAlertDrawerOpen, setIsAlertDrawerOpen } = useRespiratory();
  const { t } = useTranslation("uc05");
  const { t: tCommon } = useTranslation("common");
  const drawerRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(isAlertDrawerOpen, drawerRef, () => setIsAlertDrawerOpen(false));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setIsAlertDrawerOpen(false);
      }
    }
    if (isAlertDrawerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isAlertDrawerOpen, setIsAlertDrawerOpen]);

  if (!isAlertDrawerOpen || !alert) return null;
  const isSyntheticRespiratoryAlert = alert.code === "DEMO-RESP-02";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("alarms.activeClinicalAlert")}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-150 select-none"
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="w-full max-w-[min(520px,92vw)] h-full min-h-0 bg-safe-surface border-l border-safe-border shadow-2xl flex flex-col p-4 animate-in slide-in-from-right duration-200 text-safe-text focus:outline-none"
      >
        {/* Drawer Header */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="flex items-center justify-between pb-3 border-b border-safe-border">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-safe-red animate-pulse" />
              <div>
                <h2 className="text-safe-text text-sm font-semibold tracking-wide uppercase leading-none">
                  {t("alarms.activeClinicalAlert")}
                </h2>
                <span className="text-[11px] text-safe-text-muted font-mono">{t("alarms.code")} {alert.code}</span>
              </div>
            </div>
            <button
              onClick={() => setIsAlertDrawerOpen(false)}
              aria-label={tCommon("drawer.close")}
              className="p-1 text-safe-text-muted hover:text-safe-text hover:bg-safe-surface-secondary rounded-sm transition-colors focus-visible:ring-1 focus-visible:ring-safe-cyan focus-visible:outline-none cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Alert Banner */}
          <div className="mt-4 p-3 bg-[#8A0E18] border border-[#E00014]/60 rounded-[2px]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-200">
                {alert.priority === "HIGH" ? t("alarms.highPriority") : `${alert.priority} Priority`}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-[#E00014] text-[#F4F6F7] rounded-[2px]">
                {alert.isActive ? t("alarms.active") : t("alarms.resolved")}
              </span>
            </div>
            <h3 className="text-[#F4F6F7] text-[16px] font-bold mt-1">
              {isSyntheticRespiratoryAlert ? t("alarms.noBreathDetected") : alert.title}
            </h3>
            <p className="text-[12px] text-red-200 mt-0.5 font-mono">
              {isSyntheticRespiratoryAlert ? t("simulation.syntheticRespiratoryAlert") : alert.subtitle}
            </p>
          </div>

          {/* Clinical Telemetry Context */}
          <div className="mt-4 space-y-3 text-[13px]">
            <div className="p-2.5 bg-[#09151D] border border-[rgba(80,160,210,0.3)] rounded-[2px] space-y-2">
              <div className="text-[11px] font-semibold text-[#12B9F2] uppercase tracking-wider">
                {t("alarms.physioStatus")}
              </div>
              <div className="flex justify-between">
                <span className="text-[#A7B0B6]">{t("alarms.capnogramExpiratoryPhase")}</span>
                <span className="text-[#FFE800] font-mono tabular-nums font-semibold">
                  {isSyntheticRespiratoryAlert ? t("simulation.noBreathCandidate") : alert.physiologicalStatus.capnogramExpiratoryPhase}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A7B0B6]">{t("alarms.respiratoryRate")}</span>
                <span className="text-[#F4F6F7] font-mono tabular-nums font-semibold">
                  {alert.physiologicalStatus.respiratoryRate ?? "--"} /min
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A7B0B6]">{t("alarms.spo2Trending")}</span>
                <span className="text-[#12B9F2] font-mono tabular-nums font-semibold">
                  {alert.physiologicalStatus.spo2Trending === "Observed"
                    ? t("simulation.observed")
                    : alert.physiologicalStatus.spo2Trending === "Unavailable"
                      ? t("simulation.signalUnavailable")
                      : alert.physiologicalStatus.spo2Trending}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A7B0B6]">{t("alarms.pulseRate")}</span>
                <span className="text-[#39E336] font-mono tabular-nums font-semibold">
                  {alert.physiologicalStatus.pulseRate ?? "--"} bpm
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-[#09151D] border border-[rgba(80,160,210,0.3)] rounded-[2px] space-y-1.5">
              <div className="text-[11px] font-semibold text-[#A7B0B6] uppercase tracking-wider">
                {t("alarms.systemDiagnostics")}
              </div>
              <p className="text-[12px] text-[#A7B0B6] leading-relaxed">
                {isSyntheticRespiratoryAlert ? t("simulation.demoDisclaimer") : alert.systemDiagnostics}
              </p>
            </div>
          </div>
        </div>

        {/* Drawer Action Controls */}
        <div className="shrink-0 pt-3 border-t border-[rgba(80,160,210,0.35)] space-y-2">
          <button
            onClick={() => setIsAlertDrawerOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#09151D] hover:bg-[#0c1a24] text-[#F4F6F7] text-[13px] font-medium border border-[rgba(80,160,210,0.45)] rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer"
          >
            <VolumeX className="w-4 h-4 text-[#FFE800]" />
            <span>{t("alarms.silenceTone2m")}</span>
          </button>
          <button
            onClick={() => setIsAlertDrawerOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#0284c7] hover:bg-[#0284c7]/90 text-[#F4F6F7] text-[13px] font-semibold rounded-[2px] transition-colors focus-visible:ring-1 focus-visible:ring-[#12B9F2] focus-visible:outline-none cursor-pointer shadow-md"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{t("alarms.ackRespiratoryAlert")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AlertDetailDrawer;
