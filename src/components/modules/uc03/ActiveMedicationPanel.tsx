"use client";

import React from "react";
import { Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";
import { MedicationStatusSummary } from "./MedicationStatusSummary";

export function ActiveMedicationPanel() {
  const { t } = useTranslation("uc03");
  const { selectedMedId, setSelectedMedId, setIsAddMedOpen, medications } = useMedication();

  return (
    <div className="flex flex-col h-full space-y-2 select-none overflow-hidden">
      {/* Upper sub-panel: Active Medications List */}
      <div className="flex-1 bg-[#07121A] border border-[rgba(50,150,205,0.40)] rounded-[2px] flex flex-col min-h-0 overflow-hidden">
        {/* Panel Header */}
        <div className="min-h-9 h-auto px-3 py-1 bg-[#0A1720] border-b border-[rgba(50,150,205,0.40)] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex items-center space-x-2">
            <span className="min-w-0 whitespace-normal break-words leading-tight font-semibold text-[15px] tracking-wide text-[#F3F6F7]">
              {t("tabs.activeMedications")}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[13px] text-[#A6B0B8] font-mono tabular-nums">
              ({medications.length})
            </span>
          </div>
          <button
            onClick={() => setIsAddMedOpen(true)}
            className="h-6 shrink-0 whitespace-nowrap px-2.5 text-[12px] font-medium text-[#19BDF2] border border-[rgba(50,150,205,0.40)] hover:bg-[#19BDF2]/10 transition-colors flex items-center space-x-1 rounded-[2px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#19BDF2]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t("header.addMedication")}</span>
          </button>
        </div>

        <div role="table" aria-label={t("tabs.activeMedications")} className="flex min-h-0 flex-1 flex-col">
          {/* Table Column Headers (12–14px) */}
          <div role="row" className="min-h-6 px-3 py-1 bg-[#0A1720]/80 border-b border-[rgba(50,150,205,0.25)] grid grid-cols-[minmax(96px,1.3fr)_minmax(104px,1.2fr)_minmax(72px,.85fr)] gap-1 text-[12px] font-medium text-[#A6B0B8] items-center shrink-0">
            <div role="columnheader" className="min-w-0">{t("table.drug")}</div>
            <div role="columnheader" className="min-w-0">{t("table.doseRate")}</div>
            <div role="columnheader" className="min-w-0 text-right">{t("table.status")}</div>
          </div>

          {/* Rows List (12–14px) */}
          <div role="rowgroup" className="flex-1 overflow-y-auto divide-y divide-[rgba(50,150,205,0.20)]">
          {medications.map((med) => {
            const isSelected = selectedMedId === med.id;
            const isPending = med.status === "PENDING" || med.status === "ORDERED" || med.status === "PROPOSED";
            const isInfusing = med.status === "INFUSING" || med.status === "RATE_CHANGED";
            const isGiven = med.status === "GIVEN";
            const genericId = med.id.replace(/^med-/, "").split("-")[0];
            const knownGenericIds = ["propofol", "remifentanil", "rocuronium", "phenylephrine", "cefazolin", "ketorolac"];
            const indication = med.indication
              ? knownGenericIds.includes(genericId)
                ? t(`activePanel.indications.${genericId}`)
                : med.indication
              : "";
            const statusDetail = med.statusDetail?.startsWith("Since ")
              ? t("activePanel.since", { time: med.statusDetail.slice(6) })
              : med.statusDetail === "Not given"
              ? t("activePanel.notGiven")
              : med.statusDetail;

            const doseDisplay =
              typeof med.dose === "number"
                ? `${med.dose} ${med.doseUnit || ""}`.trim()
                : (med as unknown as { dose?: string }).dose;
            const rateDisplay =
              med.volumetricRate ||
              (typeof med.rate === "number"
                ? `(${med.rate} ${med.rateUnit || ""})`
                : (med as unknown as { rate?: string }).rate);

            return (
              <div
                key={med.id}
                role="row"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => setSelectedMedId(med.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedMedId(med.id);
                  }
                }}
                className={`grid grid-cols-[minmax(96px,1.3fr)_minmax(104px,1.2fr)_minmax(72px,.85fr)] gap-1 px-3 py-2 items-center relative cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-[#093552]/80 hover:bg-[#093552]"
                    : isPending
                    ? "bg-[#FF334D]/10 hover:bg-[#FF334D]/15"
                    : "hover:bg-[#0A1720]/60"
                }`}
              >
                {/* Left accent color: green for normal/active, red for pending */}
                <div
                  aria-hidden="true"
                  className={`absolute left-0 top-1 bottom-1 w-[3px] ${
                    isPending ? "bg-[#FF334D]" : "bg-[#30E96B]"
                  }`}
                />

                {/* Col 1: Drug Name (14–18px) & Indication */}
                <div role="cell" className="min-w-0 pl-1.5 pr-1">
                  <div className="font-bold text-[14px] text-[#F3F6F7] whitespace-normal break-normal leading-tight" title={med.name}>
                    {med.name}
                  </div>
                  <div className="text-[12px] text-[#A6B0B8] whitespace-normal break-words leading-tight mt-0.5" title={med.indication}>
                    {indication}
                  </div>
                </div>

                {/* Col 2: Dose / Rate */}
                <div role="cell" className="min-w-0 pr-1">
                  <div className="font-bold text-[12px] text-[#F3F6F7] font-mono tabular-nums whitespace-nowrap leading-tight" title={doseDisplay}>
                    {doseDisplay}
                  </div>
                  {rateDisplay && (
                    <div className="text-[11px] text-[#A6B0B8] font-mono tabular-nums whitespace-normal break-words leading-tight mt-0.5" title={rateDisplay}>
                      {rateDisplay}
                    </div>
                  )}
                </div>

                {/* Col 3: Status Badge */}
                <div role="cell" className="min-w-0 flex flex-col items-end justify-center text-right">
                  {isInfusing && (
                    <>
                      <div className="flex items-center justify-end gap-1 text-[#30E96B] font-bold text-[11px] leading-tight">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="min-w-0 whitespace-normal">{med.status === "RATE_CHANGED" ? t("activePanel.rateChanged") : t("activePanel.infusing")}</span>
                      </div>
                      <span className="text-[10px] text-[#A6B0B8] font-mono mt-0.5 leading-tight tabular-nums whitespace-normal">
                        {statusDetail}
                      </span>
                    </>
                  )}

                  {isGiven && (
                    <>
                      <div className="flex items-center justify-end gap-1 text-[#30E96B] font-bold text-[11px] leading-tight">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="min-w-0 whitespace-normal">{t("activePanel.given")}</span>
                      </div>
                      <span className="text-[10px] text-[#A6B0B8] font-mono mt-0.5 leading-tight tabular-nums whitespace-normal">
                        {statusDetail}
                      </span>
                    </>
                  )}

                  {isPending && (
                    <>
                      <div className="flex items-center justify-end gap-1 text-[#FF334D] font-bold text-[11px] leading-tight">
                        <AlertTriangle className="w-3 h-3 text-[#FF334D] shrink-0" />
                        <span className="min-w-0 whitespace-normal">
                          {med.status === "PROPOSED"
                            ? t("activePanel.proposed")
                            : med.status === "ORDERED"
                              ? t("activePanel.ordered")
                              : t("activePanel.pending")}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#A6B0B8] font-mono mt-0.5 leading-tight tabular-nums whitespace-normal">
                        {statusDetail}
                      </span>
                    </>
                  )}

                  {med.status === "STOPPED" && (
                    <>
                      <div className="text-[#A6B0B8] font-bold text-[11px] leading-tight">{t("activePanel.stopped")}</div>
                      <span className="text-[10px] text-[#A6B0B8] font-mono mt-0.5 leading-tight tabular-nums">{statusDetail}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      <MedicationStatusSummary />
    </div>
  );
}
