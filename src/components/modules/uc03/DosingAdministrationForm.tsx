"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface DosingAdministrationFormProps {
  className?: string;
}

export function DosingAdministrationForm({ className = "" }: DosingAdministrationFormProps) {
  const { t } = useTranslation("uc03");
  const {
    dose,
    setDose,
    doseUnit,
    setDoseUnit,
    route,
    setRoute,
    originalProposedDose,
    activeDemoAlert,
    setIsEvidenceOpen,
    handleModifyDose,
  } = useMedication();

  const hasActiveAlert = activeDemoAlert !== null &&
    (activeDemoAlert.status === "ACTIVE" || activeDemoAlert.status === "ACKNOWLEDGED");
  const parsedDose = Number(dose);
  const canModify = originalProposedDose !== null &&
    Number.isFinite(parsedDose) && parsedDose > 0 && parsedDose !== originalProposedDose && hasActiveAlert;

  return (
    <div className={`bg-[#0A1720] border border-[rgba(50,150,205,0.30)] p-2 flex flex-col justify-between rounded-[2px] min-w-0 ${className}`}>
      <div className="space-y-1.5">
        <div className="text-[14px] font-semibold text-[#F3F6F7] tracking-wide border-b border-[rgba(50,150,205,0.30)] pb-1">
          {t("simulation.currentProposal")}
        </div>
        <div className="text-[9.5px] leading-snug text-[#FFD828]">{t("simulation.notForClinicalUse")}</div>

        <div className="grid grid-cols-2 gap-2 min-w-0">
          <div className="min-w-0">
            <label className="text-[12px] text-[#A6B0B8] block mb-0.5" htmlFor="demo-dose">
              {t("dosing.dose")} <span className="text-[#FF334D]">*</span>
            </label>
            <div className="flex min-w-0">
              <input
                id="demo-dose"
                type="number"
                min="0"
                step="any"
                value={dose}
                onChange={(event) => setDose(event.target.value)}
                className="w-16 min-w-0 h-7 bg-[#07121A] border border-[rgba(50,150,205,0.40)] px-2 text-[13px] text-[#F3F6F7] font-mono tabular-nums focus:border-[#19BDF2] outline-none rounded-l-[2px]"
              />
              <select
                aria-label={t("dosing.dose") + " unit"}
                value={doseUnit}
                onChange={(event) => setDoseUnit(event.target.value)}
                className="flex-1 min-w-0 h-7 bg-[#0A1720] border border-l-0 border-[rgba(50,150,205,0.40)] px-1 text-[12px] text-[#F3F6F7] focus:border-[#19BDF2] outline-none rounded-r-[2px]"
              >
                <option value="mg">mg</option>
                <option value="mcg">mcg</option>
                <option value="g">g</option>
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label className="text-[12px] text-[#A6B0B8] block mb-0.5" htmlFor="demo-route">
              {t("dosing.route")} <span className="text-[#FF334D]">*</span>
            </label>
            <select
              id="demo-route"
              value={route}
              onChange={(event) => setRoute(event.target.value)}
              className="w-full min-w-0 h-7 bg-[#07121A] border border-[rgba(50,150,205,0.40)] px-2 text-[12px] text-[#F3F6F7] focus:border-[#19BDF2] outline-none rounded-[2px]"
            >
              <option value="IV">IV</option>
              <option value="IM">IM</option>
              <option value="Oral">{t("dosing.routeOral")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-1 pt-1.5 border-t border-[rgba(50,150,205,0.30)]">
        <button
          type="button"
          onClick={() => handleModifyDose(dose)}
          disabled={!canModify}
          className="min-w-[110px] flex-1 h-7 bg-[#19BDF2] hover:bg-[#15a8d8] active:bg-[#108fb8] disabled:opacity-45 disabled:cursor-not-allowed text-[#02080C] font-semibold text-[11.5px] xl:text-[12.5px] px-1.5 transition-colors rounded-[2px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19BDF2]"
          title={t("simulation.modifyHint")}
        >
          {t("dosing.modifyDose")}
        </button>
        <button
          type="button"
          onClick={() => setIsEvidenceOpen(true)}
          className="h-7 border border-[rgba(50,150,205,0.40)] hover:bg-[#07121A] text-[#A6B0B8] hover:text-[#F3F6F7] font-medium text-[11.5px] xl:text-[12.5px] px-1.5 flex items-center gap-1 transition-colors rounded-[2px] whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19BDF2]"
          title={t("dosing.viewEvidence")}
        >
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span>{t("dosing.viewEvidence")}</span>
        </button>
      </div>
    </div>
  );
}
