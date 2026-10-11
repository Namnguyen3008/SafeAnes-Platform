"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Link2,
  Cpu,
  Clock,
  AlertTriangle,
  Check,
  Edit3,
  X,
  FileQuestion,
  Maximize2,
  Minimize2,
  Lock,
  ExternalLink,
} from "lucide-react";
import { useClinicalReview } from "@/context/ClinicalReviewContext";
import { RejectionReason } from "@/types/uc02";
import { REJECTION_REASONS } from "@/config/uc02RecordReview";
import { getCrossModuleLinksForClaim } from "@/utils/clinicalNavigation";
import { ProvenanceBadge, SeverityBadge } from "@/components/common";
import { useTranslation } from "@/context/LocalizationContext";

export function EvidenceInspector() {
  const { t } = useTranslation("uc02");
  const params = useParams();
  const {
    selectedClaim,
    acceptClaim,
    editClaim,
    rejectClaim,
    setRequiresReview,
    confirmCausalityForClaim,
  } = useClinicalReview();

  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Edit Modal State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>("");
  const [editStartTime, setEditStartTime] = useState<string>("");
  const [editEndTime, setEditEndTime] = useState<string>("");
  const [editTerminology, setEditTerminology] = useState<string>("");

  // Reject Modal State
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>(
    "Unsupported by evidence"
  );

  // If no claim selected, nothing to inspect or fallback
  if (!selectedClaim) {
    return (
      <div data-simulation-demo-target="uc02-evidence" className="h-full min-h-0 min-w-0 flex-1 bg-safe-surface border border-safe-border rounded-[2px] p-3 flex items-center justify-center text-safe-text-muted font-mono text-[11.5px]">
        {t("evidence.noSelection")}
      </div>
    );
  }

  const claim = selectedClaim;
  const caseId = (params?.caseId as string) || "demo";
  const crossModuleLinks = getCrossModuleLinksForClaim(claim, caseId);

  const observations = claim.observations ?? [];

  const relatedEvents = claim.relatedEvents || [];
  const medicationRelation = relatedEvents.find((event) => event.name.toLowerCase().includes("phenylephrine"));
  const deviceQuality = claim.deviceQuality?.[0] || {
    device: claim.sourceStream || "Not reported",
    signalQuality: "UNKNOWN",
    clockUncertainty: "Not reported",
  };

  const validationGates = {
    number: claim.validationDetails?.number ?? claim.validation.numeric,
    unit: claim.validationDetails?.unit ?? claim.validation.unit,
    dose: claim.validationDetails?.dose ?? claim.validation.unit,
    timestamp: claim.validationDetails?.timestamp ?? claim.validation.temporal,
    interval: claim.validationDetails?.interval ?? claim.validation.temporal,
    entity: claim.validationDetails?.entity ?? claim.validation.terminology,
    evidenceId: claim.validationDetails?.evidenceId ?? claim.validation.evidence,
    conceptIdentity: claim.validationDetails?.conceptIdentity ?? claim.validation.terminology,
  };
  const validationGateEntries = [
    ["number", t("evidence.gateNumeric")],
    ["unit", t("evidence.gateUnit")],
    ["dose", t("evidence.gateDose")],
    ["timestamp", t("evidence.gateTimestamp")],
    ["interval", t("evidence.gateInterval")],
    ["entity", t("evidence.gateEntity")],
    ["evidenceId", t("evidence.gateEvidenceId")],
    ["conceptIdentity", t("evidence.gateIdentity")],
  ] as const;

  const allPassed =
    Object.values(validationGates).every(Boolean);

  // Launch Edit Modal with prefilled values
  const handleStartEdit = () => {
    setEditText(claim.text);
    setEditStartTime(claim.clinicalTime.start);
    setEditEndTime(claim.clinicalTime.end || "");
    setEditTerminology(claim.terminologyTerm || "");
    setIsEditing(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    editClaim(claim.id, {
      text: editText,
      time: { start: editStartTime, end: editEndTime || undefined },
      terminology: editTerminology,
    });
    setIsEditing(false);
  };

  // Launch Reject Modal
  const handleStartReject = () => {
    setRejectionReason(claim.rejectionReason || "Unsupported by evidence");
    setIsRejecting(true);
  };

  const handleConfirmReject = () => {
    rejectClaim(claim.id, rejectionReason);
    setIsRejecting(false);
  };

  return (
    <div data-simulation-demo-target="uc02-evidence" className="h-full min-h-0 min-w-0 flex-1 bg-safe-surface border border-safe-border rounded-[2px] p-2 flex flex-col justify-between overflow-hidden select-none text-[11.5px] relative">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between pb-1 border-b border-safe-border shrink-0">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-safe-cyan" />
          <h2 className="text-[14px] font-semibold text-safe-text tracking-tight">
            {t("evidence.inspectorTitle")}
          </h2>
          <span className="text-[10px] font-mono text-safe-cyan bg-safe-surface-secondary px-1.5 py-0.2 rounded-[2px] border border-safe-border">
            {claim.id}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          className="text-safe-text-muted hover:text-safe-text p-0.5 rounded-[2px] hover:bg-safe-surface-secondary transition-colors"
          title={t("evidence.traceTitle", { id: claim.id })}
        >
          {isDrawerOpen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 2. Scrollable Evidence Audit Content (All 8 Required Blocks) */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 my-1 space-y-1.5">
        {/* Block 1: SELECTED CLAIM */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5">
          <div className="text-[9.5px] font-mono text-safe-cyan uppercase font-bold tracking-wider mb-0.5">
            {t("evidence.selectedClaim")}
          </div>
          <div className="text-[13px] font-mono text-safe-text font-semibold leading-tight mb-1">
            &quot;{claim.text}&quot;
          </div>
          <div className="grid grid-cols-3 gap-1 text-[9.5px] font-mono text-safe-text-muted border-t border-safe-border-light/60 pt-1">
            <div>
              <span className="text-safe-text-muted block">{t("evidence.claimId")}</span>
              <span className="text-safe-text font-bold">{claim.id}</span>
            </div>
            <div>
              <span className="text-safe-text-muted block">{t("evidence.field")}</span>
              <span className="text-safe-text truncate block">
                {claim.fieldPath || claim.section}
              </span>
            </div>
            <div>
              <span className="text-safe-text-muted block">{t("evidence.proposition")}</span>
              <span className="text-safe-cyan truncate block">
                {claim.propositionType}
              </span>
            </div>
          </div>
        </div>

        {/* Block 2: CLINICAL TIME */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10.5px]">
            <Clock className="w-3 h-3 text-safe-cyan" />
            <span className="font-mono text-safe-text-muted">{t("evidence.timeSpan")}</span>
            <span className="font-mono text-safe-text font-bold tabular-nums">
              {claim.clinicalTime.start}
              {claim.clinicalTime.end ? ` → ${claim.clinicalTime.end}` : ""}
            </span>
          </div>
          <div className="font-mono text-[10px] text-safe-green bg-safe-surface px-1.5 py-0.2 rounded-[2px] border border-safe-green/40 font-semibold">
            {claim.duration ? t("evidence.duration", { duration: claim.duration }) : t("evidence.pointEvent")}
          </div>
        </div>

        {/* Block 3: PROVENANCE */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 text-[10.5px]">
          <div className="text-[9.5px] font-mono text-provenance-derived uppercase font-bold tracking-wider mb-1">
            {t("evidence.provenanceBlock")}
          </div>
          <div className="grid grid-cols-2 gap-1 text-[9.5px] font-mono">
            <div className="flex justify-between items-center bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted">{t("evidence.statusLabel")}</span>
              <ProvenanceBadge provenance={claim.provenance} size="xs" />
            </div>
            <div className="flex justify-between items-center bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted">{t("evidence.ruleLabel")}</span>
              <span className="text-safe-text">{claim.ruleId || claim.derivation?.method || "TEMPLATE"}</span>
            </div>
            <div className="flex justify-between items-center bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted">{t("evidence.softwareLabel")}</span>
              <span className="text-safe-text truncate max-w-[100px]">
                {claim.softwareVersion || "UC02-TEMPLATE-1.0-DEMO"}
              </span>
            </div>
            <div className="flex justify-between items-center bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted">{t("evidence.clinicianStatus")}</span>
              <SeverityBadge severity={claim.reviewStatus} size="xs" />
            </div>
          </div>
        </div>

        {/* Block 4: SOURCE OBSERVATIONS */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 text-[10.5px]">
          <div className="flex items-center justify-between text-[9.5px] font-mono mb-1">
            <span className="text-safe-cyan uppercase font-bold tracking-wider">
              {t("evidence.sourceObs")}
            </span>
            <span className="text-safe-text-muted">
              {t("evidence.sourceLabel")} <strong className="text-safe-text">{claim.sourceStream || "Arterial line"}</strong>
            </span>
          </div>
          <div className="space-y-0.5">
            {observations.map((obs, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-safe-surface px-1.5 py-0.5 rounded-[2px] font-mono text-[10px]"
              >
                <span className="text-safe-cyan tabular-nums font-semibold">{obs.time}</span>
                <span className="text-safe-text font-bold tabular-nums">{obs.value}</span>
                <span className="text-safe-text-muted text-[9px]">{obs.sensor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Block 5: RELATED EVENTS & Causal Safeguard */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 text-[10.5px]">
          <div className="text-[9.5px] font-mono text-safe-yellow uppercase font-bold tracking-wider mb-1">
            {t("evidence.relatedEvents")}
          </div>
          {relatedEvents.length === 0 ? (
            <div className="text-[10px] text-safe-text-muted italic bg-safe-surface p-1 rounded-[2px]">
              {t("evidence.noRelated")}
            </div>
          ) : (
            relatedEvents.map((rel, idx) => (
              <div
                key={idx}
                className="bg-safe-surface p-1.5 rounded-[2px] space-y-1 font-mono text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-safe-text font-bold">
                    {rel.name} {rel.dose ? `• ${rel.dose}` : ""}
                  </span>
                  <span className="text-safe-cyan tabular-nums font-semibold">{rel.time}</span>
                </div>
                <div className="flex items-center justify-between border-t border-safe-border-light/40 pt-1">
                  <span className="text-safe-text-muted">{t("evidence.relationship")}</span>
                  <span
                    className={`px-1 py-0.2 rounded-[2px] font-bold ${
                      rel.clinicianConfirmedCausality
                        ? "text-safe-green bg-safe-bg border border-safe-green/40"
                        : "text-safe-yellow bg-safe-bg border border-safe-yellow/40"
                    }`}
                  >
                    {rel.clinicianConfirmedCausality
                      ? t("evidence.treatedByConfirmed")
                      : rel.relationship}
                  </span>
                </div>
              </div>
            ))
          )}

          {/* Strict Safeguard Notice */}
          <div className="mt-1 bg-safe-bg border border-safe-yellow/40 p-1 rounded-[2px] flex items-center justify-between text-[9px] text-safe-text-muted">
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-safe-yellow shrink-0" />
              <span>{t("evidence.treatedByWarning")}</span>
            </div>
            {medicationRelation && (
              <button
                type="button"
                onClick={() => confirmCausalityForClaim(claim.id, medicationRelation.targetEventId)}
                className="px-1.5 py-0.2 rounded-[2px] font-mono text-[9px] font-bold transition-colors bg-safe-surface-secondary text-safe-yellow border border-safe-yellow/50 hover:bg-safe-yellow/20"
              >
                {t("actions.confirmCausality")}
              </button>
            )}
          </div>
        </div>

        {/* Cross-Module Clinical Context Bridges (Phenylephrine -> UC03, Low MAP -> UC04, Desat -> UC05) */}
        {crossModuleLinks.length > 0 && (
          <div className="bg-safe-surface-secondary border border-safe-cyan/40 rounded-[2px] p-2 text-[10.5px]">
            <div className="text-[9.5px] font-mono text-safe-cyan uppercase font-bold tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3 text-safe-cyan" />
                {t("evidence.crossModuleBridges")}
              </span>
              <span className="text-[9px] text-safe-text-dim">{t("evidence.directNav")}</span>
            </div>
            <div className="space-y-1.5">
              {crossModuleLinks.map((link) => (
                (() => {
                  const label = link.category === "medication"
                    ? t("evidence.bridgeMedication")
                    : link.category === "hemodynamics"
                      ? t("evidence.bridgeHemodynamics")
                      : link.category === "respiratory"
                        ? t("evidence.bridgeRespiratory")
                        : link.label;
                  return (
                <Link
                  key={link.id}
                  href={link.url}
                  className="flex items-center justify-between p-1.5 rounded-[2px] bg-safe-surface border border-safe-border hover:border-safe-cyan hover:bg-safe-cyan/10 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-bold text-safe-cyan font-mono group-hover:underline">
                      {label}
                    </span>
                    <span className="text-[9.5px] text-safe-text-dim font-mono">
                      → {link.moduleBadge}
                    </span>
                  </div>
                  <ExternalLink className="w-3 h-3 text-safe-cyan group-hover:translate-x-0.5 transition-transform" />
                </Link>
                  );
                })()
              ))}
            </div>
          </div>
        )}

        {/* Block 6: SOURCE / QUALITY */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 text-[10.5px]">
          <div className="text-[9.5px] font-mono text-safe-cyan uppercase font-bold tracking-wider mb-1">
            {t("evidence.sourceQuality")}
          </div>
          <div className="grid grid-cols-3 gap-1 font-mono text-[9.5px]">
            <div className="bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted block">{t("evidence.device")}</span>
              <span className="text-safe-text truncate block">{deviceQuality.device}</span>
            </div>
            <div className="bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted block">{t("evidence.signalQuality")}</span>
              <span className="text-safe-green font-bold">{deviceQuality.signalQuality}</span>
            </div>
            <div className="bg-safe-surface p-1 rounded-[2px]">
              <span className="text-safe-text-muted block">{t("evidence.clockUncertainty")}</span>
              <span className="text-safe-cyan">{deviceQuality.clockUncertainty}</span>
            </div>
          </div>
        </div>

        {/* Block 7: deterministic validation against canonical evidence */}
        <div className="bg-safe-surface-secondary border border-safe-border-light rounded-[2px] p-1.5 text-[10.5px]">
          <div className="text-[9.5px] font-mono text-safe-green uppercase font-bold tracking-wider mb-1 flex items-center justify-between">
            <span>{t("evidence.validationTitle")}</span>
            <span
              className={`text-[9px] px-1 py-0.2 rounded-[2px] border ${
                allPassed
                  ? "text-safe-green bg-safe-surface border-safe-green/40"
                  : "text-safe-red bg-safe-surface border-safe-red/40"
              }`}
            >
              {allPassed ? `${validationGateEntries.length} / ${validationGateEntries.length} PASS` : "WARNING / FAIL"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 font-mono text-[9px]">
            {validationGateEntries.map(([key, label]) => {
              const passed = validationGates[key];
              return (
                <div key={key} className="flex items-center justify-between gap-1 bg-safe-surface p-1 rounded-[2px]">
                  <span className="text-safe-text-muted">{label}</span>
                  <span className={`font-bold ${passed ? "text-safe-green" : "text-safe-red"}`}>
                    {passed ? "PASS" : "FAIL"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Block 8: ACTIONS (Accept, Edit, Reject, Requires Review) */}
      <div className="pt-1 border-t border-safe-border shrink-0">
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => acceptClaim(claim.id)}
            className="bg-safe-green hover:bg-safe-green/80 text-safe-bg font-bold py-1.5 px-1 rounded-[2px] flex items-center justify-center gap-1 text-[10px] xl:text-[11px] whitespace-nowrap transition-colors"
          >
            <Check className="w-3 h-3 shrink-0" />
            <span>{t("actions.accept")}</span>
          </button>

          <button
            type="button"
            onClick={handleStartEdit}
            className="bg-safe-surface-secondary hover:bg-safe-surface text-safe-text border border-safe-border font-medium py-1.5 px-1 rounded-[2px] flex items-center justify-center gap-1 text-[10px] xl:text-[11px] whitespace-nowrap transition-colors"
          >
            <Edit3 className="w-3 h-3 text-safe-cyan shrink-0" />
            <span>{t("actions.edit")}</span>
          </button>

          <button
            type="button"
            onClick={handleStartReject}
            className="bg-safe-surface-secondary hover:bg-safe-red/20 text-safe-red border border-safe-red/40 font-medium py-1.5 px-1 rounded-[2px] flex items-center justify-center gap-1 text-[10px] xl:text-[11px] whitespace-nowrap transition-colors"
          >
            <X className="w-3 h-3 text-safe-red shrink-0" />
            <span>{t("actions.reject")}</span>
          </button>

          <button
            type="button"
            onClick={() => setRequiresReview(claim.id)}
            className="bg-safe-surface-secondary hover:bg-safe-yellow/20 text-safe-yellow border border-safe-yellow/40 font-medium py-1.5 px-1 rounded-[2px] flex items-center justify-center gap-1 text-[10px] xl:text-[11px] whitespace-nowrap transition-colors"
            title={t("status.requiresReview")}
          >
            <FileQuestion className="w-3 h-3 text-safe-yellow shrink-0" />
            <span>{t("actions.reviewShort")}</span>
          </button>
        </div>
      </div>

      {/* 4. Edit Modal: Allows editing text, time, terminology. Locks evidenceRefs. */}
      {isEditing && (
        <div className="absolute inset-0 bg-safe-surface/95 z-50 p-2.5 flex flex-col justify-between border border-safe-cyan/70">
          <div className="flex items-center justify-between pb-1 border-b border-safe-border">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-safe-text">
              <Edit3 className="w-3.5 h-3.5 text-safe-cyan" />
              <span>{t("evidence.editModalTitle", { id: claim.id })}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-safe-text-muted hover:text-safe-text p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-1.5 my-1 text-[10.5px] font-mono">
            <div>
              <label className="text-safe-text-muted block text-[9.5px]">{t("evidence.claimTextLabel")}</label>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="w-full bg-safe-bg border border-safe-border rounded-[2px] p-1.5 text-safe-text focus:border-safe-cyan outline-none text-[11px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="text-safe-text-muted block text-[9.5px]">{t("evidence.startTimeLabel")}</label>
                <input
                  type="text"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  className="w-full bg-safe-bg border border-safe-border rounded-[2px] px-1.5 py-1 text-safe-text focus:border-safe-cyan outline-none text-[11px]"
                />
              </div>
              <div>
                <label className="text-safe-text-muted block text-[9.5px]">{t("evidence.endTimeLabel")}</label>
                <input
                  type="text"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  className="w-full bg-safe-bg border border-safe-border rounded-[2px] px-1.5 py-1 text-safe-text focus:border-safe-cyan outline-none text-[11px]"
                />
              </div>
            </div>

            <div>
              <label className="text-safe-text-muted block text-[9.5px]">{t("evidence.termLabel")}</label>
              <input
                type="text"
                value={editTerminology}
                onChange={(e) => setEditTerminology(e.target.value)}
                placeholder="e.g. Transient Hypotension, PCV Ventilation..."
                className="w-full bg-safe-bg border border-safe-border rounded-[2px] px-1.5 py-1 text-safe-text focus:border-safe-cyan outline-none text-[11px]"
              />
            </div>

            {/* Locked EvidenceRefs Notice */}
            <div className="bg-safe-bg border border-safe-border-light p-1.5 rounded-[2px] flex items-center justify-between text-[9px] text-safe-text-muted">
              <div className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-safe-cyan" />
                <span>{t("evidence.immutableRefs")}</span>
              </div>
              <span className="text-safe-cyan font-mono">
                {claim.evidenceRefs.join(", ") || "None"}
              </span>
            </div>

            <div className="flex justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2.5 py-1 rounded-[2px] bg-safe-surface-secondary border border-safe-border-light text-safe-text-muted text-[10.5px]"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded-[2px] bg-safe-cyan text-safe-bg font-bold text-[10.5px]"
              >
                {t("actions.saveConfirm")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Reject Modal: Requires selecting explicit reason from the 7 reasons enum */}
      {isRejecting && (
        <div className="absolute inset-0 bg-safe-surface/95 z-50 p-2.5 flex flex-col justify-between border border-safe-red">
          <div className="flex items-center justify-between pb-1 border-b border-safe-border">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-safe-red">
              <AlertTriangle className="w-3.5 h-3.5 text-safe-red" />
              <span>{t("evidence.rejectModalTitle", { id: claim.id })}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsRejecting(false)}
              className="text-safe-text-muted hover:text-safe-text p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="my-1.5 space-y-1.5 text-[10.5px] font-mono">
            <p className="text-safe-text-muted">
              {t("evidence.rejectRationaleRequired")}
            </p>

            <div className="space-y-1">
              {REJECTION_REASONS.map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-2 p-1.5 rounded-[2px] border cursor-pointer transition-colors ${
                    rejectionReason === reason
                      ? "bg-safe-surface-secondary border-safe-red text-safe-text font-bold"
                      : "bg-safe-bg border-safe-border-light text-safe-text-muted hover:bg-safe-surface-secondary"
                  }`}
                >
                  <input
                    type="radio"
                    name="rejection_reason"
                    value={reason}
                    checked={rejectionReason === reason}
                    onChange={() => setRejectionReason(reason)}
                    className="accent-safe-red"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-1.5 pt-1 border-t border-safe-border-light">
            <button
              type="button"
              onClick={() => setIsRejecting(false)}
              className="px-2.5 py-1 rounded-[2px] bg-safe-surface-secondary border border-safe-border-light text-safe-text-muted text-[10.5px]"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirmReject}
              className="px-3 py-1 rounded-[2px] bg-safe-red text-safe-text font-bold text-[10.5px]"
            >
              {t("actions.confirmRejection")}
            </button>
          </div>
        </div>
      )}

      {/* 6. Slide-Over Drawer for Deep Waveform Inspection */}
      {isDrawerOpen && (
        <div className="absolute inset-0 bg-safe-surface/95 z-40 p-2.5 flex flex-col justify-between border-t border-safe-cyan/80">
          <div className="flex items-center justify-between pb-1 border-b border-safe-border">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-safe-cyan" />
              <h3 className="text-[12.5px] font-bold text-safe-text">
                {t("evidence.traceTitle", { id: claim.id })}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="text-safe-text-muted hover:text-safe-text p-0.5 rounded-[2px] border border-safe-border"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 my-1.5 overflow-y-auto space-y-1.5 font-mono text-[10.5px] p-1 bg-safe-bg border border-safe-border-light rounded-[2px]">
            <div className="text-safe-cyan font-bold text-[10px]">
              {t("evidence.canonicalEvidenceTitle")}
            </div>
            {claim.derivation && (
              <div className="p-1.5 bg-safe-surface border border-safe-border-light rounded-[2px]">
                <div className="text-safe-text-muted text-[9px] uppercase">{claim.derivation.method}</div>
                <div className="text-safe-text leading-relaxed">{claim.derivation.description}</div>
                {claim.derivation.threshold && (
                  <div className="mt-1 text-safe-yellow">
                    {claim.derivation.threshold.label} ({claim.derivation.threshold.value} {claim.derivation.threshold.unit})
                  </div>
                )}
              </div>
            )}
            {(claim.evidenceDetails ?? []).map((evidence) => (
              <div key={evidence.id} className="p-1.5 bg-safe-surface border border-safe-border-light rounded-[2px] space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-safe-cyan font-bold break-all">{evidence.id}</span>
                  <span className="text-safe-text tabular-nums whitespace-nowrap">{evidence.clinicalTime ?? claim.clinicalTime.start}</span>
                </div>
                <div className="text-safe-text-muted break-words">{evidence.source} · {evidence.sourceType}</div>
                {evidence.value && <div className="text-safe-text break-words">{evidence.value}</div>}
                {evidence.relatedEventIds?.map((eventId) => (
                  <div key={eventId} className="text-safe-text-dim break-all">↳ {eventId}</div>
                ))}
              </div>
            ))}
            {(!claim.evidenceDetails || claim.evidenceDetails.length === 0) && (
              <div className="text-safe-text-muted">{t("evidence.noCanonicalEvidence")}</div>
            )}
            <div className="p-1.5 bg-safe-surface-secondary border border-safe-yellow/40 text-safe-yellow text-[10px]">
              {t("evidence.syntheticRecordNotice")}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              className="px-2.5 py-0.5 rounded-[2px] bg-safe-surface-secondary border border-safe-border text-safe-text font-mono text-[10px]"
            >
              {t("actions.closeDrawer")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
