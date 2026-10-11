import type { SimulationEvent } from "../types/events";

/** Stable event-time ordering with recorded-time gating to prevent early record leakage. */
export class EventQueue<TPayload = unknown> {
  private readonly orderedEvents: SimulationEvent<TPayload>[];
  private cursor = 0;

  constructor(events: readonly SimulationEvent<TPayload>[]) {
    this.orderedEvents = [...events].sort(compareEvents);
  }

  add(event: SimulationEvent<TPayload>): void {
    const lastProcessed = this.orderedEvents[this.cursor - 1];
    if (lastProcessed && compareEvents(event, lastProcessed) < 0) {
      throw new RangeError("Cannot enqueue an event before an event that has already been processed.");
    }

    let index = this.cursor;
    while (index < this.orderedEvents.length && compareEvents(this.orderedEvents[index], event) <= 0) index += 1;
    this.orderedEvents.splice(index, 0, event);
  }

  get pendingCount(): number {
    return this.orderedEvents.length - this.cursor;
  }

  readThrough(simulationTime: number): SimulationEvent<TPayload>[] {
    assertTime(simulationTime);
    const start = this.cursor;
    while (
      this.cursor < this.orderedEvents.length &&
      this.orderedEvents[this.cursor].eventTime <= simulationTime &&
      (this.orderedEvents[this.cursor].recordedTime ?? this.orderedEvents[this.cursor].eventTime) <= simulationTime
    ) {
      this.cursor += 1;
    }
    return this.orderedEvents.slice(start, this.cursor);
  }

  reset(): void {
    this.cursor = 0;
  }

}

function compareEvents<TPayload>(
  left: SimulationEvent<TPayload>,
  right: SimulationEvent<TPayload>
): number {
  return (
    left.eventTime - right.eventTime ||
    (left.recordedTime ?? left.eventTime) - (right.recordedTime ?? right.eventTime) ||
    left.id.localeCompare(right.id)
  );
}

function assertTime(time: number): void {
  if (!Number.isFinite(time) || time < 0) {
    throw new RangeError("Simulation time must be a finite non-negative elapsed time.");
  }
}
