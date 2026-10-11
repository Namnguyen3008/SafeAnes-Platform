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
        className={`uc04-current-alert shrink-0 min-w-0 bg-[#0A131B] border rounded-[3px] ${
          noAlert ? "p-2 min-h-[44px] gap-2.5" : "p-3 gap-3.5"
        } flex items-center overflow-hidden select-none transition-colors focus:outline-none focus:ring-1 focus:ring-[#00C5FF]`}
        style={{ borderColor: color }}
      >
        <AlertTriangle className={`${noAlert ? "w-5 h-5" : "w-10 h-10"} shrink-0`} style={{ color }} />
        <div className="min-w-0 flex flex-col justify-center">
          <span className={`${noAlert ? "text-[9px]" : "text-[11px]"} font-mono font-extrabold uppercase leading-none`} style={{ color }}>
            {noAlert ? isVitalDb ? t("vitaldb.recordedDataLabel") : t("simulation.demoOnly")
              : resolved ? t("simulation.alertResolved") : t("simulation.demoOnly")}
          </span>
          <span className={`${noAlert ? "text-[12px] leading-tight" : "text-[16px] leading-snug"} font-bold text-[#F4F6F7] break-words`}>
            {activeAlert ? t("simulation.alertTitle")
              : isVitalDb ? t("vitaldb.noModelAlertTitle") : t("simulation.noActiveAlert")}
          </span>
          {!noAlert && (
            <p className="text-[11px] text-[#AAB4BB] mt-1 font-medium leading-snug">
              {subtitle} · {t("simulation.clickForDetails")}
            </p>
          )}
        </div>
      </div>
      <AlertDialog isOpen={!noAlert && isAlertDialogOpen} onClose={() => setIsAlertDialogOpen(false)} />
    </>
  );
}
