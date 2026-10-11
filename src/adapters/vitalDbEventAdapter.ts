export type VitalDbEventKind = "OBSERVED" | "DERIVED";

export interface VitalDbEventInput {
  id?: string;
  timestamp: number;
  available_at_s?: number;
  end_time_s?: number;
  event_type?: string;
  description?: string;
  definition?: string;
  source?: string;
  source_class?: string;
  quality?: string;
}

export interface VitalDbEventRow extends VitalDbEventInput {
  id: string;
  timestamp: number;
  availableAt: number;
  kind: VitalDbEventKind;
}

/**
 * Combines the same recorded EVENT track as exposed by UC04 and UC05 into one
 * timeline row. UC05 carries the stable VitalDB annotation ID and provenance,
 * so it wins when the annotation also appears in UC04's projection.
 */
export function mergeVitalDbEvents(
  uc04Events: readonly VitalDbEventInput[],
  recordedEvents: readonly VitalDbEventInput[],
  derivedEvents: readonly VitalDbEventInput[],
  asOfSeconds: number,
): VitalDbEventRow[] {
  const unique = new Map<string, VitalDbEventRow>();
  const inputs: Array<{ event: VitalDbEventInput; kind: VitalDbEventKind }> = [
    ...recordedEvents.map((event) => ({ event, kind: "OBSERVED" as const })),
    ...derivedEvents.map((event) => ({ event, kind: "DERIVED" as const })),
    ...uc04Events.map((event) => ({ event, kind: "OBSERVED" as const })),
  ];

  for (const { event, kind } of inputs) {
    const timestamp = Number(event.timestamp);
    const availableAt = Number(event.available_at_s ?? event.end_time_s ?? timestamp);
    if (!Number.isFinite(timestamp) || !Number.isFinite(availableAt) || availableAt > asOfSeconds) continue;

    const description = normalizeIdentity(event.description ?? event.event_type ?? "");
    const identity = `${kind}:${timestamp.toFixed(3)}:${description || normalizeIdentity(event.event_type ?? "")}`;
    if (unique.has(identity)) continue;

    unique.set(identity, {
      ...event,
      id: String(event.id ?? `vitaldb-${kind.toLowerCase()}-${timestamp.toFixed(3)}-${description || "event"}`),
      timestamp,
      availableAt,
      kind,
    });
  }

  return [...unique.values()].sort((left, right) => left.availableAt - right.availableAt ||
    left.timestamp - right.timestamp || (left.kind === right.kind ? 0 : left.kind === "OBSERVED" ? -1 : 1) ||
    left.id.localeCompare(right.id));
}

function normalizeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}
