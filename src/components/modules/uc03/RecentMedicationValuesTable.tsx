"use client";

import React from "react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";

export function RecentMedicationValuesTable() {
  const { t } = useTranslation("uc03");
  const { t: tCommon } = useTranslation("common");
  const { medicationValues, selectedMedId, handleSelectMedication } =
    useMedication();

  return (
    <div className="bg-safe-surface border border-safe-border rounded-sm flex flex-col h-full min-h-0 select-none overflow-hidden">
      {/* Header */}
      <div className="h-[var(--safe-row-height)] px-3 bg-safe-surface-secondary border-b border-safe-border flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm text-safe-text uppercase tracking-wide">
          {t("tabs.recentValues")}{" "}
          <span className="text-xs text-safe-text-muted font-normal lowercase">
            {t("alerts.last2Hours")}
          </span>
        </span>
      </div>

      <div role="table" aria-label={t("tabs.recentValues")} className="flex min-h-0 flex-1 flex-col">
        {/* Table Column Headers */}
        <div role="row" className="min-h-6 px-3 py-1 bg-safe-surface-secondary/80 border-b border-safe-border-light grid grid-cols-[minmax(72px,.8fr)_minmax(100px,1.2fr)_minmax(132px,1.4fr)_minmax(60px,.65fr)_minmax(88px,1fr)] gap-1 text-xs font-medium text-safe-text-muted items-center shrink-0">
          <div role="columnheader" className="min-w-0">{tCommon("table.time")}</div>
          <div role="columnheader" className="min-w-0">{t("table.drug")}</div>
          <div role="columnheader" className="min-w-0">{t("table.doseRate")}</div>
          <div role="columnheader" className="min-w-0">{t("table.route")}</div>
          <div role="columnheader" className="min-w-0 text-right">{t("table.status")}</div>
        </div>

        {/* Table Body */}
        <div role="rowgroup" className="flex-1 min-h-0 overflow-y-auto divide-y divide-safe-border-subtle text-[13px]">
        {medicationValues.map((row) => {
          const isSelected = selectedMedId === row.medId;
          const statusText = row.status === "Infusing"
            ? t("activePanel.infusing")
            : row.status === "Given"
            ? t("activePanel.given")
            : row.status === "Ordered"
              ? t("activePanel.ordered")
              : row.status === "Proposed"
                ? t("activePanel.proposed")
                : row.status === "Rate changed"
                  ? t("activePanel.rateChanged")
                  : row.status === "Stopped"
                    ? t("activePanel.stopped")
            : row.status;
          const statusColor = row.status === "Stopped" ? "text-safe-text-muted" : row.status === "Proposed" || row.status === "Ordered" ? "text-safe-cyan" : "text-safe-green";

          return (
            <div
              key={row.id}
              role="row"
              aria-selected={isSelected}
              tabIndex={0}
              onClick={() => handleSelectMedication(row.medId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSelectMedication(row.medId);
                }
              }}
              className={`grid grid-cols-[minmax(72px,.8fr)_minmax(100px,1.2fr)_minmax(132px,1.4fr)_minmax(60px,.65fr)_minmax(88px,1fr)] gap-1 px-3 py-1 items-center cursor-pointer transition-colors ${
                isSelected
                  ? "bg-safe-cyan/15 border-l-2 border-safe-cyan"
                  : "hover:bg-safe-surface-secondary/60"
              }`}
            >
              {/* Time */}
              <div role="cell" className="min-w-0 font-mono text-xs text-safe-text-muted tabular-nums whitespace-nowrap">
                {row.time}
              </div>

              {/* Drug */}
              <div role="cell" className="min-w-0 font-bold text-sm text-safe-text whitespace-normal break-words" title={row.drug}>
                {row.drug}
              </div>

              {/* Dose / Rate */}
              <div role="cell" className="min-w-0 font-mono text-[12px] text-safe-text tabular-nums whitespace-nowrap" title={row.doseRate}>
                {row.doseRate}
              </div>

              {/* Route */}
              <div role="cell" className="min-w-0 font-mono text-xs text-safe-text-muted whitespace-nowrap">
                {row.route}
              </div>

              {/* Status */}
              <div role="cell" className="min-w-0 flex items-center justify-end gap-1.5 whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full ${row.status === "Stopped" ? "bg-safe-text-muted" : row.status === "Proposed" || row.status === "Ordered" ? "bg-safe-cyan" : "bg-safe-green"}`} />
                <span className={`text-xs font-medium ${statusColor}`}>
                  {statusText}
                </span>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
