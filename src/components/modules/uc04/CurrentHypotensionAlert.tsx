"use client";

import { AlertTriangle } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useTranslation } from "@/context/LocalizationContext";
import { AlertDialog } from "./ui/Dialog";

export function CurrentHypotensionAlert() {
  const { t } = useTranslation("uc04");
  const { activeAlert, dataSourceMode, isAlertDialogOpen, setIsAlertDialogOpen } = useHemodynamic();
  const isVitalDb = dataSourceMode === "VITALDB_REPLAY";
  const resolved = activeAlert?.status === "RESOLVED";
  const noAlert = activeAlert === null;
  const subtitle = activeAlert
    ? t("simulation.alertSubtitle", {
        risk: activeAlert.riskPercent ?? "—",
        lead: activeAlert.leadTimeMinutes ?? "—",
        threshold: activeAlert.thresholdMmHg ?? "—",
      })
    : isVitalDb ? t("vitaldb.noModelAlert") : t("simulation.noActiveAlert");
  const color = noAlert || resolved ? "#AAB4BB" : activeAlert.priority === "HIGH" ? "#FF3348" : "#F5E328";

  return (
    <>
      <div
        tabIndex={noAlert ? -1 : 0}
        role={noAlert ? undefined : "button"}
        aria-haspopup={noAlert ? undefined : "dialog"}
        onClick={() => !noAlert && setIsAlertDialogOpen(true)}
        onKeyDown={(event) => {
          if (!noAlert && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            setIsAlertDialogOpen(true);
          }
        }}
        className="uc04-current-alert shrink-0 min-w-0 bg-[#0A131B] border rounded-[3px] p-3 flex items-center gap-3.5 overflow-hidden select-none transition-colors focus:outline-none focus:ring-1 focus:ring-[#00C5FF]"
        style={{ borderColor: color }}
      >
        <AlertTriangle className="w-12 h-12 shrink-0" style={{ color }} />
        <div className="min-w-0 flex flex-col justify-center">
          <span className="text-[11px] font-mono font-extrabold uppercase" style={{ color }}>
            {noAlert ? isVitalDb ? t("vitaldb.recordedDataLabel") : t("simulation.demoOnly")
              : resolved ? t("simulation.alertResolved") : t("simulation.demoOnly")}
          </span>
          <span className="text-[16px] font-bold text-[#F4F6F7] leading-snug break-words">
            {activeAlert ? t("simulation.alertTitle")
              : isVitalDb ? t("vitaldb.noModelAlertTitle") : t("simulation.noActiveAlert")}
          </span>
          <p className="text-[11px] text-[#AAB4BB] mt-1 font-medium leading-snug">
            {subtitle}{!noAlert && <> · {t("simulation.clickForDetails")}</>}
          </p>
        </div>
      </div>
      <AlertDialog isOpen={!noAlert && isAlertDialogOpen} onClose={() => setIsAlertDialogOpen(false)} />
    </>
  );
}
