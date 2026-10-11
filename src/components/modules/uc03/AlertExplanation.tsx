"use client";

import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface AlertExplanationProps {
  className?: string;
}

export function AlertExplanation({ className = "" }: AlertExplanationProps) {
  const { t } = useTranslation("uc03");
  const { activeDemoAlert } = useMedication();
  const patientFactors = activeDemoAlert?.triggeringPatientData ?? [];

  return (
    <div className={`bg-[#0A1720] border border-[rgba(50,150,205,0.30)] p-2 flex flex-col gap-1 rounded-[2px] min-w-0 ${className}`}>
      <div className="text-[12px] font-semibold text-[#F3F6F7]">{t("simulation.why")}</div>
      {activeDemoAlert ? (
        <>
          <p className="text-[11px] leading-relaxed text-[#A6B0B8] break-words">{activeDemoAlert.why ?? activeDemoAlert.message}</p>
          {patientFactors.length > 0 && (
            <ul className="text-[10px] text-[#A6B0B8] space-y-0.5">
              {patientFactors.map((factor) => <li key={factor.key} className="break-words">{factor.label}: <span className="font-mono tabular-nums text-[#F3F6F7]">{factor.value}{factor.unit ? ` ${factor.unit}` : ""}</span></li>)}
            </ul>
          )}
        </>
      ) : <p className="text-[11px] text-[#A6B0B8]">{t("simulation.noAlert")}</p>}
      <div className="text-[9.5px] font-semibold text-[#FFD828]">{t("simulation.notForClinicalUse")}</div>
    </div>
  );
}
