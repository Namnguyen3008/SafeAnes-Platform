import type { RecordClaim, RecordClaimValidation } from "../types/claims";
import type { SimulationEvent } from "../types/events";

export const TEMPORAL_RELATIONSHIPS = [
  "BEFORE",
  "AFTER",
  "OVERLAPS",
  "DURING",
  "STARTS_WITHIN",
  "ENDS_WITHIN",
  "CO_OCCURS_WITH",
] as const;

export type TemporalRelationship = (typeof TEMPORAL_RELATIONSHIPS)[number];

type TimedEvent = SimulationEvent & { endTime?: number };

/** Relates two canonical events in time only; this function never infers causality. */
export function getTemporalRelationship(
  event: TimedEvent,
  relatedEvent: TimedEvent,
  visibleEvents: readonly TimedEvent[] = [event, relatedEvent],
): TemporalRelationship {
  const left = getEventInterval(event, visibleEvents);
  const right = getEventInterval(relatedEvent, visibleEvents);

  if (left.end < right.start) return "BEFORE";
  if (left.start > right.end) return "AFTER";

  const leftHasDuration = left.end > left.start;
  const rightHasDuration = right.end > right.start;
  if (!leftHasDuration && !rightHasDuration) {
    return left.start === right.start ? "CO_OCCURS_WITH" : left.start < right.start ? "BEFORE" : "AFTER";
  }

  if (left.start === right.start && left.end === right.end) return "CO_OCCURS_WITH";
  if (left.start >= right.start && left.end <= right.end) {
    if (left.start === right.start) return "STARTS_WITHIN";
    if (left.end === right.end) return "ENDS_WITHIN";
    return "DURING";
  }
  if (left.start < right.start && left.end > right.end) return "OVERLAPS";
  if (left.start < right.start && left.end > right.start) return "OVERLAPS";
  if (left.start < right.end && left.end > right.end) return "OVERLAPS";
  if (!leftHasDuration && left.start === right.start) return "STARTS_WITHIN";
  if (!leftHasDuration && left.start === right.end) return "ENDS_WITHIN";
  if (!leftHasDuration && left.start > right.start && left.start < right.end) return "DURING";
  return "OVERLAPS";
}

/** Deterministic template validator for the synthetic UC02 record. */
export function validateRecordClaim(
  claim: RecordClaim,
  visibleEvents: readonly SimulationEvent[],
  caseStartedAt: string,
): RecordClaimValidation {
  const eventsById = new Map(visibleEvents.map((event) => [event.id, event]));
  const linkedEvents = claim.eventRefs.map((eventId) => eventsById.get(eventId)).filter(isDefined);
  const evidenceText = [
    ...claim.evidenceRefs.map((reference) => `${reference.id} ${reference.source} ${reference.value ?? ""}`),
    ...linkedEvents.map((event) => `${event.id} ${event.eventType} ${event.source} ${stableText(event.payload)}`),
  ].join(" ").toLowerCase();
  const claimText = claim.text.toLowerCase();

  const textNumbers = extractNumbers(claim.text);
  const evidenceNumbers = new Set(extractNumbers(evidenceText));
  const number = textNumbers.every((value) => evidenceNumbers.has(value));

  const requiredUnits = extractUnits(claim.text);
  const evidenceUnits = new Set(extractUnits(evidenceText));
  const unit = requiredUnits.every((value) => evidenceUnits.has(value));

  const doseMentions = [...claim.text.matchAll(/(\d+(?:\.\d+)?)\s*(mcg|µg|μg|mg|g|ml|mL)\b/gi)];
  const dose = doseMentions.every((match) => {
    const amount = Number(match[1]);
    const normalizedUnit = normalizeUnit(match[2]);
    return linkedEvents.some((event) => {
      const payload = objectPayload(event.payload);
      return typeof payload.dose === "number" && payload.dose === amount &&
        typeof payload.doseUnit === "string" && normalizeUnit(payload.doseUnit) === normalizedUnit;
    });
  });

  const clinicalStart = claim.clinicalTime?.start ?? claim.eventTime;
  const clinicalEnd = claim.clinicalTime?.end ?? claim.endTime;
  const timestamp = clinicalStart === claim.eventTime && clinicalEnd === claim.endTime &&
    linkedEvents.some((event) => event.eventTime === clinicalStart) &&
    [...claim.text.matchAll(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g)]
      .map((match) => match[0].slice(0, 5))
      .every((time) => time === formatAt(caseStartedAt, clinicalStart).slice(0, 5) ||
        (clinicalEnd !== undefined && time === formatAt(caseStartedAt, clinicalEnd).slice(0, 5)));

  const interval = clinicalEnd === undefined
    ? claim.endTime === undefined && linkedEvents.length > 0
    : claim.endTime === clinicalEnd &&
      linkedEvents.some((event) => event.eventTime === clinicalStart) &&
      linkedEvents.some((event) => event.eventTime === clinicalEnd);

  const entity = matchesEntity(claim.entityId, claim.conceptId, claimText, evidenceText, linkedEvents);
  const referencedEventIds = new Set([
    ...claim.eventRefs,
    ...claim.evidenceRefs.flatMap((reference) => reference.relatedEventIds ?? []),
  ]);
  const evidenceIds = new Set(claim.evidenceRefs.map((reference) => reference.id));
  const evidenceId = claim.evidenceRefs.length > 0 &&
    evidenceIds.size === claim.evidenceRefs.length &&
    claim.evidenceRefs.every((reference) => reference.id.trim().length > 0) &&
    [...referencedEventIds].every((eventId) => eventsById.has(eventId));
  const conceptIdentity = matchesConcept(claim.conceptId, linkedEvents);

  return { number, unit, dose, timestamp, interval, entity, evidenceId, conceptIdentity };
}

export function getExplicitTemporalRelationship(
  event: SimulationEvent,
  relatedEventId: string,
): TemporalRelationship | undefined {
  const payload = objectPayload(event.payload);
  const relation = objectPayload(payload.temporalRelation);
  if (relation.relatedEventId !== relatedEventId) return undefined;
  return TEMPORAL_RELATIONSHIPS.includes(relation.relationship as TemporalRelationship)
    ? relation.relationship as TemporalRelationship
    : undefined;
}

function getEventInterval(event: TimedEvent, visibleEvents: readonly TimedEvent[]) {
  const payload = objectPayload(event.payload);
  const explicitStart = typeof payload.intervalStart === "number" ? payload.intervalStart : event.eventTime;
  const explicitEnd = typeof payload.intervalEnd === "number" ? payload.intervalEnd : event.endTime;
  const episodeId = typeof payload.episodeId === "string" ? payload.episodeId : undefined;
  const signal = typeof payload.signal === "string" ? payload.signal : undefined;

  const counterpart = visibleEvents.find((candidate) => {
    if (candidate.id === event.id) return false;
    const other = objectPayload(candidate.payload);
    const sameEpisode = episodeId && other.episodeId === episodeId &&
      ((event.eventType === "EPISODE_DETECTED" && candidate.eventType === "EPISODE_RESOLVED") ||
        (event.eventType === "EPISODE_RESOLVED" && candidate.eventType === "EPISODE_DETECTED"));
    const sameQualityInterval = signal && other.signal === signal && candidate.source === event.source &&
      ((event.eventType === "SIGNAL_QUALITY_CHANGED" && ["SIGNAL_QUALITY_RESTORED", "DEVICE_LATENCY_RECOVERED"].includes(candidate.eventType)) ||
        (["SIGNAL_QUALITY_RESTORED", "DEVICE_LATENCY_RECOVERED"].includes(event.eventType) && candidate.eventType === "SIGNAL_QUALITY_CHANGED"));
    return Boolean(sameEpisode || sameQualityInterval);
  });

  const start = event.eventType === "EPISODE_RESOLVED" ||
    event.eventType === "SIGNAL_QUALITY_RESTORED" || event.eventType === "DEVICE_LATENCY_RECOVERED"
    ? counterpart?.eventTime ?? event.eventTime
    : explicitStart;
  const end = event.eventType === "EPISODE_DETECTED" || event.eventType === "SIGNAL_QUALITY_CHANGED" || event.eventType === "DEVICE_LATENCY_INCREASED"
    ? counterpart?.eventTime ?? event.endTime ?? event.eventTime
    : explicitEnd ?? event.eventTime;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function matchesEntity(
  entityId: string | undefined,
  conceptId: string | undefined,
  claimText: string,
  evidenceText: string,
  linkedEvents: readonly SimulationEvent[],
): boolean {
  if (!entityId) return false;
  const content = `${claimText} ${evidenceText} ${linkedEvents.map((event) => event.id).join(" ")}`.toLowerCase();
  switch (conceptId) {
    case "MEDICATION_ADMINISTRATION":
      return content.includes("phenylephrine") && linkedEvents.some((event) => event.eventType === "MEDICATION_ADMINISTERED");
    case "HEMODYNAMIC_LOW_MAP_EPISODE":
      return /\bmap\b|mapmmhg/.test(content) && linkedEvents.some((event) => event.eventType === "EPISODE_DETECTED");
    case "RESPIRATORY_NO_BREATH_INTERVAL":
      return /no.?breath|respiratory-no-breath|capnogram/.test(content) && linkedEvents.some((event) => event.eventType === "EPISODE_DETECTED");
    case "HEMODYNAMIC_RESPONSE_ASSOCIATION":
      return content.includes("phenylephrine") && /hemodynamic|hypotension|map/.test(content) &&
        linkedEvents.some((event) => event.eventType === "MEDICATION_ADMINISTERED") &&
        linkedEvents.some((event) => event.eventType === "EPISODE_DETECTED");
    default:
      return false;
  }
}

function matchesConcept(conceptId: string | undefined, linkedEvents: readonly SimulationEvent[]): boolean {
  if (!conceptId || linkedEvents.length === 0) return false;
  const types = new Set(linkedEvents.map((event) => event.eventType));
  switch (conceptId) {
    case "MEDICATION_ADMINISTRATION":
      return types.has("MEDICATION_ADMINISTERED");
    case "HEMODYNAMIC_LOW_MAP_EPISODE":
      return types.has("EPISODE_DETECTED") && types.has("EPISODE_RESOLVED") &&
        linkedEvents.some((event) => event.id.includes("hemodynamic-low-map"));
    case "RESPIRATORY_NO_BREATH_INTERVAL":
      return types.has("EPISODE_DETECTED") && types.has("EPISODE_RESOLVED") &&
        linkedEvents.some((event) => event.id.includes("respiratory-no-breath"));
    case "HEMODYNAMIC_RESPONSE_ASSOCIATION":
      return types.has("MEDICATION_ADMINISTERED") && types.has("EPISODE_DETECTED") && types.has("EPISODE_RESOLVED");
    default:
      return false;
  }
}

function extractNumbers(value: string): string[] {
  return value
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .match(/\b\d+(?:\.\d+)?\b/g)?.map((number) => String(Number(number))) ?? [];
}

function extractUnits(value: string): string[] {
  const units = value.match(/µg|μg|mcg|mg|mmHg|bpm|L\/min\/m²|mL\/beat|%|dyn·s\/cm⁵|\/min/gi) ?? [];
  return units.map(normalizeUnit);
}

function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().replaceAll("μ", "µ");
  if (normalized === "mcg" || normalized === "µg") return "µg";
  if (normalized === "ml") return "ml";
  return normalized;
}

function stableText(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value ?? "");
  return Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${key}:${stableText(nested)}`)
    .join(" ");
}

function objectPayload(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function formatAt(startedAt: string, elapsedMs: number): string {
  const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(startedAt);
  const baseSeconds = match ? Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0) : 0;
  const total = (baseSeconds + Math.floor(elapsedMs / 1_000)) % 86_400;
  return `${Math.floor(total / 3_600).toString().padStart(2, "0")}:${Math.floor(total % 3_600 / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
