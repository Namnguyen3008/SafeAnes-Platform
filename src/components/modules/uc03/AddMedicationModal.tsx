"use client";

import React, { useId, useRef, useState } from "react";
import { X, Plus, Pill } from "lucide-react";
import { useMedication, MedicationItem } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";

const commonMeds = [
  { name: "Fentanyl", indication: "Analgesia", defaultDose: "50 mcg IV" },
  { name: "Midazolam", indication: "Anxiolysis / Amnesia", defaultDose: "2 mg IV" },
  { name: "Ephedrine", indication: "Vasopressor / Inotrope", defaultDose: "5 mg IV" },
  { name: "Ondansetron", indication: "Antiemetic", defaultDose: "4 mg IV" },
  { name: "Dexmedetomidine", indication: "Sedation", defaultDose: "0.5 mcg/kg/hr" },
  { name: "Sugammadex", indication: "NMB Reversal", defaultDose: "200 mg IV" },
];

export function AddMedicationModal() {
  const { t } = useTranslation("uc03");
  const { isAddMedOpen, setIsAddMedOpen, handleAddMedication } = useMedication();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(isAddMedOpen, dialogRef, () => setIsAddMedOpen(false));

  const [drugName, setDrugName] = useState("");
  const [indication, setIndication] = useState("");
  const [dose, setDose] = useState("");
  const [rate, setRate] = useState("");
  const [status, setStatus] = useState<"Infusing" | "Given" | "Pending">("Pending");

  if (!isAddMedOpen) return null;

  const handleSelectPreset = (med: typeof commonMeds[0]) => {
    setDrugName(med.name);
    setIndication(med.indication);
    setDose(med.defaultDose);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const doseMatch = dose.trim().match(/^(\d+(?:\.\d+)?)(?:\s+(.+))?$/);
    const parsedDose = doseMatch ? Number(doseMatch[1]) : Number.NaN;
    if (!Number.isFinite(parsedDose) || parsedDose <= 0) return;
    const doseRemainder = doseMatch?.[2]?.trim() ?? "";
    const routeMatch = doseRemainder.match(/\s+(IV|IM|ORAL)$/i);
    const route = routeMatch?.[1]?.toUpperCase() === "ORAL" ? "Oral" : routeMatch?.[1]?.toUpperCase() ?? "";
    const doseUnit = routeMatch ? doseRemainder.slice(0, routeMatch.index).trim() : doseRemainder;
    const rateMatch = rate.trim().match(/^(\d+(?:\.\d+)?)(?:\s+(.+))?$/);
    const parsedRate = rate.trim() ? (rateMatch ? Number(rateMatch[1]) : Number.NaN) : undefined;
    if (parsedRate !== undefined && !Number.isFinite(parsedRate)) return;
    const rateUnit = rateMatch?.[2]?.trim() || (parsedRate === undefined ? undefined : "unspecified unit");

    handleAddMedication({
      name: drugName,
      indication,
      dose: parsedDose,
      doseUnit,
      rate: parsedRate,
      rateUnit,
      status: status.toUpperCase() as MedicationItem["status"],
      route,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-none p-4 select-none">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-[min(580px,calc(100vw-2rem))] bg-[#07121A] border border-[rgba(50,150,205,0.50)] rounded-[2px] shadow-2xl flex flex-col max-h-[85vh] min-h-0 overflow-hidden text-[#F3F6F7] focus:outline-none">
        {/* Header */}
        <div className="h-9 px-3 bg-[#0A1720] border-b border-[rgba(50,150,205,0.40)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Pill className="w-4 h-4 text-[#19BDF2]" />
            <span id={titleId} className="font-semibold text-[14px] whitespace-normal break-words">
              {t("header.addMedication")}
            </span>
          </div>
          <button
            onClick={() => setIsAddMedOpen(false)}
            aria-label={t("dialog.cancel")}
            className="shrink-0 text-[#A6B0B8] hover:text-[#F3F6F7] transition-colors p-1 focus-visible:ring-1 focus-visible:ring-[#19BDF2] rounded-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5 text-[12px]">
          <div className="text-[10px] leading-snug text-[#FFD828]">{t("simulation.notForClinicalUse")}</div>
          {/* Quick Select Presets */}
          <div>
            <label className="text-[11px] text-[#A6B0B8] block mb-1">
              {t("dialog.commonMeds")}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {commonMeds.map((med) => (
                <button
                  type="button"
                  key={med.name}
                  onClick={() => handleSelectPreset(med)}
                  className={`px-2 py-1.5 text-left border rounded-[2px] transition-colors ${
                    drugName === med.name
                      ? "bg-[#093552] border-[#19BDF2] text-[#F3F6F7]"
                      : "bg-[#0A1720] border-[rgba(50,150,205,0.25)] text-[#A6B0B8] hover:bg-[#071724]"
                  }`}
                >
                  <div className="font-bold text-[12px]">{med.name}</div>
                  <div className="text-[10px] text-[#A6B0B8] whitespace-normal break-words" title={med.defaultDose}>{med.defaultDose}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#A6B0B8] block mb-0.5">
                {t("dialog.drugName")} <span className="text-[#FF334D]">*</span>
              </label>
              <input
                type="text"
                value={drugName}
                onChange={(e) => setDrugName(e.target.value)}
                required
                className="w-full h-7 bg-[#02080C] border border-[rgba(50,150,205,0.40)] px-2 text-[12px] text-[#F3F6F7] outline-none focus:border-[#19BDF2] rounded-[2px]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A6B0B8] block mb-0.5">
                {t("dialog.indication")} <span className="text-[#FF334D]">*</span>
              </label>
              <input
                type="text"
                value={indication}
                onChange={(e) => setIndication(e.target.value)}
                required
                className="w-full h-7 bg-[#02080C] border border-[rgba(50,150,205,0.40)] px-2 text-[12px] text-[#F3F6F7] outline-none focus:border-[#19BDF2] rounded-[2px]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-[#A6B0B8] block mb-0.5">
                {t("dialog.doseConcentration")} <span className="text-[#FF334D]">*</span>
              </label>
              <input
                type="text"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                required
                className="w-full h-7 bg-[#02080C] border border-[rgba(50,150,205,0.40)] px-2 text-[12px] text-[#F3F6F7] font-mono outline-none focus:border-[#19BDF2] rounded-[2px]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A6B0B8] block mb-0.5">
                {t("dialog.rateOptional")}
              </label>
              <input
                type="text"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 5 mL/hr"
                className="w-full h-7 bg-[#02080C] border border-[rgba(50,150,205,0.40)] px-2 text-[12px] text-[#F3F6F7] font-mono outline-none focus:border-[#19BDF2] rounded-[2px]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#A6B0B8] block mb-0.5">
                {t("table.status")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full h-7 bg-[#02080C] border border-[rgba(50,150,205,0.40)] px-2 text-[12px] text-[#F3F6F7] outline-none focus:border-[#19BDF2] rounded-[2px]"
              >
                <option value="Given">{t("table.completed")}</option>
                <option value="Infusing">{t("table.active")}</option>
                <option value="Pending">{t("activePanel.pending")}</option>
              </select>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-[rgba(50,150,205,0.30)]">
            <button
              type="button"
              onClick={() => setIsAddMedOpen(false)}
              className="h-7 px-3 border border-[rgba(50,150,205,0.40)] hover:bg-[#0A1720] text-[#A6B0B8] hover:text-[#F3F6F7] text-[12px] rounded-[2px] transition-colors"
            >
              {t("dialog.cancel")}
            </button>
            <button
              type="submit"
              className="h-7 px-4 bg-[#095484] hover:bg-[#0c6ba8] text-[#F3F6F7] font-semibold text-[12px] rounded-[2px] flex items-center space-x-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("header.addMedication")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
