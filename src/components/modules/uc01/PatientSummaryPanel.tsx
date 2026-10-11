"use client";

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientContext } from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface PatientSummaryPanelProps {
  patient: PatientContext;
  onEdit?: () => void;
  onNextPage?: () => void;
}

export const PatientSummaryPanel: React.FC<PatientSummaryPanelProps> = ({
  patient,
  onEdit,
  onNextPage,
}) => {
  const { t } = useTranslation("uc01");
  const { t: tShell } = useTranslation("shell");
  const [isEditing, setIsEditing] = useState(false);
  const patientSex = patient.sex.toLowerCase() === "female"
    ? tShell("female")
    : patient.sex.toLowerCase() === "male"
    ? tShell("male")
    : patient.sex;
  const anesthesiaPlan = patient.anesthesiaPlan.toLowerCase().startsWith("general")
    ? tShell("anesthesiaTypes.general")
    : patient.anesthesiaPlan;

  const handleEditClick = () => {
    setIsEditing(!isEditing);
    if (onEdit) onEdit();
  };

  const allergyDisplay =
    patient.allergies && patient.allergies.length > 0
      ? patient.allergies.map((a) => `${a.allergen} (${a.reaction})`).join(", ")
      : t("patientSummary.noneKnown");

  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-safe-border mb-1.5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-safe-text">
          {t("patientSummary.title")}
        </h3>
        <Button
          variant="workstation"
          size="xs"
          onClick={handleEditClick}
          className="text-safe-cyan hover:text-safe-cyan border-safe-cyan/60"
        >
          {t("patientSummary.edit")}
        </Button>
      </div>

      {/* Grid of Patient Info */}
      <div className="grid grid-cols-[98px_1fr] gap-x-2 gap-y-1.5 text-[13px] leading-tight">
        <div className="text-xs text-safe-text-muted">{t("patientSummary.name")}</div>
        <div className="text-safe-text font-semibold tracking-wide">
          {patient.name}
        </div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.mrn")}</div>
        <div className="text-safe-text font-mono tabular-nums">{patient.mrn}</div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.ageSex")}</div>
        <div className="text-safe-text">
          {patient.ageYears} {t("patientSummary.years")} / {patientSex}
        </div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.weight")}</div>
        <div className="text-safe-text">
          {patient.weightKg} kg{" "}
          <span className="text-safe-text-muted font-normal">
            {patient.bmi !== null && <> (BMI {patient.bmi})</>}
          </span>
        </div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.asaStatus")}</div>
        <div className="text-safe-text font-semibold">{patient.asaStatus}</div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.procedure")}</div>
        <div
          className="text-safe-text font-medium truncate"
          title={patient.procedureName}
        >
          {patient.procedureName}
        </div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.surgeon")}</div>
        <div className="text-safe-text">{patient.primarySurgeon}</div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.anesthesia")}</div>
        <div className="text-safe-text">{anesthesiaPlan}</div>

        <div className="text-xs text-safe-text-muted">{t("patientSummary.allergies")}</div>
        <div className="flex items-center justify-between">
          <span className="min-w-0 break-words text-safe-red font-bold tracking-wide">
            {allergyDisplay}
          </span>
          <button
            onClick={onNextPage}
            className="w-5 h-5 rounded-full bg-safe-surface-secondary hover:bg-safe-surface-elevated border border-safe-border-light flex items-center justify-center text-safe-text-muted hover:text-safe-text transition-colors cursor-pointer"
            title={t("patientSummary.nextPage")}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
