"use client";

import React from "react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface PatientContextPanelProps {
  className?: string;
}

export function PatientContextPanel({
  className = "",
}: PatientContextPanelProps) {
  const { t } = useTranslation("common");
  const { t: tUc03 } = useTranslation("uc03");
  const { t: tShell } = useTranslation("shell");
  const { patient } = useMedication();
  const sexLabel = patient.sex.toLowerCase() === "female"
    ? tShell("female")
    : patient.sex.toLowerCase() === "male"
    ? tShell("male")
    : patient.sex;

  const allergiesText = patient.allergies
    .map((a) => `${a.substance} (${a.reaction})`)
    .join(", ");

  return (
    <div className={`px-2 py-0.5 space-y-0.5 select-none ${className}`}>
      <div className="text-[14px] font-semibold text-[#F3F6F7] tracking-wide">
        {t("patientContext.title")}
      </div>
      <div className="space-y-0.5 text-[11px]">
        <div className="grid grid-cols-[minmax(82px,.8fr)_minmax(0,1.2fr)] gap-x-2 items-start leading-tight">
          <span className="min-w-0 text-[#A6B0B8]">{t("patientContext.ageSex")}</span>
          <span className="min-w-0 whitespace-nowrap text-right text-[#F3F6F7] font-medium">
            {patient.ageYears} {tUc03("safetyReview.years")} / {sexLabel}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(82px,.8fr)_minmax(0,1.2fr)] gap-x-2 items-start leading-tight">
          <span className="min-w-0 text-[#A6B0B8]">{t("patientContext.weight")}</span>
          <span className="min-w-0 whitespace-nowrap text-right text-[#F3F6F7] font-medium tabular-nums">
            {patient.weightKg} kg
          </span>
        </div>
        <div className="grid grid-cols-[minmax(82px,.8fr)_minmax(0,1.2fr)] gap-x-2 items-start leading-tight">
          <span className="min-w-0 text-[#A6B0B6]">{t("patientContext.asaStatus")}</span>
          <span className="min-w-0 text-right text-[#F3F6F7] font-medium">{patient.asaStatus}</span>
        </div>
        <div className="grid grid-cols-[minmax(82px,.8fr)_minmax(0,1.2fr)] gap-x-2 items-start leading-tight">
          <span className="min-w-0 text-[#A6B0B8]">{t("patientContext.procedure")}</span>
          <span className="min-w-0 text-right text-[#F3F6F7] font-medium truncate" title={patient.procedure}>
            {patient.procedure}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(82px,.8fr)_minmax(0,1.2fr)] gap-x-2 items-start leading-tight">
          <span className="min-w-0 text-[#A6B0B8]">{t("patientContext.allergies")}</span>
          <span className={`min-w-0 whitespace-normal break-words text-right ${patient.allergies.length === 0 ? "text-[#A6B0B8] font-medium" : "text-[#FF334D] font-bold"}`} title={allergiesText || tUc03("simulation.noAllergyInfo")}>
            {allergiesText || tUc03("simulation.noAllergyInfo")}
          </span>
        </div>
      </div>
      <div className="border-t border-[rgba(50,150,205,0.25)] pt-1 text-[9.5px] leading-snug text-[#FFD828]">{tUc03("simulation.patientContextDisclaimer")}</div>
    </div>
  );
}
