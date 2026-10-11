import type { EventProvenance } from "./events";

export interface EvidenceReference {
  id: string;
  source: string;
  sourceType: "DEVICE" | "MANUAL" | "SYSTEM";
  eventTime: number;
  value?: string;
  relatedEventIds?: string[];
}

export type RecordClaimValidation = {
  number: boolean;
  unit: boolean;
  dose: boolean;
  timestamp: boolean;
  interval: boolean;
  entity: boolean;
  evidenceId: boolean;
  conceptIdentity: boolean;
};

export interface ClaimDerivation {
  method:
    | "DIRECT_EVENT_TEMPLATE"
    | "THRESHOLD_INTERVAL"
    | "EVENT_INTERVAL"
    | "TEMPORAL_ASSOCIATION_REQUIRES_REVIEW";
  description: string;
  sourceEventTypes: string[];
  threshold?: { value: number; unit: string; label: string };
}

export interface RecordClaim {
  id: string;
  section: "AIRWAY" | "VENTILATION" | "HEMODYNAMICS" | "MEDICATIONS" | "WORKFLOW";
  text: string;
  localizedText?: Partial<Record<"en" | "vi", string>>;
  eventTime: number;
  endTime?: number;
  /** Case-relative clinical interval; eventTime/endTime remain the indexing fields. */
  clinicalTime?: { start: number; end?: number };
  eventRefs: string[];
  evidenceRefs: EvidenceReference[];
  conceptId?: string;
  entityId?: string;
  derivation?: ClaimDerivation;
  validation?: RecordClaimValidation;
  provenance: EventProvenance | "REJECTED";
  reviewStatus: "UNREVIEWED" | "REQUIRES_REVIEW" | "ACCEPTED" | "EDITED" | "REJECTED";
  /** Explicit clinician review state, persisted as canonical record-review events. */
  rejectionReason?: string;
  terminologyTerm?: string;
  causalityConfirmation?: { targetEventId: string; confirmedAt: number };
  interpretationLimit?: string;
}
