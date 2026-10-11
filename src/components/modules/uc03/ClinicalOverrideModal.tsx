"use client";

import React, { useId, useRef, useState } from "react";
import { X, AlertTriangle, ShieldAlert, Check } from "lucide-react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";

export function ClinicalOverrideModal() {
  const { t } = useTranslation("uc03");
  const {
    isOverrideOpen,
    setIsOverrideOpen,
    dose,
    handleAuthorizeOverride,
    currentTimeCursor,
    activeDemoAlert,
  } = useMedication();
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [validationError, setValidationError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(isOverrideOpen, dialogRef, () => setIsOverrideOpen(false));

  if (!isOverrideOpen) return null;

  const canOverride = activeDemoAlert !== null &&
    (activeDemoAlert.status === "ACTIVE" || activeDemoAlert.status === "ACKNOWLEDGED");
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canOverride || !reason.trim()) {
      setValidationError(t("simulation.demoReasonRequired"));
      return;
    }
    setValidationError("");
    handleAuthorizeOverride(reason.trim(), comment);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-none animate-in fade-in duration-150">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-[min(560px,calc(100vw-2rem))] max-w-full bg-[#07121A] border border-[#FF334D] rounded-[2px] shadow-2xl flex flex-col max-h-[90vh] min-h-0 overflow-hidden text-[#F3F6F7] focus:outline-none">
        <div className="min-h-9 px-3 py-1.5 bg-[#FF334D]/20 border-b border-[#FF334D]/60 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex items-center gap-2 text-[#FF334D]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span id={titleId} className="font-bold text-[14px] whitespace-normal break-words">{t("simulation.demoOverrideTitle")}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOverrideOpen(false)}
            aria-label={t("dialog.cancel")}
            className="shrink-0 text-[#A6B0B8] hover:text-[#F3F6F7] transition-colors p-1 focus-visible:ring-1 focus-visible:ring-[#19BDF2] rounded-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5 text-[12px]">
          <div className="bg-[#FFD828]/10 border border-[#FFD828]/50 p-2.5 rounded-[2px] space-y-1">
            <div className="text-[#FFD828] font-bold text-[13px] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{t("simulation.demoOnly")}</span>
            </div>
            <p className="text-[#A6B0B8] leading-relaxed">{t("simulation.demoOverrideDescription", { dose })}</p>
            <p className="text-[10px] font-semibold text-[#FFD828]">{t("simulation.notClinicallyValidated")}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="demo-override-reason" className="text-[12px] font-semibold text-[#F3F6F7] block">
              {t("simulation.demoReason")} <span className="text-[#FF334D]">*</span>
            </label>
            <textarea
              id="demo-override-reason"
              value={reason}
              onChange={(event) => { setReason(event.target.value); setValidationError(""); }}
              required
              rows={3}
              className="w-full bg-[#02080C] border border-[rgba(50,150,205,0.40)] p-2 text-[12px] text-[#F3F6F7] outline-none focus:border-[#19BDF2] rounded-[2px] resize-y leading-relaxed"
            />
            {validationError && <div role="alert" className="text-[11px] text-[#FF334D]">{validationError}</div>}
          </div>

          <div>
            <label htmlFor="demo-override-comment" className="text-[11px] text-[#A6B0B8] block mb-1">{t("simulation.demoComment")}</label>
            <textarea
              id="demo-override-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              className="w-full bg-[#02080C] border border-[rgba(50,150,205,0.40)] p-2 text-[12px] text-[#F3F6F7] outline-none focus:border-[#19BDF2] rounded-[2px] resize-y leading-relaxed"
            />
          </div>

          <div className="border-t border-[rgba(50,150,205,0.25)] pt-2 text-[11px] text-[#A6B0B8]">
            {t("simulation.overrideTime")}: <span className="font-mono text-[#F3F6F7]">{currentTimeCursor}</span>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[rgba(50,150,205,0.30)]">
            <button type="button" onClick={() => setIsOverrideOpen(false)} className="h-7 px-3 border border-[rgba(50,150,205,0.40)] hover:bg-[#0A1720] text-[#A6B0B8] hover:text-[#F3F6F7] text-[12px] rounded-[2px] transition-colors">
              {t("dialog.cancel")}
            </button>
            <button type="submit" disabled={!canOverride} className="h-7 px-4 bg-[#FF334D] hover:bg-[#ff1f3a] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold text-[12px] rounded-[2px] flex items-center gap-1.5 transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19BDF2]">
              <Check className="w-3.5 h-3.5" />
              <span>{t("simulation.recordDemoOverride")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
