import {
  SIMULATION_SPEEDS,
  type SimulationClockSnapshot,
  type SimulationClockStatus,
  type SimulationSpeed,
} from "../types/replay";

export interface SimulationClockOptions {
  durationMs: number;
  initialTime?: number;
  speed?: SimulationSpeed;
}

type ClockListener = (snapshot: SimulationClockSnapshot) => void;

/** Deterministic case-time state machine. A host supplies real elapsed time through advanceRealTime(). */
export class SimulationClock {
  private currentTime: number;
  private currentStatus: SimulationClockStatus = "STOPPED";
  private currentSpeed: SimulationSpeed;
  private readonly durationMs: number;
  private readonly listeners = new Set<ClockListener>();

  constructor(options: SimulationClockOptions);
  constructor(initialTime?: number, durationMs?: number);
  constructor(optionsOrInitialTime: SimulationClockOptions | number = 0, legacyDurationMs = Number.MAX_SAFE_INTEGER) {
    const options = typeof optionsOrInitialTime === "number"
      ? { initialTime: optionsOrInitialTime, durationMs: legacyDurationMs }
      : optionsOrInitialTime;
    const durationMs = options.durationMs;
    const initialTime = options.initialTime ?? 0;
    const speed = options.speed ?? 1;

    assertTime(durationMs, "durationMs");
    assertTime(initialTime, "initialTime");
    assertSpeed(speed);

    this.durationMs = durationMs;
    this.currentTime = Math.min(initialTime, durationMs);
    this.currentSpeed = speed;
    if (this.currentTime === this.durationMs) this.currentStatus = "COMPLETED";
  }

  get status(): SimulationClockStatus {
    return this.currentStatus;
  }

  get simulationTime(): number {
    return this.currentTime;
  }

  get duration(): number {
    return this.durationMs;
  }

  get speed(): SimulationSpeed {
    return this.currentSpeed;
  }

  getSnapshot(): SimulationClockSnapshot {
    return {
      status: this.currentStatus,
      simulationTime: this.currentTime,
      durationMs: this.durationMs,
      speed: this.currentSpeed,
      progress: this.durationMs === 0 ? 1 : this.currentTime / this.durationMs,
    };
  }

  subscribe(listener: ClockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(): void {
    if (this.currentTime >= this.durationMs) {
      this.complete();
      return;
    }
    if (this.currentStatus !== "PLAYING") {
      this.currentStatus = "PLAYING";
      this.notify();
    }
  }

  pause(): void {
    if (this.currentStatus === "PLAYING") {
      this.currentStatus = "PAUSED";
      this.notify();
    }
  }

  resume(): void {
    if (this.currentStatus === "PAUSED") this.play();
  }

  reset(): void {
    this.currentTime = 0;
    this.currentStatus = "STOPPED";
    this.currentSpeed = 1;
    this.notify();
  }

  seek(targetTime: number): number {
    assertTime(targetTime, "targetTime");
    const previousStatus = this.currentStatus;
    this.currentTime = Math.min(targetTime, this.durationMs);

    if (this.currentTime >= this.durationMs) {
      this.currentStatus = "COMPLETED";
    } else if (previousStatus === "COMPLETED") {
      this.currentStatus = "PAUSED";
    }

    this.notify();
    return this.currentTime;
  }

  setSpeed(speed: number): void {
    assertSpeed(speed);
    if (this.currentSpeed !== speed) {
      this.currentSpeed = speed;
      this.notify();
    }
  }

  /** Advances case time by elapsed real time only while PLAYING. */
  advanceRealTime(realElapsedMs: number): number {
    assertTime(realElapsedMs, "realElapsedMs");
    if (this.currentStatus !== "PLAYING" || realElapsedMs === 0) return this.currentTime;

    this.currentTime = Math.min(
      this.durationMs,
      Math.round(this.currentTime + realElapsedMs * this.currentSpeed)
    );
    if (this.currentTime >= this.durationMs) this.currentStatus = "COMPLETED";
    this.notify();
    return this.currentTime;
  }

  /** Direct case-time advancement retained for deterministic engine coordination. */
  advanceBy(caseElapsedMs: number): number {
    assertTime(caseElapsedMs, "caseElapsedMs");
    return this.seek(this.currentTime + caseElapsedMs);
  }

  private complete(): void {
    this.currentTime = this.durationMs;
    this.currentStatus = "COMPLETED";
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) listener(snapshot);
  }
}

function assertTime(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative elapsed time.`);
  }
}

function assertSpeed(value: number): asserts value is SimulationSpeed {
  if (!SIMULATION_SPEEDS.includes(value as SimulationSpeed)) {
    throw new RangeError(`Unsupported simulation speed: ${value}.`);
  }
}
