"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface CurrentMedicationAlertProps {
  className?: string;
}

export function CurrentMedicationAlert({ className = "" }: CurrentMedicationAlertProps) {
  const { t } = useTranslation("uc03");
  const { proposal, activeDemoAlert, overrideTimestamp } = useMedication();
  const status = activeDemoAlert?.status;
  const statusColor = status === "ACTIVE" || status === "ACKNOWLEDGED"
    ? "#FF334D"
    : status === "OVERRIDDEN"
      ? "#FFD828"
      : "#19BDF2";
  const statusLabel = status === "ACTIVE" || status === "ACKNOWLEDGED"
    ? t("simulation.active")
    : status === "OVERRIDDEN"
      ? t("simulation.overridden")
      : status === "RESOLVED"
        ? t("simulation.resolved")
        : null;

  return (
    <div className={`px-2 py-1 space-y-1 select-none min-w-0 ${className}`}>
      <div className="text-[14px] font-semibold text-[#F3F6F7] tracking-wide">{t("alerts.currentAlertTitle")}</div>
      {!activeDemoAlert ? (
        <div className="border border-[rgba(50,150,205,0.30)] bg-[#0A1720] p-2 text-[11px] leading-relaxed text-[#A6B0B8] rounded-[2px]">
          {t("simulation.noAlert")}
        </div>
      ) : (
        <div className="border bg-[#0A1720] p-2 rounded-[2px] min-w-0" style={{ borderColor: statusColor }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-start gap-1.5 text-[12px] font-bold leading-snug text-[#F3F6F7] break-words">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{t("simulation.alertTitle")}</span>
            </div>
            {statusLabel && <span className="shrink-0 border px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-[2px]" style={{ borderColor: statusColor, color: statusColor }}>{statusLabel}</span>}
          </div>
          {activeDemoAlert.proposedDoseText && (
            <div className="mt-1 font-mono text-[11px] tabular-nums text-[#F3F6F7] break-words">
              {proposal.genericName || t("table.drug")} · {activeDemoAlert.proposedDoseText}
            </div>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-[#A6B0B8]">{t("simulation.alertWhy")}</p>
          {activeDemoAlert.override && (
            <div className="mt-1 text-[10px] leading-snug text-[#FFD828] break-words">
              {t("simulation.overrideReason")}: {activeDemoAlert.override.reason}
              {overrideTimestamp ? ` · ${overrideTimestamp}` : ""}
            </div>
          )}
          <div className="mt-1 text-[9px] font-semibold text-[#FFD828]">{t("simulation.notForClinicalUse")}</div>
        </div>
      )}
    </div>
  );
}
