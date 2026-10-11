"use client";

import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

interface PatientSpecificFactorsProps {
  className?: string;
}

export function PatientSpecificFactors({ className = "" }: PatientSpecificFactorsProps) {
  const { t } = useTranslation("common");
  const { t: tShell } = useTranslation("shell");
  const { patient } = useMedication();
  const sex = patient.sex.toLowerCase() === "female"
    ? tShell("female")
    : patient.sex.toLowerCase() === "male"
      ? tShell("male")
      : patient.sex;
  const factors = [
    { label: t("patientContext.ageSex"), value: `${patient.ageYears} / ${sex}` },
    { label: t("patientContext.weight"), value: `${patient.weightKg} kg` },
    { label: t("patientContext.asaStatus"), value: patient.asaStatus },
    { label: "OR", value: patient.room },
  ];

  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <div className="text-[12px] font-semibold text-safe-text-muted tracking-wide">{t("patientContext.title")}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {factors.map((factor) => (
          <div key={factor.label} className="min-w-0 min-h-[50px] bg-safe-surface-secondary border border-safe-border-light p-1.5 flex flex-col justify-between rounded-[2px]">
            <span className="text-[10px] leading-tight text-safe-text-muted break-words">{factor.label}</span>
            <span className="text-[13px] font-bold font-mono text-safe-text leading-tight tabular-nums break-words">{factor.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
