"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { DosingAdministrationForm } from "./DosingAdministrationForm";
import { useMedication } from "@/context/MedicationContext";
import { useTranslation } from "@/context/LocalizationContext";
import { formatCaseTime } from "@/simulation/formatTime";
export function MedicationSafetyReviewPanel() {
  const { t } = useTranslation("uc03");
  const {
    activeDemoAlert,
    simulationSnapshot,
    dose,
    setIsEvidenceOpen,
    setIsOverrideOpen,
    handleModifyDose,
    handleContinueWithoutDecision,
    originalProposedDose,
  } = useMedication();
  const [demoActionsOpen, setDemoActionsOpen] = React.useState(false);
  const snapshot = simulationSnapshot;
  const proposedMedication = activeDemoAlert?.medicationId
    ? snapshot.medications.find((item) => item.id === activeDemoAlert.medicationId)
    : snapshot.medications
        .filter((item) => item.status === "PROPOSED")
        .sort((left, right) => right.eventTime - left.eventTime)[0];
  const alertIsUnresolved = activeDemoAlert?.status === "ACTIVE" || activeDemoAlert?.status === "ACKNOWLEDGED";
  const enteredDose = Number(dose);
  const canModify = Boolean(
    alertIsUnresolved &&
    proposedMedication &&
    Number.isFinite(enteredDose) &&
    enteredDose > 0 &&
    enteredDose !== originalProposedDose
  );
  const statusLabel = activeDemoAlert?.status === "OVERRIDDEN"
    ? t("simulation.overridden")
    : activeDemoAlert?.status === "RESOLVED"
      ? t("simulation.resolved")
      : t("simulation.active");
  const statusColor = activeDemoAlert?.status === "OVERRIDDEN"
    ? "text-[#FFD828] border-[#FFD828]/60 bg-[#FFD828]/10"
    : activeDemoAlert?.status === "RESOLVED"
      ? "text-[#19BDF2] border-[#19BDF2]/60 bg-[#19BDF2]/10"
      : "text-[#FF334D] border-[#FF334D]/60 bg-[#FF334D]/10";
  return (
    <div data-simulation-demo-target="uc03-medication" className="bg-[#07121A] border border-[rgba(50,150,205,0.40)] rounded-[2px] flex flex-col h-full min-h-0 select-none overflow-hidden">
      <div className="min-h-9 px-3 py-1.5 bg-[#0A1720] border-b border-[rgba(50,150,205,0.40)] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="font-semibold text-[14px] tracking-wide text-[#F3F6F7]">
            {t("safetyReview.title")}
          </h2>
          <span className="text-[10px] text-[#FFD828] font-bold tracking-wide">
            {t("simulation.demoOnly")} · {t("simulation.notClinicallyValidated")}
          </span>
        </div>
        {activeDemoAlert && (
          <span className={"shrink-0 border px-2 py-1 text-[10px] font-bold uppercase rounded-[2px] " + statusColor}>
            {activeDemoAlert.severity} · {statusLabel}
          </span>
        )}
      </div>

      {!proposedMedication ? (
        <div className="m-2 min-h-0 flex-1 border border-[rgba(50,150,205,0.25)] bg-[#0A1720] p-3 rounded-[2px] flex flex-col justify-center gap-2">
          <div className="text-[14px] font-semibold text-[#F3F6F7]">{t("simulation.currentProposal")}</div>
          <p className="text-[12px] text-[#A6B0B8] leading-relaxed">{t("simulation.noProposal")}</p>
          <p className="text-[10px] text-[#FFD828]">{t("simulation.notForClinicalUse")}</p>
        </div>
      ) : (
        <>
          <div className="p-2 flex flex-wrap items-start justify-between gap-2 border-b border-[rgba(50,150,205,0.25)]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FF334D] shrink-0" />
                <h3 className="text-[14px] font-bold text-[#F3F6F7]">
                  {activeDemoAlert ? t("simulation.alertTitle") : t("simulation.noAlert")}
                </h3>
                {activeDemoAlert && (
                  <span className={"border px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] " + statusColor}>
                    {statusLabel}
                  </span>
                )}
              </div>
              <div className="mt-1 text-[12px] text-[#A6B0B8]">
                {proposedMedication.name} · <span className="font-mono tabular-nums text-[#F3F6F7]">{proposedMedication.dose} {proposedMedication.doseUnit} {proposedMedication.route}</span>
                <span className="ml-2 text-[10px] text-[#A6B0B8]">{proposedMedication.status}</span>
              </div>
            </div>

            {alertIsUnresolved && (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={demoActionsOpen}
                  onClick={() => setDemoActionsOpen((open) => !open)}
                  className="h-7 px-2.5 border border-[#19BDF2] bg-[#095484] hover:bg-[#0c6ba8] text-white font-semibold text-[11px] rounded-[2px] flex items-center gap-1"
                >
                  {t("simulation.demoAction")}
                  <span aria-hidden="true">▾</span>
                </button>
                {demoActionsOpen && (
                  <div className="absolute z-30 right-0 top-8 w-56 p-1 bg-[#07121A] border border-[rgba(50,150,205,0.60)] shadow-xl rounded-[2px] flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={!canModify}
                      onClick={() => {
                        handleModifyDose(dose);
                        setDemoActionsOpen(false);
                      }}
                      className="min-h-7 px-2 text-left text-[11px] text-[#F3F6F7] hover:bg-[#093552] disabled:opacity-40 disabled:cursor-not-allowed rounded-[2px]"
                    >
                      {t("simulation.modify")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOverrideOpen(true);
                        setDemoActionsOpen(false);
                      }}
                      className="min-h-7 px-2 text-left text-[11px] text-[#F3F6F7] hover:bg-[#093552] rounded-[2px]"
                    >
                      {t("simulation.override")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleContinueWithoutDecision();
                        setDemoActionsOpen(false);
                      }}
                      className="min-h-7 px-2 text-left text-[11px] text-[#F3F6F7] hover:bg-[#093552] rounded-[2px]"
                    >
                      {t("simulation.continueWithoutDecision")}
                    </button>
                    {!canModify && (
                      <p className="px-2 py-1 text-[10px] leading-snug text-[#A6B0B8] border-t border-[rgba(50,150,205,0.20)]">
                        {t("simulation.modifyHint")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.2fr)_minmax(250px,.8fr)] gap-2 p-2 overflow-y-auto">
            <div className="min-w-0 flex flex-col gap-2">
              <section className="border border-[rgba(50,150,205,0.30)] bg-[#0A1720] p-2 rounded-[2px]">
                <div className="text-[11px] font-semibold text-[#FF334D] mb-1">{t("simulation.why")}</div>
                <p className="text-[12px] leading-relaxed text-[#F3F6F7]">
                  {activeDemoAlert ? t("simulation.alertWhy") : t("simulation.noAlert")}
                </p>
              </section>

              <section className="border border-[rgba(50,150,205,0.30)] bg-[#0A1720] p-2 rounded-[2px]">
                <div className="text-[11px] font-semibold text-[#A6B0B8] mb-1">{t("simulation.patientFactors")}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(activeDemoAlert?.triggeringPatientData ?? []).map((factor) => (
                    <div key={factor.key} className="min-w-0 border border-[rgba(50,150,205,0.20)] bg-[#07121A] p-1.5 rounded-[2px]">
                      <div className="text-[9px] text-[#A6B0B8]">{factor.key === "ageYears" ? t("simulation.factorAge") : factor.key === "weightKg" ? t("simulation.factorWeight") : factor.key === "asa" ? t("simulation.factorAsa") : factor.label}</div>
                      <div className="font-mono text-[13px] font-bold text-[#F3F6F7] tabular-nums break-words">
                        {factor.value}{factor.unit ? " " + factor.unit : ""}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[9.5px] text-[#A6B0B8]">{t("simulation.patientContextDisclaimer")}</p>
              </section>

              <section className="border border-[rgba(50,150,205,0.30)] bg-[#0A1720] p-2 rounded-[2px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-[#19BDF2]">{t("simulation.syntheticRule")}</div>
                  <button type="button" onClick={() => setIsEvidenceOpen(true)} className="h-6 px-2 border border-[#19BDF2]/60 text-[#19BDF2] hover:bg-[#19BDF2]/10 text-[10px] rounded-[2px]">
                    {t("simulation.evidence")}
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[#F3F6F7]">
                  <span>{activeDemoAlert?.rule?.id ?? "—"}</span>
                  <span>v{activeDemoAlert?.rule?.version ?? "—"}</span>
                  <span>{activeDemoAlert?.rule?.effectiveDate ?? "—"}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#A6B0B8]">
                  {activeDemoAlert ? t("simulation.demoRuleDescription") : t("simulation.noAlert")}
                </p>
                <div className="mt-1 text-[9.5px] text-[#FFD828]">
                  {activeDemoAlert?.rule?.evidenceSource ?? "—"} · {t("simulation.clinicalUseNo")}
                </div>
              </section>
              {activeDemoAlert?.override && (
                <section className="border border-[#FFD828]/50 bg-[#FFD828]/10 p-2 rounded-[2px] text-[10px] text-[#F3F6F7]">
                  <div>{t("simulation.overrideReason")}: {activeDemoAlert.override.reason}</div>
                  <div>{t("simulation.overrideTime")}: {formatCaseTime(snapshot.encounter.startedAt, activeDemoAlert.override.timestamp)}</div>
                </section>
              )}
            </div>

            <div className="min-w-0 min-h-[250px]">
              <DosingAdministrationForm className="h-full" />
            </div>
          </div>
          {activeDemoAlert && (
            <div className="px-2 py-1 border-t border-[rgba(50,150,205,0.25)] text-[9.5px] text-[#FFD828] shrink-0">
              {activeDemoAlert.safetyBoundary}
            </div>
          )}
        </>
      )}
    </div>
  );
}
