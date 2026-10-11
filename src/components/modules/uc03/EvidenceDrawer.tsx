"use client";

import React, { useId, useRef } from "react";
import { X } from "lucide-react";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";
import { useDialogFocusTrap } from "@/components/ui/useDialogFocusTrap";
import type { SimulationEvent } from "@/simulation";
import { formatCaseTime } from "@/simulation/formatTime";

export function EvidenceDrawer() {
  const { t } = useTranslation("uc03");
  const {
    isEvidenceOpen,
    setIsEvidenceOpen,
    simulationSnapshot,
    activeDemoAlert,
  } = useMedication();
  const drawerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocusTrap(isEvidenceOpen, drawerRef, () => setIsEvidenceOpen(false));

  if (!isEvidenceOpen) return null;

  const snapshot = simulationSnapshot;
  const canonicalMedicationEvents = snapshot.events
    .filter((event) => event.eventType.startsWith("MEDICATION_"))
    .sort((left, right) => left.eventTime - right.eventTime);
  const evidenceEventIds = new Set(activeDemoAlert?.evidenceEventIds ?? []);
  const currentProposal = snapshot.medications
    .filter((medication) => medication.status === "PROPOSED")
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const currentTime = formatEvidenceTime(snapshot.encounter.startedAt, snapshot.simulationTime);
  const formatEventTime = (event: SimulationEvent) => formatEvidenceTime(snapshot.encounter.startedAt, event.eventTime);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 select-none animate-in fade-in duration-150">
      <button type="button" aria-label={t("evidenceDrawer.close")} className="flex-1 cursor-default" onClick={() => setIsEvidenceOpen(false)} />
      <div ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-[min(760px,94vw)] max-w-[94vw] min-w-0 bg-safe-surface border-l border-safe-border shadow-2xl flex flex-col h-full min-h-0 text-safe-text relative z-10 focus:outline-none">
        <div className="min-h-10 px-4 py-2 bg-safe-surface-secondary border-b border-safe-border flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div id={titleId} className="font-semibold text-sm text-safe-text uppercase tracking-wide break-words">{t("evidenceDrawer.title")}</div>
            <div className="mt-0.5 text-[10px] font-bold tracking-wide text-[#FFD828]">{t("simulation.demoOnly")} · {t("simulation.notClinicallyValidated")}</div>
          </div>
          <button type="button" onClick={() => setIsEvidenceOpen(false)} aria-label={t("evidenceDrawer.close")} className="shrink-0 text-safe-text-muted hover:text-safe-text p-1 rounded-sm focus-visible:ring-1 focus-visible:ring-safe-cyan"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3 text-[12px] leading-relaxed">
          <section className="bg-[#0A1720] border border-[rgba(50,150,205,0.35)] p-3 rounded-[2px] space-y-1.5">
            <div className="font-bold text-[13px] text-[#19BDF2]">{t("simulation.syntheticRule")}</div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-1 text-[11px]">
              <span className="text-[#A6B0B8]">{t("evidenceDrawer.ruleId")}</span><span className="font-mono text-[#F3F6F7] break-words">{activeDemoAlert?.rule?.id ?? "—"}</span>
              <span className="text-[#A6B0B8]">{t("evidenceDrawer.ruleVersion")}</span><span className="font-mono text-[#F3F6F7]">{activeDemoAlert?.rule?.version ?? "—"}</span>
              <span className="text-[#A6B0B8]">{t("simulation.ruleEffectiveDate")}</span><span className="font-mono text-[#F3F6F7]">{activeDemoAlert?.rule?.effectiveDate ?? "—"}</span>
              <span className="text-[#A6B0B8]">{t("simulation.evidenceSource")}</span><span className="text-[#F3F6F7] break-words">{activeDemoAlert?.rule?.evidenceSource ?? "—"}</span>
              <span className="text-[#A6B0B8]">{t("simulation.clinicalUseNo")}</span><span className="text-[#FFD828]">No</span>
              {activeDemoAlert && <><span className="text-[#A6B0B8]">{t("simulation.why")}</span><span className="text-[#F3F6F7] break-words">{activeDemoAlert.why ?? activeDemoAlert.message}</span></>}
            </div>
            {activeDemoAlert?.triggeringPatientData?.length ? (
              <div className="border-t border-[rgba(50,150,205,0.2)] pt-2">
                <div className="mb-1 text-[10px] font-semibold text-[#A6B0B8]">{t("simulation.patientFactors")}</div>
                <div className="flex flex-wrap gap-1.5">{activeDemoAlert.triggeringPatientData.map((factor) => <span key={factor.key} className="border border-[rgba(50,150,205,0.25)] bg-[#07121A] px-2 py-1 text-[10px] text-[#F3F6F7]">{factor.key === "ageYears" ? t("simulation.factorAge") : factor.key === "weightKg" ? t("simulation.factorWeight") : factor.key === "asa" ? t("simulation.factorAsa") : factor.label}: {factor.value}{factor.unit ? ` ${factor.unit}` : ""}</span>)}</div>
              </div>
            ) : null}
            {activeDemoAlert?.override && <div className="border-t border-[rgba(50,150,205,0.2)] pt-2 text-[10px] text-[#FFD828] break-words">{t("simulation.overrideReason")}: {activeDemoAlert.override.reason} · {formatEvidenceTime(snapshot.encounter.startedAt, activeDemoAlert.override.timestamp)}</div>}
          </section>

          <section className="min-w-0">
            <div className="mb-1 font-semibold text-[12px] text-[#F3F6F7]">{t("simulation.canonicalEvidence")}</div>
            {canonicalMedicationEvents.length === 0 ? (
              <div className="border border-[rgba(50,150,205,0.25)] bg-[#07121A] p-3 text-[11px] text-[#A6B0B8]">{t("simulation.noCanonicalEvidence")}</div>
            ) : (
              <div className="overflow-x-auto border border-[rgba(50,150,205,0.25)]">
                <table className="w-full min-w-[580px] border-collapse text-left text-[10.5px]">
                  <thead className="sticky top-0 bg-[#0A1720] text-[#A6B0B8]">
                    <tr><th className="px-2 py-1.5 font-medium">{t("table.time")}</th><th className="px-2 py-1.5 font-medium">{t("simulation.eventType")}</th><th className="px-2 py-1.5 font-medium">{t("table.drug")}</th><th className="px-2 py-1.5 font-medium">{t("simulation.eventSource")}</th></tr>
                  </thead>
                  <tbody>
                    {canonicalMedicationEvents.map((event) => {
                      const payload = evidencePayload(event);
                      const name = typeof payload.name === "string" ? payload.name : typeof payload.medicationId === "string" ? payload.medicationId : t("table.drug");
                      const amount = typeof payload.dose === "number" ? `${payload.dose} ${String(payload.doseUnit ?? "")}` : typeof payload.rate === "number" ? `${payload.rate} ${String(payload.rateUnit ?? "")}` : "—";
                      const time = formatEventTime(event);
                      const recorded = event.recordedTime === undefined ? null : formatEvidenceTime(snapshot.encounter.startedAt, event.recordedTime);
                      return (
                        <tr key={event.id} className={`border-t border-[rgba(50,150,205,0.18)] ${evidenceEventIds.has(event.id) ? "bg-[#19BDF2]/10" : ""}`}>
                          <td className="px-2 py-1.5 align-top font-mono tabular-nums whitespace-nowrap text-[#F3F6F7]">{time}{recorded && recorded !== time ? <div className="text-[9px] text-[#A6B0B8]">{t("simulation.recordedTime")}: {recorded}</div> : null}</td>
                          <td className="px-2 py-1.5 align-top break-words text-[#A6B0B8]">{event.eventType.replaceAll("_", " ")}</td>
                          <td className="px-2 py-1.5 align-top text-[#F3F6F7]">{name}<div className="font-mono text-[#A6B0B8]">{amount}</div></td>
                          <td className="px-2 py-1.5 align-top text-[#A6B0B8] break-words">{event.source} · {event.sourceType} · {event.provenance}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="text-[10px] text-[#A6B0B8]">
            {t("simulation.currentProposal")}: {currentProposal ? `${currentProposal.name} · ${currentProposal.dose} ${currentProposal.doseUnit} ${currentProposal.route}` : t("simulation.noProposal")} · {currentTime}
          </div>
        </div>

        <div className="min-h-11 px-4 py-1.5 bg-[#0A1720] border-t border-[rgba(50,150,205,0.40)] flex items-center justify-between gap-3 shrink-0">
          <span className="min-w-0 text-[10px] leading-snug text-[#FFD828]">{t("simulation.notForClinicalUse")}</span>
          <button type="button" onClick={() => setIsEvidenceOpen(false)} className="h-7 px-4 bg-[#095484] hover:bg-[#0c6ba8] text-[#F3F6F7] font-medium text-[12px] rounded-[2px] shrink-0">{t("evidenceDrawer.close")}</button>
        </div>
      </div>
    </div>
  );
}

function evidencePayload(event: SimulationEvent): Record<string, unknown> {
  return event.payload !== null && typeof event.payload === "object"
    ? event.payload as Record<string, unknown>
    : {};
}

function formatEvidenceTime(startedAt: string, timestamp: number): string {
  const [hoursText, minutes, seconds] = formatCaseTime(startedAt, timestamp).split(":");
  const hours = Number(hoursText);
  return `${String(hours % 12 || 12).padStart(2, "0")}:${minutes}:${seconds} ${hours >= 12 ? "PM" : "AM"}`;
}
