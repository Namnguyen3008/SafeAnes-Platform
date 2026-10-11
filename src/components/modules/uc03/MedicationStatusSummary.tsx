"use client";

import React from "react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface MedicationStatusSummaryProps {
  className?: string;
}

export function MedicationStatusSummary({ className = "" }: MedicationStatusSummaryProps) {
  const { t } = useTranslation("uc03");
  const { alerts } = useMedication();
  const countableAlerts = alerts.filter((alert) => alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED");

  const criticalCount = countableAlerts.filter((a) => a.severity === "CRITICAL").length;
  const highCount = countableAlerts.filter((a) => a.severity === "HIGH").length;
  const advisoryCount = countableAlerts.filter((a) => a.severity === "ADVISORY").length;
  const monitoringCount = countableAlerts.filter((a) => a.severity === "MONITORING").length;

  return (
    <div
      className={`h-[76px] bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between shrink-0 overflow-hidden select-none ${className}`}
    >
      <div className="text-[12px] font-semibold text-safe-text-muted tracking-wider uppercase">
        {t("activePanel.statusSummary")}
      </div>
      <div className="grid grid-cols-4 gap-1.5 flex-1 pt-1">
        {/* Critical: red */}
        <div className="bg-safe-red/10 border border-safe-red/40 flex flex-col items-center justify-center rounded-[2px]">
          <span className="text-[11px] font-medium text-safe-red leading-none">
            {t("activePanel.critical")}
          </span>
          <span className="text-[24px] font-bold font-mono text-safe-red leading-none mt-1 tabular-nums">
            {criticalCount}
          </span>
        </div>

        {/* High: red */}
        <div className="bg-safe-red/10 border border-safe-red/40 flex flex-col items-center justify-center rounded-[2px]">
          <span className="text-[11px] font-medium text-safe-red leading-none">
            {t("activePanel.high")}
          </span>
          <span className="text-[24px] font-bold font-mono text-safe-red leading-none mt-1 tabular-nums">
            {highCount}
          </span>
        </div>

        {/* Advisory: yellow */}
        <div className="bg-safe-yellow/10 border border-safe-yellow/40 flex flex-col items-center justify-center rounded-[2px]">
          <span className="text-[11px] font-medium text-safe-yellow leading-none">
            {t("activePanel.advisory")}
          </span>
          <span className="text-[24px] font-bold font-mono text-safe-yellow leading-none mt-1 tabular-nums">
            {advisoryCount}
          </span>
        </div>

        {/* Monitoring: cyan */}
        <div className="bg-safe-cyan/10 border border-safe-cyan/40 flex flex-col items-center justify-center rounded-[2px]">
          <span className="text-[11px] font-medium text-safe-cyan leading-none">
            {t("activePanel.monitoring")}
          </span>
          <span className="text-[24px] font-bold font-mono text-safe-cyan leading-none mt-1 tabular-nums">
            {monitoringCount}
          </span>
        </div>
      </div>
    </div>
  );
}
