/**
 * SafeAnes — UC02 Anaesthesia Record Review & Clinical Provenance
 * Core Domain Types
 */

export type ProvenanceStatus =
  | "DIRECT"
  | "DERIVED"
  | "INFERRED"
  | "CLINICIAN_CONFIRMED"
  | "REJECTED";

export type ReviewStatus =
  | "UNREVIEWED"
  | "ACCEPTED"
  | "EDITED"
  | "REJECTED"
  | "REQUIRES_REVIEW";

export type RejectionReason =
  | "Unsupported by evidence"
  | "Incorrect value"
  | "Incorrect time"
  | "Incorrect terminology"
  | "Incorrect interpretation"
  | "Duplicate"
  | "Other";

export type RecordSectionId =
  | "patient_context"
  | "pre_induction"
  | "induction"
  | "airway"
  | "maintenance"
  | "ventilation"
  | "hemodynamics"
  | "medications"
  | "fluids_blood"
  | "procedures"
  | "major_events"
  | "emergence"
  | "recovery_transfer";

export type EventTrackId =
  | "physiology"
  | "medication"
  | "airway_procedure"
  | "ventilation"
  | "fluid_blood"
  | "data_quality";

export type EventVisualSemantics =
  | "point_marker"
  | "interval_band"
  | "med_bolus"
  | "infusion"
  | "data_quality_hatched";

export type TemporalRelationType =
  | "BEFORE"
  | "AFTER"
  | "OVERLAPS"
  | "DURING"
  | "STARTS_WITHIN"
  | "ENDS_WITHIN"
  | "CO_OCCURS_WITH";

export interface TemporalLink {
  targetEventId: string;
  relation: TemporalRelationType;
  clinicianConfirmedCausality?: boolean;
  causalType?: "TREATED_BY" | "CAUSED_BY" | "INDICATED_FOR";
}

export type ClinicalEvent = {
  id: string;
  type: string;
  name?: string;
  subText?: string;
  startTime: string; // "HH:MM"
  endTime?: string;
  evidenceRefs: string[];
  quality?: string;
  trackId: EventTrackId;
  visualType: EventVisualSemantics;
  semanticColor: string;
  doseOrValue?: string;
  sourceDevice?: string;
  temporalRelations?: TemporalLink[];
  notes?: string;
  eventTime?: number;
  recordedTime?: number;
  provenance?: ProvenanceStatus;
};

export type ObservationDetail = {
  time: string;
  value: string;
  sensor: string;
};

export type DeviceQualityDetail = {
  device: string;
  signalQuality: string;
  clockUncertainty: string;
};

export type RelatedEventLink = {
  targetEventId?: string;
  name: string;
  dose?: string;
  time: string;
  relationship: TemporalRelationType | string;
  clinicianConfirmedCausality?: boolean;
};

export type ClinicalClaim = {
  id: string;
  section: RecordSectionId;
  propositionType: string;
  text: string;
  clinicalTime: {
    start: string;
    end?: string;
  };
  evidenceRefs: string[];
  provenance: ProvenanceStatus;
  reviewStatus: ReviewStatus;
  validation: {
    numeric: boolean;
    unit: boolean;
    temporal: boolean;
    evidence: boolean;
    terminology: boolean;
  };
  rejectionReason?: RejectionReason;
  fieldPath?: string;
  ruleId?: string;
  softwareVersion?: string;
  sourceStream?: string;
  confidence?: number;
  terminologyTerm?: string;
  conceptId?: string;
  entityId?: string;
  derivation?: {
    method: string;
    description: string;
    sourceEventTypes: string[];
    threshold?: { value: number; unit: string; label: string };
  };
  validationDetails?: {
    number: boolean;
    unit: boolean;
    dose: boolean;
    timestamp: boolean;
    interval: boolean;
    entity: boolean;
    evidenceId: boolean;
    conceptIdentity: boolean;
  };
  evidenceDetails?: Array<{
    id: string;
    source: string;
    sourceType: "DEVICE" | "MANUAL" | "SYSTEM";
    eventTime: number;
    clinicalTime?: string;
    value?: string;
    relatedEventIds?: string[];
  }>;
  duration?: string;
  observations?: ObservationDetail[];
  deviceQuality?: DeviceQualityDetail[];
  relatedEvents?: RelatedEventLink[];
};

export interface PatientDemographics {
  ageSex: string;
  allergies: string;
  weightBmi: string;
  comorbidities: string;
  asaStatus: string;
  preopMap: string;
  procedure: string;
  baselineCi: string;
  anesthesia: string;
  fluidStatus: string;
  orNumber: string;
  caseId: string;
}

export interface CaseErrorMetrics {
  unsupportedClaims: number;
  omittedFacts: number | null;
  temporalErrors: number;
  wrongValues: number;
  terminologyIssues: number;
  provenanceIssues: number;
}

export interface BenchmarkMetrics {
  mode: "Template" | "LLM" | "Hybrid";
  unsupported: number;
  omissions: number;
  description: string;
}
