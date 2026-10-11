"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { CaseContext } from "@/types/uc01";
import { useTranslation } from "@/context/LocalizationContext";

export interface ORContextPanelProps {
  caseContext: CaseContext;
  onEdit?: () => void;
}

export const ORContextPanel: React.FC<ORContextPanelProps> = ({
  caseContext,
  onEdit,
}) => {
  const { t } = useTranslation("uc01");
  const [isEditing, setIsEditing] = useState(false);

  const handleEditClick = () => {
    setIsEditing(!isEditing);
    if (onEdit) onEdit();
  };

  const surgicalTeamDisplay = `${caseContext.surgicalTeam.leadSurgeon} / ${caseContext.surgicalTeam.service}`;
  const anesthesiaTeamDisplay = `${caseContext.anesthesiaTeam.attending} / ${caseContext.anesthesiaTeam.crna}`;
  const equipmentDisplay = caseContext.specialEquipment.join(", ");
  const abxDisplay = `${caseContext.antibioticProphylaxis.medication} (${caseContext.antibioticProphylaxis.timing})`;

  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm p-2.5 flex flex-col justify-between select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-safe-border mb-1.5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-safe-text">
          {t("orContext.title")}
        </h3>
        <Button
          variant="workstation"
          size="xs"
          onClick={handleEditClick}
          className="text-safe-cyan hover:text-safe-cyan border-safe-cyan/60"
        >
          {t("orContext.edit")}
        </Button>
      </div>

      {/* Grid of OR Context Info */}
      <div className="grid grid-cols-[125px_1fr] gap-x-2 gap-y-1 text-[13px] leading-tight">
        <div className="text-xs text-safe-text-muted">{t("orContext.orRoom")}</div>
        <div className="text-safe-text font-semibold">{caseContext.orRoom}</div>

        <div className="text-xs text-safe-text-muted">{t("orContext.surgeryStart")}</div>
        <div className="text-safe-text font-mono tabular-nums">
          {caseContext.scheduledStartTime}
        </div>

        <div className="text-xs text-safe-text-muted">{t("orContext.durationEst")}</div>
        <div className="text-safe-text">{caseContext.estimatedDuration}</div>

        <div className="text-xs text-safe-text-muted">{t("orContext.surgicalTeam")}</div>
        <div className="text-safe-text">{surgicalTeamDisplay}</div>

        <div className="text-xs text-safe-text-muted">{t("orContext.anesthesiaTeam")}</div>
        <div className="text-safe-text">{anesthesiaTeamDisplay}</div>

        <div className="text-xs text-safe-text-muted">{t("orContext.position")}</div>
        <div className="text-safe-text">{caseContext.patientPosition}</div>

        <div className="text-xs text-safe-text-muted">{t("orContext.specialEquipment")}</div>
        <div className="text-safe-text truncate" title={equipmentDisplay}>
          {equipmentDisplay}
        </div>

        <div className="text-xs text-safe-text-muted">{t("orContext.bloodLossRisk")}</div>
        <div
          className={`font-bold ${
            caseContext.bloodLossRisk === "High"
              ? "text-safe-red"
              : caseContext.bloodLossRisk === "Moderate"
              ? "text-safe-yellow"
              : "text-safe-green"
          }`}
        >
          {caseContext.bloodLossRisk}
        </div>

        <div className="text-xs text-safe-text-muted">{t("orContext.bloodProducts")}</div>
        <div className="text-safe-green font-bold">{caseContext.bloodProducts}</div>

        <div className="text-xs text-safe-text-muted">{t("orContext.antibioticProphylaxis")}</div>
        <div className="text-safe-green truncate" title={abxDisplay}>
          {abxDisplay}
        </div>
      </div>
    </div>
  );
};
