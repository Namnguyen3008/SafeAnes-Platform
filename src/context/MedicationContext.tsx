"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  PatientContext,
  MedicationState,
  MedicationAlert,
  MedicationProposal,
  MedicationTimelineEvent,
  MedicationRiskSummaryItem,
  MedicationValueRow,
} from "@/types/uc03";
import { getUC03SimulationViewModel } from "@/adapters/uc03Adapter";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import type { SimulationAlert, SimulationEvent, SimulationSnapshot } from "@/simulation";
import { formatCaseTime } from "@/simulation/formatTime";

export type {
  PatientContext,
  MedicationState,
  MedicationAlert,
  MedicationProposal,
  MedicationTimelineEvent,
  MedicationRiskSummaryItem,
  MedicationValueRow,
};

export type AlertRow = MedicationAlert;
export type MedicationItem = MedicationState;

interface MedicationContextType {
  patient: PatientContext;
  proposal: MedicationProposal;
  riskSummary: MedicationRiskSummaryItem[];
  timelineEvents: MedicationTimelineEvent[];
  selectedMedId: string;
  setSelectedMedId: (id: string) => void;
  selectedAlert: MedicationAlert | null;
  setSelectedAlert: (alert: MedicationAlert | null) => void;
  currentTimeCursor: string;
  setCurrentTimeCursor: (time: string) => void;
  medications: MedicationState[];
  dose: string;
  setDose: (dose: string) => void;
  doseUnit: string;
  setDoseUnit: (unit: string) => void;
  route: string;
  setRoute: (route: string) => void;
  isOverridden: boolean;
  overrideReason: string;
  overrideComment: string;
  overrideTimestamp: string;
  isEvidenceOpen: boolean;
  setIsEvidenceOpen: (open: boolean) => void;
  isOverrideOpen: boolean;
  setIsOverrideOpen: (open: boolean) => void;
  isAddMedOpen: boolean;
  setIsAddMedOpen: (open: boolean) => void;
  alerts: MedicationAlert[];
  medicationValues: MedicationValueRow[];
  simulationSnapshot: SimulationSnapshot;
  activeDemoAlert: SimulationAlert | null;
  originalProposedDose: number | null;
  handleSelectMedication: (id: string) => void;
  handleSelectAlert: (alert: MedicationAlert) => void;
  handleModifyDose: (newDose?: string) => void;
  handleAuthorizeOverride: (reason: string, comment?: string) => void;
  handleContinueWithoutDecision: () => void;
  handleAddMedication: (med: Partial<MedicationState>) => void;
}

const MedicationContext = createContext<MedicationContextType | undefined>(undefined);

export function MedicationProvider({ children }: { children: ReactNode }) {
  const { engine, snapshot } = useSimulationReplay();
  const model = useMemo(() => getUC03SimulationViewModel(snapshot), [snapshot]);
  const simulationProposal = useMemo(() => [...snapshot.medications]
    .filter((medication) => medication.status === "PROPOSED")
    .sort((left, right) => right.eventTime - left.eventTime)[0] ?? null, [snapshot.medications]);
  const activeDemoAlert = useMemo(() => [...snapshot.alerts]
    .filter((alert) => alert.sourceModule === "UC03")
    .sort((left, right) => right.eventTime - left.eventTime)[0] ?? null, [snapshot.alerts]);

  const [selectedMedId, setSelectedMedId] = useState(() => model.medications[0]?.id ?? "");
  const [selectedAlert, setSelectedAlert] = useState<MedicationAlert | null>(null);
  const [dose, setDose] = useState(() => simulationProposal ? String(simulationProposal.dose) : "");
  const [doseUnit, setDoseUnit] = useState(() => simulationProposal?.doseUnit ?? "mg");
  const [route, setRoute] = useState(() => simulationProposal?.route ?? "IV");
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const actionSequence = useRef(0);

  useEffect(() => {
    if (!selectedMedId && model.medications.length) setSelectedMedId(model.medications[0].id);
    if (selectedMedId && !model.medications.some((medication) => medication.id === selectedMedId) &&
      !model.timelineEvents.some((event) => event.medicationId === selectedMedId)) {
      setSelectedMedId(model.medications[0]?.id ?? "");
    }
    if (selectedAlert && !model.alerts.some((alert) => alert.id === selectedAlert.id)) setSelectedAlert(null);
  }, [model, selectedAlert, selectedMedId]);

  useEffect(() => {
    setDose(simulationProposal ? String(simulationProposal.dose) : "");
    setDoseUnit(simulationProposal?.doseUnit ?? "mg");
    setRoute(simulationProposal?.route ?? "IV");
  }, [simulationProposal?.id, simulationProposal?.dose, simulationProposal?.doseUnit,
    simulationProposal?.route]);

  const dispatchDemoEvent = useCallback((
    eventType: string,
    payload: Record<string, string | number | boolean | null>,
  ) => {
    const eventTime = engine.simulationTime;
    let id: string;
    do {
      actionSequence.current += 1;
      id = `uc03-demo-action-${Math.trunc(eventTime)}-${actionSequence.current}`;
    } while (engine.hasEvent(id));
    const event: SimulationEvent<Record<string, string | number | boolean | null>> = {
      id,
      eventTime,
      recordedTime: eventTime,
      source: "uc03-demo-actions",
      sourceType: "MANUAL",
      eventType,
      payload: { ...payload, synthetic: true, clinicalUse: false },
      provenance: "DIRECT",
    };
    engine.dispatchEvent(event);
  }, [engine]);

  const currentTimeCursor = displaySimulationTime(snapshot, snapshot.simulationTime);
  const setCurrentTimeCursor = useCallback((time: string) => {
    engine.seek(elapsedForTime(time, snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs));
  }, [engine, snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs]);

  const handleSelectMedication = useCallback((id: string) => setSelectedMedId(id), []);
  const handleSelectAlert = useCallback((alert: MedicationAlert) => {
    setSelectedAlert(alert);
    if (alert.medicationId) setSelectedMedId(alert.medicationId);
    const alertTime = alert.timestamp || alert.time;
    if (alertTime) setCurrentTimeCursor(alertTime);
  }, [setCurrentTimeCursor]);

  const handleModifyDose = useCallback((newDose?: string) => {
    const parsedDose = Number(newDose ?? dose);
    if (!simulationProposal || !activeDemoAlert ||
      !["ACTIVE", "ACKNOWLEDGED"].includes(activeDemoAlert.status) ||
      !Number.isFinite(parsedDose) || parsedDose <= 0 || parsedDose === simulationProposal.dose) return;
    dispatchDemoEvent("MEDICATION_PROPOSAL_MODIFIED", {
      medicationId: simulationProposal.id,
      alertId: activeDemoAlert.id,
      name: simulationProposal.name,
      dose: parsedDose,
      doseUnit,
      route,
      indication: simulationProposal.indication,
      action: "MODIFY",
    });
  }, [activeDemoAlert, dispatchDemoEvent, dose, doseUnit, route, simulationProposal]);

  const handleAuthorizeOverride = useCallback((reason: string, optionalComment = "") => {
    if (!activeDemoAlert || !["ACTIVE", "ACKNOWLEDGED"].includes(activeDemoAlert.status)) return;
    dispatchDemoEvent("MEDICATION_DEMO_ALERT_OVERRIDDEN", {
      medicationId: simulationProposal?.id ?? activeDemoAlert.medicationId ?? "",
      alertId: activeDemoAlert.id,
      reason,
      comment: optionalComment,
      timestamp: snapshot.simulationTime,
      status: "OVERRIDDEN",
    });
    setIsOverrideOpen(false);
  }, [activeDemoAlert, dispatchDemoEvent, simulationProposal, snapshot.simulationTime]);

  const handleContinueWithoutDecision = useCallback(() => {
    if (!activeDemoAlert || !["ACTIVE", "ACKNOWLEDGED"].includes(activeDemoAlert.status)) return;
    dispatchDemoEvent("MEDICATION_DEMO_REVIEW_CONTINUED", {
      medicationId: simulationProposal?.id ?? activeDemoAlert.medicationId ?? "",
      alertId: activeDemoAlert.id,
      decision: "NONE",
    });
  }, [activeDemoAlert, dispatchDemoEvent, simulationProposal]);

  const handleAddMedication = useCallback((medication: Partial<MedicationState>) => {
    if (!medication.name?.trim()) return;
    const slug = medication.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const eventTime = Math.trunc(engine.simulationTime);
    let medicationId: string;
    do {
      actionSequence.current += 1;
      medicationId = `demo-med-${slug}-${eventTime}-${actionSequence.current}`;
    } while (engine.getSnapshot().medications.some((item) => item.id === medicationId));
    const eventType = medication.status === "GIVEN"
      ? "MEDICATION_ADMINISTERED"
      : medication.status === "INFUSING"
        ? "MEDICATION_INFUSION_STARTED"
        : medication.status === "RATE_CHANGED"
          ? "MEDICATION_RATE_CHANGED"
          : medication.status === "STOPPED"
            ? "MEDICATION_STOPPED"
            : "MEDICATION_ORDERED";
    dispatchDemoEvent(eventType, {
      medicationId,
      name: medication.name.trim(),
      indication: medication.indication ?? "Synthetic demonstration order",
      dose: typeof medication.dose === "number" ? medication.dose : 0,
      doseUnit: medication.doseUnit ?? "mg",
      route: medication.route ?? "",
      rate: typeof medication.rate === "number" ? medication.rate : 0,
      rateUnit: medication.rateUnit ?? "",
    });
    setIsAddMedOpen(false);
  }, [dispatchDemoEvent, engine]);

  const isOverridden = activeDemoAlert?.status === "OVERRIDDEN";
  const overrideReason = activeDemoAlert?.override?.reason ?? "";
  const overrideComment = activeDemoAlert?.override?.comment ?? "";
  const overrideTimestamp = activeDemoAlert?.override
    ? displaySimulationTime(snapshot, activeDemoAlert.override.timestamp)
    : "";

  const value = useMemo<MedicationContextType>(() => ({
    patient: model.patient,
    proposal: model.proposal,
    riskSummary: model.riskSummary,
    timelineEvents: model.timelineEvents,
    selectedMedId,
    setSelectedMedId,
    selectedAlert,
    setSelectedAlert,
    currentTimeCursor,
    setCurrentTimeCursor,
    medications: model.medications,
    dose,
    setDose,
    doseUnit,
    setDoseUnit,
    route,
    setRoute,
    isOverridden,
    overrideReason,
    overrideComment,
    overrideTimestamp,
    isEvidenceOpen,
    setIsEvidenceOpen,
    isOverrideOpen,
    setIsOverrideOpen,
    isAddMedOpen,
    setIsAddMedOpen,
    alerts: model.alerts,
    medicationValues: model.recentValues,
    simulationSnapshot: snapshot,
    activeDemoAlert,
    originalProposedDose: simulationProposal?.dose ?? null,
    handleSelectMedication,
    handleSelectAlert,
    handleModifyDose,
    handleAuthorizeOverride,
    handleContinueWithoutDecision,
    handleAddMedication,
  }), [
    model, selectedMedId, selectedAlert, currentTimeCursor, setCurrentTimeCursor,
    dose, doseUnit, route,
    isOverridden, overrideReason, overrideComment, overrideTimestamp,
    isEvidenceOpen, isOverrideOpen, isAddMedOpen, snapshot, activeDemoAlert,
    simulationProposal, handleSelectMedication, handleSelectAlert, handleModifyDose,
    handleAuthorizeOverride, handleContinueWithoutDecision, handleAddMedication,
  ]);

  return <MedicationContext.Provider value={value}>{children}</MedicationContext.Provider>;
}

export function useMedication() {
  const context = useContext(MedicationContext);
  if (!context) throw new Error("useMedication must be used within a MedicationProvider");
  return context;
}

function displaySimulationTime(snapshot: SimulationSnapshot, time: number): string {
  return formatCaseTime(snapshot.encounter.startedAt, time);
}

function elapsedForTime(time: string, startedAt: string, durationMs: number): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time.trim());
  if (!match) return 0;
  const startMatch = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(startedAt);
  const startSeconds = startMatch ? Number(startMatch[1]) * 3_600 + Number(startMatch[2]) * 60 + Number(startMatch[3] ?? 0) : 0;
  const targetSeconds = Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
  return Math.max(0, Math.min(durationMs, (targetSeconds - startSeconds + 86_400) % 86_400 * 1_000));
}
