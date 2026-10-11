"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ClinicalEvent,
  ClinicalClaim,
  ProvenanceStatus,
  ReviewStatus,
  RejectionReason,
  PatientDemographics,
  CaseErrorMetrics,
} from "@/types/uc02";
import { adaptUc02 } from "@/simulation/adapters/uc02Adapter";
import { formatCaseTime } from "@/simulation/formatTime";
import { useSimulationReplay } from "@/context/SimulationReplayContext";
import { useTranslation } from "@/context/LocalizationContext";
import type { SimulationEvent } from "@/simulation";

export interface ValidationGateStat {
  pass: number;
  total: number;
}

export interface ClinicalReviewContextType {
  events: ClinicalEvent[];
  claims: Record<string, ClinicalClaim>;
  patient: PatientDemographics;
  errorMetrics: CaseErrorMetrics;
  selectedTime: string;
  selectedEventId: string | null;
  selectedClaimId: string | null;
  selectedEvent: ClinicalEvent | null;
  selectedClaim: ClinicalClaim | null;
  hoveredEvent: ClinicalEvent | null;
  linkedEventIds: string[];
  linkedClaimIds: string[];
  selectTime: (time: string) => void;
  selectClaim: (claimId: string | null) => void;
  selectEvent: (eventId: string | null) => void;
  setHoveredEvent: (evt: ClinicalEvent | null) => void;
  acceptClaim: (claimId: string) => void;
  editClaim: (
    claimId: string,
    updates: { text?: string; time?: { start: string; end?: string }; terminology?: string }
  ) => void;
  rejectClaim: (claimId: string, reason: RejectionReason) => void;
  setRequiresReview: (claimId: string) => void;
  confirmCausalityForClaim: (claimId: string, targetEventId?: string) => void;
  totalClaimsCount: number;
  acceptedClaimsCount: number;
  editedClaimsCount: number;
  rejectedClaimsCount: number;
  requiresReviewClaimsCount: number;
  unreviewedClaimsCount: number;
  reviewProgressPercent: number;
  provenanceCounts: {
    DIRECT: number;
    DERIVED: number;
    INFERRED: number;
    CLINICIAN_CONFIRMED: number;
    REJECTED: number;
  };
  validationGateCounts: {
    numeric: ValidationGateStat;
    unit: ValidationGateStat;
    temporal: ValidationGateStat;
    evidence: ValidationGateStat;
    terminology: ValidationGateStat;
  };
  blockingUnsupportedClaims: number;
  blockingValidationErrors: number;
  totalBlockingIssues: number;
  canSignRecord: boolean;
  isRecordSigned: boolean;
  signedTimestamp: string | null;
  signRecord: () => void;
  timelineStartTime: string;
  timelineDurationMs: number;
  simulationTime: number;
  timelineTrackValues: Record<string, { value: string; status: string }>;
  canonicalEventCount: number;
  clinicalEpisodeCount: number;
}

const ClinicalReviewContext = createContext<ClinicalReviewContextType | undefined>(undefined);

export function ClinicalReviewProvider({ children }: { children: React.ReactNode }) {
  const { engine, snapshot } = useSimulationReplay();
  const { locale } = useTranslation("uc02");
  const projection = useMemo(() => adaptUc02(snapshot, locale), [snapshot, locale]);
  const actionSequence = useRef(0);
  const events = projection.events;
  const patient = projection.patient;
  const errorMetrics = projection.errorMetrics;
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<ClinicalEvent | null>(null);

  const claims = useMemo(() => Object.fromEntries(
    projection.claims.map((claim) => [claim.id, claim]),
  ), [projection]);
  const selectedTime = formatCaseTime(snapshot.encounter.startedAt, snapshot.simulationTime).slice(0, 5);

  const selectedEvent = useMemo(() =>
    selectedEventId ? events.find((event) => event.id === selectedEventId) ?? null : null,
  [events, selectedEventId]);
  const selectedClaim = useMemo(() => selectedClaimId ? claims[selectedClaimId] ?? null : null, [claims, selectedClaimId]);
  const linkedEventIds = useMemo(() => selectedClaim
    ? selectedClaim.evidenceRefs.filter((eventId) => events.some((event) => event.id === eventId))
    : [], [events, selectedClaim]);
  const linkedClaimIds = useMemo(() => selectedEventId
    ? Object.values(claims).filter((claim) => claim.evidenceRefs.includes(selectedEventId)).map((claim) => claim.id)
    : [], [claims, selectedEventId]);

  const selectTime = useCallback((time: string) => {
    if (!engine || !snapshot) return;
    engine.seek(elapsedForTime(time, snapshot.encounter.startedAt, snapshot.encounter.scheduledDurationMs));
  }, [engine, snapshot]);

  const dispatchReviewEvent = useCallback((eventType: string, payload: Record<string, unknown>) => {
    if (!engine) return;
    const eventTime = engine.simulationTime;
    let id: string;
    do {
      actionSequence.current += 1;
      id = `record-review-${Math.trunc(eventTime)}-${actionSequence.current}`;
    } while (engine.hasEvent(id));
    const event: SimulationEvent<Record<string, unknown>> = {
      id,
      eventTime,
      recordedTime: eventTime,
      source: "uc02-clinician-review",
      sourceType: "MANUAL",
      eventType,
      payload: { ...payload, synthetic: true, clinicalUse: false },
      provenance: "CLINICIAN_CONFIRMED",
    };
    engine.dispatchEvent(event);
  }, [engine]);

  const selectClaim = useCallback((claimId: string | null) => {
    setSelectedClaimId(claimId);
    if (!claimId || !snapshot || !engine) return;
    const claim = snapshot.recordClaims.find((candidate) => candidate.id === claimId);
    if (!claim) return;
    const referenced = claim.eventRefs
      .map((eventId) => snapshot.events.find((event) => event.id === eventId))
      .filter((event): event is NonNullable<typeof event> => Boolean(event));
    const firstEvidenceEvent = referenced[0];
    if (firstEvidenceEvent) setSelectedEventId(firstEvidenceEvent.id);
    const claimEnd = claim.endTime ?? claim.eventTime;
    const latestRecordTime = Math.max(
      claim.eventTime,
      claimEnd,
      ...referenced.map((event) => event.recordedTime ?? event.eventTime),
    );
    engine.seek(latestRecordTime);
  }, [engine, snapshot]);

  const selectEvent = useCallback((eventId: string | null) => {
    setSelectedEventId(eventId);
    if (!eventId || !snapshot || !engine) return;
    const sourceEvent = snapshot.events.find((event) => event.id === eventId);
    if (!sourceEvent) return;
    const matchingClaim = Object.values(claims).find((claim) => claim.evidenceRefs.includes(eventId));
    if (matchingClaim) setSelectedClaimId(matchingClaim.id);
    engine.seek(Math.max(sourceEvent.eventTime, sourceEvent.recordedTime ?? sourceEvent.eventTime));
  }, [claims, engine, snapshot]);

  useEffect(() => {
    if (selectedClaimId && !claims[selectedClaimId]) setSelectedClaimId(null);
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) setSelectedEventId(null);
  }, [claims, events, selectedClaimId, selectedEventId]);

  const acceptClaim = useCallback((claimId: string) => {
    if (claims[claimId]) dispatchReviewEvent("RECORD_CLAIM_ACCEPTED", { claimId });
  }, [claims, dispatchReviewEvent]);

  const editClaim = useCallback((claimId: string, updates: {
    text?: string;
    time?: { start: string; end?: string };
    terminology?: string;
  }) => {
    const claim = claims[claimId];
    if (!claim) return;
    const clinicalTime = updates.time
      ? {
          start: elapsedForTime(updates.time.start, snapshot?.encounter.startedAt ?? "", snapshot?.encounter.scheduledDurationMs ?? 0),
          ...(updates.time.end ? { end: elapsedForTime(updates.time.end, snapshot?.encounter.startedAt ?? "", snapshot?.encounter.scheduledDurationMs ?? 0) } : {}),
        }
      : {
          start: elapsedForTime(claim.clinicalTime.start, snapshot?.encounter.startedAt ?? "", snapshot?.encounter.scheduledDurationMs ?? 0),
          ...(claim.clinicalTime.end ? { end: elapsedForTime(claim.clinicalTime.end, snapshot?.encounter.startedAt ?? "", snapshot?.encounter.scheduledDurationMs ?? 0) } : {}),
        };
    dispatchReviewEvent("RECORD_CLAIM_EDITED", {
      claimId,
      ...(updates.text === undefined ? {} : { text: updates.text }),
      ...(updates.terminology === undefined ? {} : { terminologyTerm: updates.terminology }),
      clinicalTime,
    });
  }, [claims, dispatchReviewEvent, snapshot]);

  const rejectClaim = useCallback((claimId: string, reason: RejectionReason) => {
    if (claims[claimId]) dispatchReviewEvent("RECORD_CLAIM_REJECTED", { claimId, reason });
  }, [claims, dispatchReviewEvent]);

  const setRequiresReview = useCallback((claimId: string) => {
    if (claims[claimId]) dispatchReviewEvent("RECORD_CLAIM_REQUIRES_REVIEW", { claimId });
  }, [claims, dispatchReviewEvent]);

  const confirmCausalityForClaim = useCallback((claimId: string, targetEventId?: string) => {
    const claim = claims[claimId];
    if (!claim || !snapshot) return;
    const medicationEventId = targetEventId ?? claim.evidenceRefs.find((eventId) => {
      const event = snapshot.events.find((candidate) => candidate.id === eventId);
      const payload = event?.payload as Record<string, unknown> | undefined;
      return event?.eventType === "MEDICATION_ADMINISTERED" && String(payload?.name ?? "").toLowerCase().includes("phenylephrine");
    });
    if (!medicationEventId) return;
    dispatchReviewEvent("RECORD_CAUSALITY_CONFIRMED", { claimId, targetEventId: medicationEventId });
  }, [claims, dispatchReviewEvent, snapshot]);

  const allClaims = useMemo(() => Object.values(claims), [claims]);
  const totalClaimsCount = allClaims.length;
  const countStatus = (status: ReviewStatus) => allClaims.filter((claim) => claim.reviewStatus === status).length;
  const acceptedClaimsCount = countStatus("ACCEPTED");
  const editedClaimsCount = countStatus("EDITED");
  const rejectedClaimsCount = countStatus("REJECTED");
  const requiresReviewClaimsCount = countStatus("REQUIRES_REVIEW");
  const unreviewedClaimsCount = countStatus("UNREVIEWED");
  const reviewProgressPercent = totalClaimsCount === 0 ? 0 : Math.round(
    ((acceptedClaimsCount + editedClaimsCount + rejectedClaimsCount) / totalClaimsCount) * 100,
  );

  const provenanceCounts = useMemo(() => {
    const counts = { DIRECT: 0, DERIVED: 0, INFERRED: 0, CLINICIAN_CONFIRMED: 0, REJECTED: 0 };
    for (const claim of allClaims) counts[claim.provenance] += 1;
    return counts;
  }, [allClaims]);

  const validationGateCounts = useMemo(() => {
    const fields = ["numeric", "unit", "temporal", "evidence", "terminology"] as const;
    return Object.fromEntries(fields.map((field) => [field, {
      pass: allClaims.filter((claim) => claim.validation[field]).length,
      total: totalClaimsCount,
    }])) as ClinicalReviewContextType["validationGateCounts"];
  }, [allClaims, totalClaimsCount]);

  const blockingUnsupportedClaims = allClaims.filter((claim) =>
    claim.reviewStatus !== "REJECTED" && !claim.validation.evidence,
  ).length;
  const blockingValidationErrors = allClaims.filter((claim) =>
    claim.reviewStatus !== "REJECTED" &&
    (!claim.validation.numeric || !claim.validation.unit || !claim.validation.temporal || !claim.validation.terminology),
  ).length;
  const totalBlockingIssues = allClaims.filter((claim) =>
    claim.reviewStatus !== "REJECTED" && (
      claim.reviewStatus === "REQUIRES_REVIEW" ||
      !claim.validation.evidence ||
      !claim.validation.numeric || !claim.validation.unit || !claim.validation.temporal || !claim.validation.terminology
    ),
  ).length;
  const signedEvent = snapshot?.events.find((event) => event.eventType === "RECORD_SIGNED");
  const isRecordSigned = Boolean(signedEvent);
  const signedTimestamp = signedEvent && snapshot
    ? formatCaseTime(snapshot.encounter.startedAt, signedEvent.eventTime)
    : null;
  const canSignRecord = totalBlockingIssues === 0 && !isRecordSigned && snapshot?.encounter.status === "COMPLETED";
  const signRecord = useCallback(() => {
    if (!canSignRecord) return;
    dispatchReviewEvent("RECORD_SIGNED", { caseId: snapshot?.encounter.caseId });
  }, [canSignRecord, dispatchReviewEvent, snapshot?.encounter.caseId]);

  const value: ClinicalReviewContextType = {
    events,
    claims,
    patient,
    errorMetrics,
    selectedTime,
    selectedEventId,
    selectedClaimId,
    selectedEvent,
    selectedClaim,
    hoveredEvent,
    linkedEventIds,
    linkedClaimIds,
    selectTime,
    selectClaim,
    selectEvent,
    setHoveredEvent,
    acceptClaim,
    editClaim,
    rejectClaim,
    setRequiresReview,
    confirmCausalityForClaim,
    totalClaimsCount,
    acceptedClaimsCount,
    editedClaimsCount,
    rejectedClaimsCount,
    requiresReviewClaimsCount,
    unreviewedClaimsCount,
    reviewProgressPercent,
    provenanceCounts,
    validationGateCounts,
    blockingUnsupportedClaims,
    blockingValidationErrors,
    totalBlockingIssues,
    canSignRecord,
    isRecordSigned,
    signedTimestamp,
    signRecord,
    timelineStartTime: projection.timelineStartTime,
    timelineDurationMs: projection.timelineDurationMs,
    simulationTime: projection.simulationTime,
    timelineTrackValues: projection.timelineTrackValues,
    canonicalEventCount: projection.canonicalEventCount,
    clinicalEpisodeCount: projection.clinicalEpisodeCount,
  };

  return <ClinicalReviewContext.Provider value={value}>{children}</ClinicalReviewContext.Provider>;
}

export function useClinicalReview() {
  const context = useContext(ClinicalReviewContext);
  if (!context) throw new Error("useClinicalReview must be used within a ClinicalReviewProvider");
  return context;
}

function elapsedForTime(time: string, startedAt: string, durationMs: number): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(time.trim());
  if (!match) return 0;
  const startMatch = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(startedAt);
  const startSeconds = startMatch ? Number(startMatch[1]) * 3_600 + Number(startMatch[2]) * 60 + Number(startMatch[3] ?? 0) : 0;
  const targetSeconds = Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
  const deltaSeconds = targetSeconds - startSeconds;
  return Math.min(durationMs, Math.max(0, deltaSeconds * 1_000));
}
