"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { useHemodynamic } from "@/context/HemodynamicContext";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";

export interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAcknowledge?: () => void;
}

export function AlertDialog({ isOpen, onClose }: AlertDialogProps) {
  const { t } = useTranslation("uc04");
  const dialogRef = useRef<HTMLDivElement>(null);
  const { activeAlert, vitals } = useHemodynamic();
  useDialogFocusTrap(isOpen, dialogRef, onClose);

  if (!isOpen || !activeAlert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby="alert-desc"
        className="w-[min(600px,calc(100vw-2rem))] max-h-[90vh] min-h-0 bg-[#071018] border-2 border-[#F5E328] rounded-[3px] p-4 flex flex-col text-[#F4F6F7] shadow-[0_0_30px_rgba(0,0,0,0.45)] focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 pb-2 border-b border-[rgba(100,170,210,0.32)]">
          <div className="min-w-0">
            <span className="text-[11px] font-mono font-extrabold uppercase bg-[#F5E328] text-[#071018] px-1.5 py-0.5 rounded-[2px] inline-block leading-none">{t("simulation.demoOnly")}</span>
            <h2 id="alert-title" className="text-[17px] font-black text-[#F4F6F7] tracking-tight mt-1 break-words">
              {activeAlert.status === "RESOLVED" ? t("simulation.alertResolved") : t("simulation.alertTitle")}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-[#AAB4BB] hover:text-white p-1 rounded-[2px] focus:outline-none focus:ring-1 focus:ring-[#00C5FF]" aria-label={t("events.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div id="alert-desc" className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 space-y-2.5 text-[12px]">
          <div className="bg-[#0A131B] border border-[rgba(100,170,210,0.2)] p-2.5 rounded-[2px] space-y-2">
            <DetailRow label={t("events.eventTimestamp")} value={`${activeAlert.timestamp} · ${activeAlert.ageMinutes ?? "—"} min`} />
            <DetailRow label={t("simulation.riskEstimate")} value={activeAlert.riskPercent == null ? "—" : `${activeAlert.riskPercent}%`} />
            <DetailRow label={t("simulation.leadTime")} value={activeAlert.leadTimeMinutes == null ? "—" : `${activeAlert.leadTimeMinutes} min`} />
            <DetailRow label={t("simulation.observedMeasurement")} value={vitals.map == null ? t("simulation.noMeasurement") : `${vitals.map} mmHg`} />
            <DetailRow label={t("simulation.configuredThreshold")} value={`${activeAlert.thresholdMmHg ?? "—"} mmHg · ${t("simulation.demoOnly")}`} />
            <DetailRow label={t("simulation.model")} value={`${activeAlert.modelId} · ${activeAlert.modelVersion}`} />
            <DetailRow label={t("simulation.confidence")} value={activeAlert.confidencePercent == null ? "—" : `${activeAlert.confidencePercent}%`} />
            <DetailRow label={t("simulation.dataCoverage")} value={activeAlert.dataCoveragePercent == null ? "—" : `${activeAlert.dataCoveragePercent}%`} />
            <DetailRow label={t("simulation.missingInputs")} value={activeAlert.missingSignals?.length ? activeAlert.missingSignals.join(", ") : t("simulation.noUnavailableInputs")} />
          </div>
          <p className="border-l-2 border-[#F5E328] pl-2 text-[11px] leading-relaxed text-[#D5DDE2]">{t("simulation.notClinical")}</p>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 pt-2 border-t border-[rgba(100,170,210,0.32)]">
          <button type="button" onClick={onClose} className="px-3 py-1 text-[12px] text-[#AAB4BB] hover:text-white bg-[#0A131B] border border-[rgba(100,170,210,0.32)] rounded-[2px]">{t("events.dismiss")}</button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[#AAB4BB]">
      <span>{label}</span>
      <span className="font-mono text-right text-[#F4F6F7]">{value}</span>
    </div>
  );
}
