import type { SimulationAlert } from "../types/alerts";
import type { SimulationAuditEntry } from "../types/audit";
import type { SafeAnesSimulationCase } from "../types/case";
import type { RecordClaim } from "../types/claims";
import type { SimulationDevice } from "../types/devices";
import type { SimulationEpisode } from "../types/episodes";
import type { SimulationEvent } from "../types/events";
import { isSimulationFaultId } from "../types/faults";
import type { SimulationFaultActivation, SimulationFaultId } from "../types/faults";
import type { MedicationRecord } from "../types/medications";
import type { Observation } from "../types/observations";
import type { PredictionEvent } from "../types/predictions";
import type { QualityStatus, SignalQualityState } from "../types/quality";
import type { WaveformSegment } from "../types/waveforms";
import type {
  SimulationClockStatus,
  SimulationEngineOptions,
  SimulationFrame,
  SimulationJumpTarget,
  SimulationPipeline,
  SimulationProcessingContext,
  SimulationSnapshot,
  SimulationSpeed,
  SimulationStageResult,
} from "../types/replay";
import { EventQueue } from "./EventQueue";
import { SimulationClock } from "./SimulationClock";
import { runUc03Engine } from "../engines/uc03";
import { runUc04Engine } from "../engines/uc04";
import { runUc05Engine } from "../engines/uc05";
import { getExplicitTemporalRelationship, getTemporalRelationship, validateRecordClaim } from "../engines/uc02";

type EngineListener = (snapshot: SimulationSnapshot) => void;

interface MutableSimulationState {
  simulationTime: number;
  events: SimulationEvent[];
  observations: Observation[];
  waveforms: WaveformSegment[];
  medications: MedicationRecord[];
  episodes: SimulationEpisode[];
  predictions: PredictionEvent[];
  alerts: SimulationAlert[];
  recordClaims: RecordClaim[];
  qualityStates: SignalQualityState[];
  devices: SimulationDevice[];
  activeFaults: SimulationFaultActivation[];
  eventGraph: SimulationSnapshot["eventGraph"];
  auditEntries: SimulationAuditEntry[];
}

interface MutableAuditEntry extends SimulationAuditEntry {}

interface FaultSignalEffect {
  sourceDevice: string;
  signals: readonly string[];
  quality: QualityStatus;
  reason: string;
  drop: boolean;
  conflicting?: boolean;
}

const FAULT_SIGNAL_EFFECTS: Partial<Record<SimulationFaultId, FaultSignalEffect>> = {
  DEVICE_DISCONNECT: {
    sourceDevice: "capnograph-or2",
    signals: ["ETCO2", "RR", "CAPNOGRAM"],
    quality: "TECHNICAL_DROPOUT",
    reason: "Synthetic device disconnect; respiratory waveform and measurements are unavailable, not zero.",
    drop: true,
  },
  PACKET_DROPOUT: {
    sourceDevice: "capnograph-or2",
    signals: ["ETCO2", "CAPNOGRAM"],
    quality: "TECHNICAL_DROPOUT",
    reason: "Synthetic packet dropout; absent packets are not physiological zero values.",
    drop: true,
  },
  SIGNAL_ARTIFACT: {
    sourceDevice: "arterial-line-or2",
    signals: ["MAP", "SBP", "DBP"],
    quality: "INVALIDATED_ARTIFACT",
    reason: "Synthetic signal artifact; raw values are retained but invalidated for downstream use.",
    drop: false,
  },
  MISSING_MODALITY: {
    sourceDevice: "pulse-ox-or2",
    signals: ["SPO2"],
    quality: "STRUCTURAL_NOT_MONITORED",
    reason: "Synthetic missing modality; SpO₂ is not monitored during this interval.",
    drop: true,
  },
  CONFLICTING_SOURCE: {
    sourceDevice: "arterial-line-or2",
    signals: ["MAP"],
    quality: "DEGRADED",
    reason: "Synthetic disagreement between two MAP sources; the value is not accepted as a single trusted input.",
    drop: false,
    conflicting: true,
  },
};

const FAULT_DEVICE_IDS: Partial<Record<SimulationFaultId, string>> = {
  DEVICE_DISCONNECT: "ventilator-or2",
  CLOCK_DRIFT: "patient-monitor-or2",
  PUMP_GATEWAY_LATENCY: "infusion-pump-or2",
};

/** Deterministic replay engine. Future scenario records stay private until they are due. */
export class SimulationEngine {
  readonly #caseDefinition: SafeAnesSimulationCase;
  readonly #pipeline: SimulationPipeline;
  #eventQueue: EventQueue;
  readonly #listeners = new Set<EngineListener>();
  readonly #eventById: Map<string, SimulationEvent>;
  readonly #observationById: Map<string, Observation>;
  readonly #waveformById: Map<string, WaveformSegment>;
  readonly #predictionById: Map<string, PredictionEvent>;
  readonly #alertById: Map<string, SimulationAlert>;
  readonly #episodeById: Map<string, SimulationEpisode>;
  readonly #medicationById: Map<string, MedicationRecord>;
  readonly #qualityBySignal: Map<string, SignalQualityState[]>;
  readonly #caseInfo: SimulationProcessingContext["caseInfo"];
  readonly #clock: SimulationClock;
  readonly #dispatchedEvents: SimulationEvent[] = [];
  readonly #deferredEvents: SimulationEvent[] = [];
  #faultSequence = 0;
  #batchProcessing = false;
  #state: MutableSimulationState;

  constructor(
    simulationCase: SafeAnesSimulationCase,
    optionsOrInitialTime: SimulationEngineOptions | number = {}
  ) {
    this.#caseDefinition = deepClone(simulationCase);
    const options = typeof optionsOrInitialTime === "number"
      ? { initialTime: optionsOrInitialTime }
      : optionsOrInitialTime;
    this.#pipeline = options.pipeline ?? {};
    this.#clock = new SimulationClock({
      durationMs: simulationCase.encounter.scheduledDurationMs,
      speed: options.speed,
    });
    this.#eventQueue = new EventQueue(this.#caseDefinition.events);
    this.#eventById = new Map(this.#caseDefinition.events.map((event) => [event.id, event]));
    this.#observationById = new Map(this.#caseDefinition.observations.map((observation) => [observation.id, observation]));
    this.#waveformById = new Map(this.#caseDefinition.waveforms.map((waveform) => [waveform.id, waveform]));
    this.#predictionById = new Map(this.#caseDefinition.predictions.map((prediction) => [prediction.id, prediction]));
    this.#alertById = new Map(this.#caseDefinition.alerts.map((alert) => [alert.id, alert]));
    this.#episodeById = new Map(this.#caseDefinition.episodes.map((episode) => [episode.id, episode]));
    this.#medicationById = new Map(this.#caseDefinition.medications.map((medication) => [medication.id, medication]));
    this.#qualityBySignal = new Map();
    for (const quality of this.#caseDefinition.qualityStates) {
      const key = qualityKey(quality.signal, quality.sourceDevice);
      this.#qualityBySignal.set(key, [...(this.#qualityBySignal.get(key) ?? []), quality]);
    }
    this.#caseInfo = {
      scenarioId: simulationCase.scenarioId,
      seed: simulationCase.seed,
      simulationMetadata: deepClone(simulationCase.simulationMetadata),
      scenarioManifest: deepClone(simulationCase.scenarioManifest),
      patient: deepClone(simulationCase.patient),
      encounter: deepClone(simulationCase.encounter),
      procedure: deepClone(simulationCase.procedure),
    };
    this.#state = this.createEmptyState();

    if (options.initialTime !== undefined && options.initialTime > 0) {
      this.seek(options.initialTime);
    }
  }

  get status(): SimulationClockStatus {
    return this.#clock.status;
  }

  get simulationTime(): number {
    return this.#state.simulationTime;
  }

  get speed(): SimulationSpeed {
    return this.#clock.speed;
  }

  hasEvent(eventId: string): boolean {
    return this.#eventById.has(eventId);
  }

  subscribe(listener: EngineListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSnapshot(): SimulationSnapshot {
    const snapshot: SimulationSnapshot = {
      scenarioId: this.#caseDefinition.scenarioId,
      seed: this.#caseDefinition.seed,
      simulationMetadata: this.#caseDefinition.simulationMetadata,
      scenarioManifest: this.#caseDefinition.scenarioManifest,
      simulationTime: this.#state.simulationTime,
      status: this.#clock.status,
      speed: this.#clock.speed,
      patient: this.#caseDefinition.patient,
      encounter: {
        ...this.#caseDefinition.encounter,
        status: this.#state.simulationTime >= this.#caseDefinition.encounter.scheduledDurationMs
          ? "COMPLETED"
          : this.#caseDefinition.encounter.status,
      },
      procedure: this.#caseDefinition.procedure,
      perioperativePhases: visiblePhases(this.#caseDefinition, this.#state.simulationTime),
      devices: this.#state.devices,
      observations: this.#state.observations,
      waveforms: visibleWaveforms(this.#state.waveforms, this.#state.simulationTime),
      medications: this.#state.medications,
      events: this.#state.events,
      episodes: this.#state.episodes,
      predictions: this.#state.predictions,
      alerts: this.#state.alerts,
      recordClaims: this.#state.recordClaims,
      qualityStates: this.#state.qualityStates,
      activeFaults: this.#state.activeFaults.map(({ id, enabledAt, eventId }) => ({ id, enabledAt, eventId })),
      eventGraph: this.#state.eventGraph,
      auditEntries: this.#state.auditEntries,
      processedEventCount: this.#state.events.length,
    };
    return deepClone(snapshot);
  }

  play(): SimulationSnapshot {
    this.#clock.play();
    return this.publish();
  }

  pause(): SimulationSnapshot {
    this.#clock.pause();
    return this.publish();
  }

  resume(): SimulationSnapshot {
    this.#clock.resume();
    return this.publish();
  }

  reset(): SimulationSnapshot {
    this.#deferredEvents.length = 0;
    this.#eventQueue = new EventQueue(this.replayEvents());
    this.#state = this.createEmptyState();
    this.#clock.reset();
    // Reprocess time-zero records so Reset reproduces the same visible baseline
    // as a freshly mounted case while leaving playback stopped.
    return this.seek(0).snapshot;
  }

  resetCase(): SimulationSnapshot {
    return this.reset();
  }

  /** Clears injected faults and clinician demo actions, then restores the deterministic case baseline. */
  resetScenario(): SimulationSnapshot {
    this.#dispatchedEvents.length = 0;
    this.#deferredEvents.length = 0;
    this.#faultSequence = 0;
    this.#eventQueue = new EventQueue(this.#caseDefinition.events);
    this.#eventById.clear();
    for (const event of this.#caseDefinition.events) this.#eventById.set(event.id, event);
    this.#state = this.createEmptyState();
    this.#clock.reset();
    return this.seek(0).snapshot;
  }

  setFault(faultId: SimulationFaultId, enabled: boolean): SimulationSnapshot {
    if (!isSimulationFaultId(faultId)) throw new RangeError(`Unknown simulation fault: ${String(faultId)}`);
    const isActive = this.#state.activeFaults.some((fault) => fault.id === faultId);
    if (isActive === enabled) return this.getSnapshot();

    // A freshly constructed case has not yet processed its time-zero baseline event.
    if (this.#state.events.length === 0 && this.#state.simulationTime === 0) this.seek(0);

    const eventId = `zzzz-simulation-fault-${faultId.toLowerCase()}-${++this.#faultSequence}`;
    const event: SimulationEvent = {
      id: eventId,
      eventTime: this.#state.simulationTime,
      recordedTime: this.#state.simulationTime,
      source: "simulation-fault-controller",
      sourceType: "SYSTEM",
      eventType: enabled ? "SIMULATION_FAULT_ENABLED" : "SIMULATION_FAULT_DISABLED",
      payload: { faultId, enabled, synthetic: true, clinicalUse: false },
      provenance: "DERIVED",
    };
    this.#dispatchedEvents.push(event);
    this.#eventById.set(event.id, event);
    // Fault controls apply at the current cursor immediately and are replayed as
    // ordered canonical events after a rewind.
    this.processEvent(event);
    this.notify();
    return this.getSnapshot();
  }

  replayFromStart(): SimulationSnapshot {
    const selectedSpeed = this.#clock.speed;
    this.reset();
    this.#clock.setSpeed(selectedSpeed);
    this.#clock.play();
    return this.publish();
  }

  setSpeed(speed: number): SimulationSnapshot {
    this.#clock.setSpeed(speed);
    return this.publish();
  }

  /** Apply real elapsed milliseconds at the selected multiplier. */
  advanceRealTime(realElapsedMs: number): SimulationFrame {
    if (!Number.isFinite(realElapsedMs) || realElapsedMs < 0) {
      throw new RangeError("realElapsedMs must be finite and non-negative.");
    }
    if (this.#clock.status !== "PLAYING" || realElapsedMs === 0) return this.makeFrame([]);
    const target = Math.min(
      this.#clock.duration,
      Math.round(this.#state.simulationTime + realElapsedMs * this.#clock.speed)
    );
    return this.seek(target);
  }

  /** Forward advance is incremental; a backward target reconstructs from the case start. */
  advanceTo(targetTime: number): SimulationFrame {
    return this.seek(targetTime);
  }

  seek(targetTime: number): SimulationFrame {
    assertTime(targetTime, "targetTime");
    const normalizedTarget = Math.min(targetTime, this.#clock.duration);
    const previousTime = this.#state.simulationTime;
    if (normalizedTarget < previousTime) {
      this.#eventQueue = new EventQueue(this.replayEvents());
      this.#deferredEvents.length = 0;
      this.#state = this.createEmptyState();
      this.#clock.seek(0);
    }

    const previouslyDeferred = [...this.#deferredEvents];
    const dueEvents = this.#eventQueue.readThrough(normalizedTarget).sort(compareSimulationEvents);
    this.#deferredEvents.length = 0;
    const processedEvents: SimulationEvent[] = [];
    this.#batchProcessing = true;
    try {
      for (const event of dueEvents) {
        const effectiveEvent = this.applyScheduledFaultDelay(event);
        const recordedTime = effectiveEvent.recordedTime ?? effectiveEvent.eventTime;
        if (recordedTime > normalizedTarget) {
          this.#deferredEvents.push(effectiveEvent);
          this.#eventById.set(effectiveEvent.id, effectiveEvent);
          continue;
        }
        const processingTime = Math.max(
          this.#state.simulationTime,
          effectiveEvent.eventTime,
          recordedTime
        );
        this.#clock.seek(processingTime);
        this.#state.simulationTime = this.#clock.simulationTime;
        processedEvents.push(this.processEvent(effectiveEvent));
      }
      const readyDeferred = [...previouslyDeferred, ...this.#deferredEvents]
        .filter((event) => (event.recordedTime ?? event.eventTime) <= normalizedTarget)
        .sort(compareSimulationEvents);
      const waiting = [...previouslyDeferred, ...this.#deferredEvents]
        .filter((event) => (event.recordedTime ?? event.eventTime) > normalizedTarget);
      this.#deferredEvents.length = 0;
      this.#deferredEvents.push(...waiting);
      for (const event of readyDeferred) {
        const processingTime = Math.max(
          this.#state.simulationTime,
          event.eventTime,
          event.recordedTime ?? event.eventTime,
        );
        this.#clock.seek(processingTime);
        this.#state.simulationTime = this.#clock.simulationTime;
        processedEvents.push(this.processEvent(event));
      }
    } finally {
      this.#batchProcessing = false;
    }

    this.#clock.seek(normalizedTarget);
    this.#state.simulationTime = this.#clock.simulationTime;
    this.notify();
    return this.makeFrame(processedEvents);
  }

  replayTo(targetTime: number): SimulationFrame {
    this.#eventQueue = new EventQueue(this.replayEvents());
    this.#deferredEvents.length = 0;
    this.#state = this.createEmptyState();
    this.#clock.reset();
    return this.seek(targetTime);
  }

  seekToEvent(eventId: string): SimulationFrame {
    const event = this.#eventById.get(eventId);
    if (!event) throw new RangeError(`Unknown simulation event: ${eventId}`);
    return this.seek(Math.max(event.eventTime, event.recordedTime ?? event.eventTime));
  }

  jumpTo(target: SimulationJumpTarget): SimulationFrame {
    const phaseIds: Partial<Record<SimulationJumpTarget, string>> = {
      PRE_OP: "preoperative",
      INDUCTION: "induction",
      MAINTENANCE: "maintenance",
      EMERGENCE: "emergence",
    };
    const phaseId = phaseIds[target];
    if (phaseId) {
      const phase = this.#caseDefinition.perioperativePhases.find((item) => item.id === phaseId);
      if (!phase) throw new RangeError(`Unknown simulation phase: ${phaseId}`);
      return this.seek(phase.startTime);
    }

    const event = this.#caseDefinition.events.find((candidate) => {
      const payload = recordPayload(candidate.payload);
      const type = typeof payload.type === "string" ? payload.type : "";
      if (target === "HEMODYNAMIC_EVENT") return type === "HYPOTENSION";
      return type.startsWith("RESPIRATORY_");
    });
    if (!event) throw new RangeError(`No event is available for jump target ${target}.`);
    return this.seek(Math.max(event.eventTime, event.recordedTime ?? event.eventTime));
  }

  /**
   * Adds a manual/synthetic action to the canonical stream and processes it at
   * the current cursor. The appended event is retained across reset and replay.
   */
  dispatchEvent<TPayload>(event: SimulationEvent<TPayload>): SimulationSnapshot {
    assertTime(event.eventTime, "event.eventTime");
    if (!event.id || !event.eventType || !event.source) {
      throw new TypeError("A dispatched simulation event requires id, eventType, and source.");
    }
    if (event.eventTime < this.#state.simulationTime) {
      throw new RangeError("Dispatched events cannot be recorded before the current simulation time.");
    }
    if (event.eventTime > this.#clock.duration) {
      throw new RangeError("Dispatched event is outside the scheduled case duration.");
    }
    if (this.#eventById.has(event.id)) {
      throw new RangeError("Duplicate simulation event id: " + event.id);
    }

    const storedEvent = deepClone(event) as SimulationEvent;
    this.#dispatchedEvents.push(storedEvent);
    this.#eventById.set(storedEvent.id, storedEvent);
    this.#eventQueue.add(storedEvent);

    const previouslyDeferred = [...this.#deferredEvents];
    const dueEvents = this.#eventQueue.readThrough(this.#state.simulationTime).sort(compareSimulationEvents);
    this.#deferredEvents.length = 0;
    for (const dueEvent of dueEvents) {
      const effectiveEvent = this.applyScheduledFaultDelay(dueEvent);
      if ((effectiveEvent.recordedTime ?? effectiveEvent.eventTime) > this.#state.simulationTime) {
        this.#deferredEvents.push(effectiveEvent);
        this.#eventById.set(effectiveEvent.id, effectiveEvent);
        continue;
      }
      this.processEvent(effectiveEvent);
    }
    const readyDeferred = [...previouslyDeferred, ...this.#deferredEvents].filter((event) =>
      (event.recordedTime ?? event.eventTime) <= this.#state.simulationTime,
    );
    const waiting = [...previouslyDeferred, ...this.#deferredEvents].filter((event) =>
      (event.recordedTime ?? event.eventTime) > this.#state.simulationTime,
    );
    this.#deferredEvents.length = 0;
    this.#deferredEvents.push(...waiting);
    for (const event of readyDeferred.sort(compareSimulationEvents)) this.processEvent(event);
    this.notify();
    return this.getSnapshot();
  }

  private processEvent(event: SimulationEvent): SimulationEvent {
    const visibleEventIds = new Set(this.#state.events.map((item) => item.id));
    const dueEvent: SimulationEvent = {
      ...deepClone(event),
      relatedEventIds: event.relatedEventIds?.filter((relatedId) => visibleEventIds.has(relatedId)),
    };
    const audit: MutableAuditEntry = {
      id: `audit-${dueEvent.id}`,
      simulationTime: this.#state.simulationTime,
      eventId: dueEvent.id,
      stateChanges: [],
      rulesTriggered: [],
      predictionsGenerated: [],
      alertsCreated: [],
      alertsUpdated: [],
    };

    if (this.shouldSuppressForQuality(dueEvent)) {
      audit.stateChanges.push(`event-suppressed-quality:${dueEvent.id}`);
      this.#state.auditEntries.push(deepClone(audit));
      if (this.#listeners.size > 0 && !this.#batchProcessing) this.notify();
      return dueEvent;
    }

    this.#state.events.push(dueEvent);
    this.#state.events.sort(compareSimulationEvents);
    audit.stateChanges.push(`event-ingested:${dueEvent.id}`);
    this.runStage("ingestRawEvent", dueEvent, audit);

    this.applyCanonicalEvent(dueEvent, audit);
    this.runStage("updateCanonicalState", dueEvent, audit);

    this.applyQualityEvent(dueEvent, audit);
    this.reassertActiveFaultEffects();
    this.runStage("updateQualityState", dueEvent, audit);

    this.runStage("runUseCaseEngines", dueEvent, audit);

    this.applyPredictionEvent(dueEvent, audit);
    this.runStage("createPredictions", dueEvent, audit);

    this.applyAlertEvent(dueEvent, audit);
    this.runStage("runAlertPolicy", dueEvent, audit);

    this.applyEventGraphAndClaims(dueEvent, audit);
    this.runStage("updateEventGraphAndClaims", dueEvent, audit);

    audit.simulationTime = this.#state.simulationTime;
    this.#state.auditEntries.push(deepClone(audit));
    if (this.#listeners.size > 0 && !this.#batchProcessing) this.notify();
    return dueEvent;
  }

  private runStage(
    stage: keyof SimulationPipeline,
    event: SimulationEvent,
    audit: MutableAuditEntry
  ): void {
    if (stage === "runUseCaseEngines") {
      const eventType = event.eventType;
      const isMedicationWorkflowEvent = eventType === "MEDICATION_PROPOSED" ||
        eventType === "MEDICATION_PROPOSAL_MODIFIED" ||
        eventType === "MEDICATION_DEMO_ALERT_OVERRIDDEN" ||
        eventType === "MEDICATION_DEMO_REVIEW_CONTINUED";
      const hemodynamicConfig = this.#caseInfo.scenarioManifest.hemodynamics;
      const respiratoryConfig = this.#caseInfo.scenarioManifest.respiratory;
      const isEvaluationBatch = eventType === "OBSERVATION_BATCH_RECORDED";
      const shouldRunUc04 = isEvaluationBatch &&
        event.eventTime % hemodynamicConfig.evaluationIntervalMs === 0;
      const shouldRunUc05 = isEvaluationBatch &&
        event.eventTime % respiratoryConfig.evaluationIntervalMs === 0;
      const payload = recordPayload(event.payload);
      const isRespiratoryEpisodeEvent =
        ((eventType === "EPISODE_DETECTED" || eventType === "EPISODE_RESOLVED") &&
          payload.episodeId === "episode-respiratory-deterioration-candidate") ||
        (eventType === "ALERT_RAISED" && payload.alertId === "alert-respiratory-no-breath");

      if (isMedicationWorkflowEvent || shouldRunUc04 || shouldRunUc05 || isRespiratoryEpisodeEvent) {
        const context: SimulationProcessingContext = {
          event,
          simulationTime: this.#state.simulationTime,
          caseInfo: this.#caseInfo,
          snapshot: this.createSnapshot(),
        };

        if (isMedicationWorkflowEvent) {
          const uc03Result = runUc03Engine(context);
          if (uc03Result) this.applyStageResult(uc03Result, audit);
        }

        if (shouldRunUc04) {
          const uc04Result = runUc04Engine(context);
          if (uc04Result) this.applyStageResult(uc04Result, audit);
        }

        if (shouldRunUc05 || isRespiratoryEpisodeEvent) {
          const uc05Result = runUc05Engine(context);
          if (uc05Result) this.applyStageResult(uc05Result, audit);
        }
      }
    }

    const callback = this.#pipeline[stage];
    if (!callback) return;
    const context: SimulationProcessingContext = {
      event: deepClone(event),
      simulationTime: this.#state.simulationTime,
      caseInfo: deepClone(this.#caseInfo),
      snapshot: this.getSnapshot(),
    };
    const result = callback(context);
    if (result) this.applyStageResult(result, audit);
  }

  private replayEvents(): SimulationEvent[] {
    return [...this.#caseDefinition.events, ...this.#dispatchedEvents];
  }

  private applyScheduledFaultDelay(event: SimulationEvent): SimulationEvent {
    let minimumRecordedTime = event.recordedTime ?? event.eventTime;
    if (
      event.eventType === "MEDICATION_ADMINISTERED" &&
      this.hasActiveFault("DELAYED_MEDICATION_DOCUMENTATION")
    ) {
      minimumRecordedTime = Math.max(minimumRecordedTime, event.eventTime + 5 * 60_000);
    }
    if (
      event.source === "infusion-pump-or2" && isMedicationLifecycleEvent(event.eventType) &&
      this.hasActiveFault("PUMP_GATEWAY_LATENCY")
    ) {
      minimumRecordedTime = Math.max(minimumRecordedTime, event.eventTime + 2_500);
    }
    return minimumRecordedTime > (event.recordedTime ?? event.eventTime)
      ? { ...deepClone(event), recordedTime: minimumRecordedTime }
      : event;
  }

  private shouldSuppressForQuality(event: SimulationEvent): boolean {
    const payload = recordPayload(event.payload);
    const respiratoryEpisode = payload.episodeId === "episode-respiratory-deterioration-candidate";
    const respiratoryAlert = payload.alertId === "alert-respiratory-no-breath";
    const capnographEvent = event.source === "capnograph-or2" &&
      (event.eventType.startsWith("RESPIRATORY_") ||
        ((event.eventType === "EPISODE_DETECTED" || event.eventType === "EPISODE_RESOLVED") && respiratoryEpisode));
    if (!capnographEvent && !respiratoryAlert) return false;
    return ["ETCO2", "RR", "CAPNOGRAM"].some((signal) =>
      this.faultEffectForSignal(signal, "capnograph-or2")?.drop,
    );
  }

  private hasActiveFault(faultId: SimulationFaultId): boolean {
    return this.#state.activeFaults.some((fault) => fault.id === faultId);
  }

  private faultEffectForSignal(
    signal: string,
    sourceDevice: string,
  ): (FaultSignalEffect & { faultId: SimulationFaultId }) | undefined {
    for (const activation of [...this.#state.activeFaults].reverse()) {
      const effect = FAULT_SIGNAL_EFFECTS[activation.id];
      if (effect && effect.sourceDevice === sourceDevice && effect.signals.includes(signal)) {
        return { ...effect, faultId: activation.id };
      }
    }
    return undefined;
  }

  private applyFaultControlEvent(event: SimulationEvent, audit: MutableAuditEntry): void {
    const payload = recordPayload(event.payload);
    if (!isSimulationFaultId(payload.faultId)) return;
    const faultId = payload.faultId;
    if (event.eventType === "SIMULATION_FAULT_ENABLED") {
      if (this.hasActiveFault(faultId)) return;
      const activation: SimulationFaultActivation = { id: faultId, enabledAt: event.eventTime, eventId: event.id };
      this.#state.activeFaults.push(activation);
      this.applyFaultDeviceEffect(faultId, true);
      for (const signalEffect of FAULT_SIGNAL_EFFECTS[faultId] ? [FAULT_SIGNAL_EFFECTS[faultId]!] : []) {
        for (const signal of signalEffect.signals) {
          this.upsertFaultQualityState(activation, signal, signalEffect.quality, signalEffect.reason, event.eventTime);
        }
      }
      if (faultId === "CONFLICTING_SOURCE") {
        const effect = FAULT_SIGNAL_EFFECTS.CONFLICTING_SOURCE!;
        for (const observation of this.#state.observations.filter((item) =>
          item.signal === "MAP" && item.sourceDevice === effect.sourceDevice,
        )) {
          this.addConflictingObservation(observation, { ...effect, faultId }, audit);
        }
      }
      audit.stateChanges.push(`simulation-fault-enabled:${faultId}`);
      return;
    }

    const activation = this.#state.activeFaults.find((fault) => fault.id === faultId);
    if (!activation) return;
    this.#state.activeFaults = this.#state.activeFaults.filter((fault) => fault.id !== faultId);
    for (const signalEffect of FAULT_SIGNAL_EFFECTS[faultId] ? [FAULT_SIGNAL_EFFECTS[faultId]!] : []) {
      for (const signal of signalEffect.signals) {
        const qualityId = faultQualityId(activation, signal);
        const quality = this.#state.qualityStates.find((item) => item.id === qualityId);
        if (quality && quality.validUntilTime === undefined) {
          upsertById(this.#state.qualityStates, { ...quality, validUntilTime: event.eventTime });
        }
      }
    }
    this.applyFaultDeviceEffect(faultId, false);
    audit.stateChanges.push(`simulation-fault-disabled:${faultId}`);
  }

  private upsertFaultQualityState(
    activation: SimulationFaultActivation,
    signal: string,
    status: QualityStatus,
    reason: string,
    eventTime: number,
  ): void {
    upsertById(this.#state.qualityStates, {
      id: faultQualityId(activation, signal),
      signal,
      sourceDevice: FAULT_SIGNAL_EFFECTS[activation.id]?.sourceDevice ?? "",
      eventTime,
      status,
      reason: `[${activation.id}] ${reason}`,
    });
  }

  private reassertActiveFaultEffects(): void {
    for (const activation of this.#state.activeFaults) {
      this.applyFaultDeviceEffect(activation.id, true);
      const effect = FAULT_SIGNAL_EFFECTS[activation.id];
      if (!effect) continue;
      for (const signal of effect.signals) {
        this.upsertFaultQualityState(
          activation,
          signal,
          effect.quality,
          effect.reason,
          Math.max(activation.enabledAt, this.#state.simulationTime),
        );
      }
    }
  }

  private applyFaultDeviceEffect(faultId: SimulationFaultId, enabled: boolean): void {
    const deviceId = FAULT_DEVICE_IDS[faultId];
    if (!deviceId) return;
    const device = this.#state.devices.find((item) => item.id === deviceId);
    if (!device) return;
    if (!enabled) {
      const baseline = this.scenarioDeviceStateAt(deviceId, this.#state.simulationTime);
      baseline.lastMessageAt = device.lastMessageAt;
      Object.assign(device, baseline);
      return;
    }
    if (faultId === "DEVICE_DISCONNECT") {
      device.status = "DISCONNECTED";
      device.signalQuality = "TECHNICAL_DROPOUT";
    } else if (faultId === "CLOCK_DRIFT") {
      const baseline = this.#caseDefinition.devices.find((item) => item.id === deviceId);
      device.clockOffsetMs = (baseline?.clockOffsetMs ?? device.clockOffsetMs) + 5_000;
      device.status = "DEGRADED";
      device.signalQuality = "DEGRADED";
    } else if (faultId === "PUMP_GATEWAY_LATENCY") {
      device.status = "DEGRADED";
      device.signalQuality = "DEGRADED";
      device.latencyMs = 2_500;
    }
  }

  private scenarioDeviceStateAt(deviceId: string, time: number): SimulationDevice {
    const original = this.#caseDefinition.devices.find((item) => item.id === deviceId);
    if (!original) throw new RangeError(`Unknown device for simulation fault: ${deviceId}`);
    const device = deepClone(original);
    const relatedSources = new Set([device.id, ...device.sourceIds]);
    for (const event of this.#state.events) {
      if (!relatedSources.has(event.source) || event.eventTime > time || event.eventType.startsWith("SIMULATION_FAULT_")) continue;
      const payload = recordPayload(event.payload);
      if (event.eventType === "DEVICE_HEARTBEAT" || event.eventType === "DEVICE_CONNECTED") device.status = "CONNECTED";
      if (event.eventType === "DEVICE_DISCONNECTED") device.status = "DISCONNECTED";
      if (event.eventType === "DEVICE_LATENCY_INCREASED") {
        device.status = "DEGRADED";
        if (typeof payload.latencyMs === "number") device.latencyMs = payload.latencyMs;
      }
      if (event.eventType === "DEVICE_LATENCY_RECOVERED") {
        device.status = "CONNECTED";
        if (typeof payload.latencyMs === "number") device.latencyMs = payload.latencyMs;
      }
      if ((event.eventType === "SIGNAL_QUALITY_CHANGED" || event.eventType === "DEVICE_LATENCY_INCREASED") &&
        isQualityStatus(payload.quality)) device.signalQuality = payload.quality;
      if (event.eventType === "SIGNAL_QUALITY_RESTORED" || event.eventType === "DEVICE_LATENCY_RECOVERED") {
        device.signalQuality = "GOOD";
      }
      device.lastMessageAt = Math.max(device.lastMessageAt ?? 0, event.recordedTime ?? event.eventTime);
    }
    return device;
  }

  private addConflictingObservation(
    observation: Observation,
    effect: FaultSignalEffect & { faultId: SimulationFaultId },
    audit: MutableAuditEntry,
  ): void {
    const activation = [...this.#state.activeFaults].reverse().find((fault) => fault.id === effect.faultId);
    if (!activation) return;
    const id = `fault-conflict-${activation.eventId}-${observation.id}`;
    if (this.#state.observations.some((item) => item.id === id)) return;
    const conflicting: Observation = {
      ...deepClone(observation),
      id,
      value: observation.value > 80 ? observation.value - 22 : observation.value + 22,
      sourceDevice: "secondary-arterial-line-or2",
      receivedTime: Math.max(observation.receivedTime, this.#state.simulationTime),
      quality: { status: "DEGRADED", reason: effect.reason },
      provenance: "DIRECT",
      validity: "CONFLICTING",
      invalidReason: effect.reason,
    };
    this.#state.observations.push(conflicting);
    this.#state.qualityStates.push({
      id: `quality-${id}`,
      signal: observation.signal,
      sourceDevice: conflicting.sourceDevice,
      eventTime: conflicting.eventTime,
      status: "DEGRADED",
      reason: effect.reason,
    });
    audit.stateChanges.push(`conflicting-source-added:${id}`);
  }

  private applyCanonicalEvent(event: SimulationEvent, audit: MutableAuditEntry): void {
    const payload = recordPayload(event.payload);
    if (event.eventType === "SIMULATION_FAULT_ENABLED" || event.eventType === "SIMULATION_FAULT_DISABLED") {
      this.applyFaultControlEvent(event, audit);
      return;
    }
    const claimId = typeof payload.claimId === "string" ? payload.claimId : undefined;
    const claim = claimId ? this.#state.recordClaims.find((item) => item.id === claimId) : undefined;
    if (claim && event.eventType.startsWith("RECORD_CLAIM_")) {
      if (event.eventType === "RECORD_CLAIM_ACCEPTED") {
        const updated = { ...claim, reviewStatus: "ACCEPTED" as const, provenance: "CLINICIAN_CONFIRMED" as const };
        upsertById(this.#state.recordClaims, {
          ...updated,
          validation: validateRecordClaim(updated, this.#state.events, this.#caseDefinition.encounter.startedAt),
        });
        audit.stateChanges.push(`claim-accepted:${claim.id}`);
      } else if (event.eventType === "RECORD_CLAIM_EDITED") {
        const clinicalTime = recordPayload(payload.clinicalTime);
        const start = typeof clinicalTime.start === "number" ? clinicalTime.start : claim.clinicalTime?.start ?? claim.eventTime;
        const end = typeof clinicalTime.end === "number" ? clinicalTime.end : claim.clinicalTime?.end;
        const updated: RecordClaim = {
          ...claim,
          ...(typeof payload.text === "string" ? { text: payload.text, localizedText: undefined } : {}),
          clinicalTime: { start, ...(end === undefined ? {} : { end }) },
          eventTime: start,
          ...(end === undefined ? { endTime: undefined } : { endTime: end }),
          ...(typeof payload.terminologyTerm === "string" ? { terminologyTerm: payload.terminologyTerm } : {}),
          reviewStatus: "EDITED",
          provenance: "CLINICIAN_CONFIRMED",
        };
        upsertById(this.#state.recordClaims, {
          ...updated,
          validation: validateRecordClaim(updated, this.#state.events, this.#caseDefinition.encounter.startedAt),
        });
        audit.stateChanges.push(`claim-edited:${claim.id}`);
      } else if (event.eventType === "RECORD_CLAIM_REJECTED") {
        upsertById(this.#state.recordClaims, {
          ...claim,
          reviewStatus: "REJECTED",
          provenance: "REJECTED",
          rejectionReason: typeof payload.reason === "string" ? payload.reason : "Other",
        });
        audit.stateChanges.push(`claim-rejected:${claim.id}`);
      } else if (event.eventType === "RECORD_CLAIM_REQUIRES_REVIEW") {
        upsertById(this.#state.recordClaims, { ...claim, reviewStatus: "REQUIRES_REVIEW" });
        audit.stateChanges.push(`claim-requires-review:${claim.id}`);
      } else if (event.eventType === "RECORD_CAUSALITY_CONFIRMED") {
        const targetEventId = typeof payload.targetEventId === "string" ? payload.targetEventId : undefined;
        if (targetEventId && claim.eventRefs.includes(targetEventId)) {
          upsertById(this.#state.recordClaims, {
            ...claim,
            causalityConfirmation: { targetEventId, confirmedAt: event.eventTime },
            provenance: "CLINICIAN_CONFIRMED",
          });
          audit.stateChanges.push(`claim-causality-confirmed:${claim.id}:${targetEventId}`);
        }
      }
    }

    if (event.eventType === "RECORD_SIGNED") {
      audit.stateChanges.push("record-signed");
    }
    for (const observationId of observationIdsFor(event.eventType, payload)) {
      const observation = this.#observationById.get(observationId);
      if (observation) {
        const effect = this.faultEffectForSignal(observation.signal, observation.sourceDevice);
        if (effect?.drop) {
          audit.stateChanges.push(`observation-dropped-by-fault:${observation.id}:${effect.faultId}`);
          continue;
        }
        const canonicalObservation = effect
          ? {
              ...deepClone(observation),
              quality: { ...observation.quality, status: effect.quality, reason: effect.reason },
              validity: effect.conflicting ? "CONFLICTING" as const : "INVALID" as const,
              invalidReason: effect.reason,
            }
          : deepClone(observation);
        upsertById(this.#state.observations, canonicalObservation);
        audit.stateChanges.push(`observation-added:${observation.id}`);
        const device = this.findDeviceForSource(observation.sourceDevice);
        if (device) device.lastMessageAt = Math.max(device.lastMessageAt ?? 0, observation.receivedTime);
        if (effect?.conflicting) this.addConflictingObservation(canonicalObservation, effect, audit);
      }
    }

    if (event.eventType === "WAVEFORM_SEGMENT_RECORDED" && typeof payload.waveformId === "string") {
      const waveform = this.#waveformById.get(payload.waveformId);
      if (waveform) {
        const effect = this.faultEffectForSignal(waveform.signal, waveform.sourceDevice);
        if (effect?.drop) {
          audit.stateChanges.push(`waveform-dropped-by-fault:${waveform.id}:${effect.faultId}`);
        } else {
          upsertById(this.#state.waveforms, effect
            ? {
                ...deepClone(waveform),
                quality: { ...waveform.quality, status: effect.quality, reason: effect.reason },
                validity: "INVALID",
                invalidReason: effect.reason,
              }
            : deepClone(waveform));
          audit.stateChanges.push(`waveform-added:${waveform.id}`);
        }
      }
    }

    if (isMedicationLifecycleEvent(event.eventType) && typeof payload.medicationId === "string") {
      const medication = this.#medicationById.get(payload.medicationId);
      const existing = this.#state.medications.find((item) => item.id === payload.medicationId);
      const status = medicationStatusForEvent(event.eventType);
      const nextMedication: MedicationRecord = {
        ...(existing ?? medication ?? {
          id: payload.medicationId,
          name: typeof payload.name === "string" ? payload.name : "Synthetic medication",
          indication: typeof payload.indication === "string" ? payload.indication : "Synthetic demonstration record",
          dose: 0,
          doseUnit: "",
          route: "",
          source: event.source,
          synthetic: payload.synthetic === true ? true : undefined,
          clinicalUse: payload.clinicalUse === false ? false : undefined,
        }),
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(typeof payload.indication === "string" ? { indication: payload.indication } : {}),
        ...(typeof payload.dose === "number" && Number.isFinite(payload.dose) ? { dose: payload.dose } : {}),
        ...(typeof payload.doseUnit === "string" ? { doseUnit: payload.doseUnit } : {}),
        ...(typeof payload.route === "string" ? { route: payload.route } : {}),
        ...(typeof payload.rate === "number" && Number.isFinite(payload.rate) ? { rate: payload.rate } : {}),
        ...(typeof payload.rateUnit === "string" ? { rateUnit: payload.rateUnit } : {}),
        eventTime: event.eventTime,
        source: event.source,
        status,
        ...(event.eventType === "MEDICATION_STOPPED" ? { endTime: event.eventTime } : { endTime: undefined }),
      };
      upsertById(this.#state.medications, nextMedication);
      audit.stateChanges.push(`medication-visible:${nextMedication.id}:${status}`);
    }

    if (event.eventType === "EPISODE_DETECTED" && typeof payload.episodeId === "string") {
      const episode = this.#episodeById.get(payload.episodeId);
      if (episode) {
        upsertById(this.#state.episodes, {
          ...deepClone(episode),
          startTime: event.eventTime,
          endTime: undefined,
          status: "ACTIVE",
        });
        audit.stateChanges.push(`episode-opened:${episode.id}`);
      }
    }

    if (event.eventType === "EPISODE_RESOLVED" && typeof payload.episodeId === "string") {
      const existing = this.#state.episodes.find((item) => item.id === payload.episodeId);
      if (existing) {
        upsertById(this.#state.episodes, { ...existing, endTime: event.eventTime, status: "RESOLVED" });
        audit.stateChanges.push(`episode-resolved:${payload.episodeId}`);
      }
    }

    const device = this.findDeviceForSource(event.source);
    if (device) device.lastMessageAt = Math.max(device.lastMessageAt ?? 0, event.recordedTime ?? event.eventTime);

    if (device && (event.eventType === "DEVICE_HEARTBEAT" || event.eventType === "DEVICE_CONNECTED")) {
      device.status = "CONNECTED";
      if (typeof payload.latencyMs === "number") device.latencyMs = payload.latencyMs;
    }
    if (event.eventType === "DEVICE_DISCONNECTED" && device) {
      device.status = "DISCONNECTED";
    }
  }

  private applyQualityEvent(event: SimulationEvent, audit: MutableAuditEntry): void {
    const payload = recordPayload(event.payload);
    if (
      (event.eventType === "SIGNAL_QUALITY_CHANGED" || event.eventType === "DEVICE_LATENCY_INCREASED") &&
      typeof payload.signal === "string"
    ) {
      const template = this.#qualityBySignal.get(qualityKey(payload.signal, event.source))
        ?.find((candidate) => candidate.eventTime === event.eventTime);
      const quality = template
        ? { ...deepClone(template), eventTime: event.eventTime, recordedTime: event.recordedTime, validUntilTime: undefined }
        : {
            id: `quality-${event.id}`,
            signal: payload.signal,
            sourceDevice: event.source,
            eventTime: event.eventTime,
            recordedTime: event.recordedTime,
            status: "DEGRADED" as const,
          };
      if (
        isQualityStatus(payload.quality)
      ) {
        quality.status = payload.quality;
      }
      upsertById(this.#state.qualityStates, quality);
      const device = this.findDeviceForSource(event.source);
      if (device) {
        device.signalQuality = quality.status;
        if (event.eventType === "DEVICE_LATENCY_INCREASED") {
          device.status = "DEGRADED";
          if (typeof payload.latencyMs === "number") device.latencyMs = payload.latencyMs;
        }
      }
      audit.stateChanges.push(`quality-updated:${quality.id}`);
    }

    if (
      (event.eventType === "SIGNAL_QUALITY_RESTORED" || event.eventType === "DEVICE_LATENCY_RECOVERED") &&
      typeof payload.signal === "string"
    ) {
      const existing = [...this.#state.qualityStates]
        .filter((item) => item.signal === payload.signal && item.sourceDevice === event.source && item.validUntilTime === undefined)
        .sort((left, right) => right.eventTime - left.eventTime)[0];
      if (existing) {
        upsertById(this.#state.qualityStates, {
          ...existing,
          status: "GOOD",
          validUntilTime: event.eventTime,
          recordedTime: event.recordedTime,
        });
        const device = this.findDeviceForSource(event.source);
        if (device) {
          device.signalQuality = "GOOD";
          if (event.eventType === "DEVICE_LATENCY_RECOVERED") {
            device.status = "CONNECTED";
            if (typeof payload.latencyMs === "number") device.latencyMs = payload.latencyMs;
          }
        }
        audit.stateChanges.push(`quality-restored:${payload.signal}`);
      }
    }

    for (const observationId of observationIdsFor(event.eventType, payload)) {
      const observation = this.#observationById.get(observationId);
      if (observation) {
        if (observation.quality.status === "GOOD") continue;
        const existingActive = this.#state.qualityStates.find((quality) =>
          quality.signal === observation.signal &&
          quality.sourceDevice === observation.sourceDevice &&
          quality.status === observation.quality.status &&
          quality.eventTime <= observation.eventTime &&
          (quality.validUntilTime === undefined || quality.validUntilTime >= observation.eventTime)
        );
        if (existingActive) continue;
        const template = this.#qualityBySignal
          .get(qualityKey(observation.signal, observation.sourceDevice))
          ?.find((quality) => quality.eventTime <= observation.eventTime &&
            (quality.validUntilTime === undefined || quality.validUntilTime >= observation.eventTime));
        const quality: SignalQualityState = template
          ? deepClone(template)
          : {
              id: `quality-${observation.id}`,
              signal: observation.signal,
              sourceDevice: observation.sourceDevice,
              eventTime: observation.eventTime,
              recordedTime: event.recordedTime,
              // Without an interval template this quality applies to the raw
              // sample only; a later good sample must not inherit it forever.
              validUntilTime: observation.eventTime,
              status: observation.quality.status,
              reason: observation.quality.reason,
              metrics: observation.quality.metrics,
            };
        if (!this.#state.qualityStates.some((item) => item.id === quality.id)) {
          this.#state.qualityStates.push(quality);
          audit.stateChanges.push(`quality-observation:${quality.id}`);
        }
      }
    }
  }

  private applyPredictionEvent(event: SimulationEvent, audit: MutableAuditEntry): void {
    if (event.eventType !== "PREDICTION_CREATED") return;
    const payload = recordPayload(event.payload);
    if (typeof payload.predictionId !== "string") return;
    const prediction = this.#predictionById.get(payload.predictionId);
    if (!prediction) return;
    if (prediction.timestamp > this.#state.simulationTime) return;
    upsertById(this.#state.predictions, deepClone(prediction));
    audit.predictionsGenerated.push(prediction.id);
    audit.stateChanges.push(`prediction-created:${prediction.id}`);
  }

  private applyAlertEvent(event: SimulationEvent, audit: MutableAuditEntry): void {
    const payload = recordPayload(event.payload);
    if (event.eventType === "ALERT_RAISED" && typeof payload.alertId === "string") {
      const alert = this.#alertById.get(payload.alertId);
      if (alert) {
        const existed = this.#state.alerts.some((item) => item.id === alert.id);
        upsertById(this.#state.alerts, { ...deepClone(alert), status: "ACTIVE" });
        (existed ? audit.alertsUpdated : audit.alertsCreated).push(alert.id);
        audit.stateChanges.push(`alert-raised:${alert.id}`);
      }
    }

    if (
      (event.eventType === "ALERT_ACKNOWLEDGED" || event.eventType === "ALERT_RESOLVED") &&
      typeof payload.alertId === "string"
    ) {
      const alert = this.#state.alerts.find((item) => item.id === payload.alertId);
      if (alert) {
        const status = event.eventType === "ALERT_ACKNOWLEDGED" ? "ACKNOWLEDGED" : "RESOLVED";
        upsertById(this.#state.alerts, { ...alert, status });
        audit.alertsUpdated.push(alert.id);
        audit.stateChanges.push(`alert-updated:${alert.id}:${status}`);
      }
    }
  }

  private applyEventGraphAndClaims(event: SimulationEvent, audit: MutableAuditEntry): void {
    const visibleEventIds = new Set(this.#state.events.map((item) => item.id));
    for (const relatedEventId of event.relatedEventIds ?? []) {
      if (!visibleEventIds.has(relatedEventId)) continue;
      const relatedEvent = this.#state.events.find((item) => item.id === relatedEventId);
      if (!relatedEvent) continue;
      this.upsertTemporalEdge(
        event,
        relatedEvent,
        getExplicitTemporalRelationship(event, relatedEventId) ??
          getTemporalRelationship(event, relatedEvent, this.#state.events),
      );
    }

    if (isEventGraphNode(event)) {
      const priorEvent = [...this.#state.events].reverse().find(
        (candidate) => candidate.id !== event.id && isEventGraphNode(candidate),
      );
      if (priorEvent && !(event.relatedEventIds ?? []).includes(priorEvent.id)) {
        this.upsertTemporalEdge(
          event,
          priorEvent,
          getTemporalRelationship(event, priorEvent, this.#state.events),
        );
      }
    }

    for (const claim of this.#caseDefinition.recordClaims) {
      if (
        !this.#state.recordClaims.some((item) => item.id === claim.id) &&
        claim.eventTime <= this.#state.simulationTime &&
        (claim.endTime === undefined || claim.endTime <= this.#state.simulationTime) &&
        claim.eventRefs.every((eventId) => visibleEventIds.has(eventId))
      ) {
        this.#state.recordClaims.push({
          ...deepClone(claim),
          validation: validateRecordClaim(claim, this.#state.events, this.#caseDefinition.encounter.startedAt),
        });
        audit.stateChanges.push(`claim-derived:${claim.id}`);
      }
    }
  }

  private upsertTemporalEdge(
    event: SimulationEvent,
    relatedEvent: SimulationEvent,
    relationship: SimulationSnapshot["eventGraph"][number]["relationship"],
  ): void {
    const existingIndex = this.#state.eventGraph.findIndex(
      (edge) => edge.eventId === event.id && edge.relatedEventId === relatedEvent.id,
    );
    const edge = { eventId: event.id, relatedEventId: relatedEvent.id, relationship };
    if (existingIndex === -1) this.#state.eventGraph.push(edge);
    else this.#state.eventGraph[existingIndex] = edge;
  }

  private applyStageResult(result: SimulationStageResult, audit: MutableAuditEntry): void {
    audit.stateChanges.push(...(result.stateChanges ?? []));
    audit.rulesTriggered.push(...(result.rulesTriggered ?? []));

    for (const observation of result.observationsAdded ?? []) {
      if (observation.eventTime <= this.#state.simulationTime && observation.receivedTime <= this.#state.simulationTime) {
        upsertById(this.#state.observations, deepClone(observation));
      }
    }
    for (const waveform of result.waveformsAdded ?? []) {
      if (
        waveform.eventTime <= this.#state.simulationTime &&
        waveform.recordedTime <= this.#state.simulationTime
      ) {
        upsertById(this.#state.waveforms, deepClone(waveform));
      }
    }
    for (const medication of result.medicationsAdded ?? []) {
      if (medication.eventTime <= this.#state.simulationTime) upsertById(this.#state.medications, deepClone(medication));
    }
    for (const episode of result.episodesAdded ?? []) {
      if (episode.startTime <= this.#state.simulationTime) upsertById(this.#state.episodes, deepClone(episode));
    }
    for (const quality of result.qualityStatesUpdated ?? []) {
      if (
        quality.eventTime <= this.#state.simulationTime &&
        (quality.recordedTime === undefined || quality.recordedTime <= this.#state.simulationTime)
      ) {
        upsertById(this.#state.qualityStates, deepClone(quality));
      }
    }
    for (const prediction of result.predictionsGenerated ?? []) {
      if (prediction.timestamp > this.#state.simulationTime) continue;
      upsertById(this.#state.predictions, deepClone(prediction));
      audit.predictionsGenerated.push(prediction.id);
    }
    for (const alert of result.alertsCreated ?? []) {
      if (!isVisibleAt(alert.eventTime, alert.recordedTime, this.#state.simulationTime)) continue;
      upsertById(this.#state.alerts, deepClone(alert));
      audit.alertsCreated.push(alert.id);
    }
    for (const alert of result.alertsUpdated ?? []) {
      if (!isVisibleAt(alert.eventTime, alert.recordedTime, this.#state.simulationTime)) continue;
      upsertById(this.#state.alerts, deepClone(alert));
      audit.alertsUpdated.push(alert.id);
    }
    const visibleEventIds = new Set(this.#state.events.map((event) => event.id));
    for (const claim of result.claimsUpdated ?? []) {
      if (
        claim.eventTime <= this.#state.simulationTime &&
        (claim.endTime === undefined || claim.endTime <= this.#state.simulationTime) &&
        claim.eventRefs.every((eventId) => visibleEventIds.has(eventId))
      ) {
        upsertById(this.#state.recordClaims, {
          ...deepClone(claim),
          validation: claim.validation ?? validateRecordClaim(
            claim,
            this.#state.events,
            this.#caseDefinition.encounter.startedAt,
          ),
        });
      }
    }
  }

  private createEmptyState(): MutableSimulationState {
    return {
      simulationTime: 0,
      events: [],
      observations: [],
      waveforms: [],
      medications: [],
      episodes: [],
      predictions: [],
      alerts: [],
      recordClaims: [],
      qualityStates: [],
      devices: this.#caseDefinition.devices.map((device) => deepClone(device)),
      activeFaults: [],
      eventGraph: [],
      auditEntries: [],
    };
  }

  private makeFrame(emittedEvents: SimulationEvent[]): SimulationFrame {
    return {
      simulationTime: this.#state.simulationTime,
      emittedEvents: deepClone(emittedEvents),
      snapshot: this.getSnapshot(),
    };
  }

  private publish(): SimulationSnapshot {
    return this.notify();
  }

  private notify(): SimulationSnapshot {
    const snapshot = this.getSnapshot();
    for (const listener of [...this.#listeners]) listener(deepClone(snapshot));
    return snapshot;
  }

  /** A read-only view for in-process engines; public snapshots stay defensive clones. */
  private createSnapshot(): SimulationSnapshot {
    return {
      scenarioId: this.#caseDefinition.scenarioId,
      seed: this.#caseDefinition.seed,
      simulationMetadata: this.#caseDefinition.simulationMetadata,
      scenarioManifest: this.#caseDefinition.scenarioManifest,
      simulationTime: this.#state.simulationTime,
      status: this.#clock.status,
      speed: this.#clock.speed,
      patient: this.#caseDefinition.patient,
      encounter: {
        ...this.#caseDefinition.encounter,
        status: this.#state.simulationTime >= this.#caseDefinition.encounter.scheduledDurationMs
          ? "COMPLETED"
          : this.#caseDefinition.encounter.status,
      },
      procedure: this.#caseDefinition.procedure,
      perioperativePhases: visiblePhases(this.#caseDefinition, this.#state.simulationTime),
      devices: this.#state.devices,
      observations: this.#state.observations,
      waveforms: visibleWaveforms(this.#state.waveforms, this.#state.simulationTime),
      medications: this.#state.medications,
      events: this.#state.events,
      episodes: this.#state.episodes,
      predictions: this.#state.predictions,
      alerts: this.#state.alerts,
      recordClaims: this.#state.recordClaims,
      qualityStates: this.#state.qualityStates,
      activeFaults: this.#state.activeFaults.map(({ id, enabledAt, eventId }) => ({ id, enabledAt, eventId })),
      eventGraph: this.#state.eventGraph,
      auditEntries: this.#state.auditEntries,
      processedEventCount: this.#state.events.length,
    };
  }

  private findDeviceForSource(source: string): SimulationDevice | undefined {
    return this.#state.devices.find((device) => device.id === source || device.sourceIds.includes(source));
  }
}

function isMedicationLifecycleEvent(eventType: string): boolean {
  return eventType === "MEDICATION_ORDERED" ||
    eventType === "MEDICATION_PROPOSED" ||
    eventType === "MEDICATION_PROPOSAL_MODIFIED" ||
    eventType === "MEDICATION_ADMINISTERED" ||
    eventType === "MEDICATION_INFUSION_STARTED" ||
    eventType === "MEDICATION_RATE_CHANGED" ||
    eventType === "MEDICATION_STOPPED";
}

function isEventGraphNode(event: SimulationEvent): boolean {
  return ![
    "OBSERVATION_BATCH_RECORDED",
    "WAVEFORM_SEGMENT_RECORDED",
    "PREDICTION_CREATED",
  ].includes(event.eventType) && !event.eventType.startsWith("RECORD_CLAIM_") &&
    !["RECORD_CAUSALITY_CONFIRMED", "RECORD_SIGNED"].includes(event.eventType);
}

function medicationStatusForEvent(eventType: string): MedicationRecord["status"] {
  switch (eventType) {
    case "MEDICATION_ORDERED": return "ORDERED";
    case "MEDICATION_PROPOSED":
    case "MEDICATION_PROPOSAL_MODIFIED": return "PROPOSED";
    case "MEDICATION_ADMINISTERED": return "ADMINISTERED";
    case "MEDICATION_INFUSION_STARTED": return "INFUSING";
    case "MEDICATION_RATE_CHANGED": return "RATE_CHANGED";
    case "MEDICATION_STOPPED": return "STOPPED";
    default: throw new RangeError("Unsupported medication lifecycle event: " + eventType);
  }
}

function isQualityStatus(value: unknown): value is import("../types/quality").QualityStatus {
  return value === "GOOD" || value === "DEGRADED" || value === "TECHNICAL_DROPOUT" ||
    value === "EXPECTED_INTERMITTENT" || value === "STRUCTURAL_NOT_MONITORED" ||
    value === "INVALIDATED_ARTIFACT" || value === "UNKNOWN" || value === "UNAVAILABLE";
}

function visiblePhases(simulationCase: SafeAnesSimulationCase, simulationTime: number) {
  return simulationCase.perioperativePhases
    .map((phase) => ({
      ...deepClone(phase),
      status: simulationTime < phase.startTime
        ? "FUTURE" as const
        : phase.endTime !== undefined && simulationTime >= phase.endTime
          ? "COMPLETED" as const
          : "CURRENT" as const,
    }));
}

/** A waveform segment is published progressively; future samples stay in the private case definition. */
function visibleWaveforms(waveforms: readonly WaveformSegment[], simulationTime: number): WaveformSegment[] {
  return waveforms.flatMap((waveform) => {
    if (waveform.eventTime > simulationTime || waveform.recordedTime > simulationTime) return [];
    if (waveform.sampleRateHz <= 0 || waveform.samples.length === 0) return [];

    const sampleIntervalMs = 1_000 / waveform.sampleRateHz;
    const firstSampleDelayMs = Math.max(0, waveform.recordedTime - waveform.eventTime);
    const availableCount = Math.max(0, Math.min(
      waveform.samples.length,
      Math.floor((simulationTime - waveform.eventTime - firstSampleDelayMs) / sampleIntervalMs) + 1
    ));
    if (availableCount === 0) return [];
    return [{ ...waveform, samples: waveform.samples.slice(0, availableCount) }];
  });
}

function upsertById<T extends { id: string }>(items: T[], value: T): void {
  const index = items.findIndex((item) => item.id === value.id);
  if (index === -1) items.push(value);
  else items[index] = value;
}

function recordPayload(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
}

function qualityKey(signal: string, sourceDevice: string): string {
  return `${signal}\u0000${sourceDevice}`;
}

function faultQualityId(activation: SimulationFaultActivation, signal: string): string {
  return `quality-fault-${activation.id.toLowerCase()}-${activation.eventId}-${signal.toLowerCase()}`;
}

function compareSimulationEvents(left: SimulationEvent, right: SimulationEvent): number {
  return left.eventTime - right.eventTime ||
    (left.recordedTime ?? left.eventTime) - (right.recordedTime ?? right.eventTime) ||
    left.id.localeCompare(right.id);
}

function observationIdsFor(eventType: string, payload: Record<string, unknown>): string[] {
  if (eventType === "OBSERVATION_RECORDED" && typeof payload.observationId === "string") {
    return [payload.observationId];
  }
  if (eventType === "OBSERVATION_BATCH_RECORDED" && Array.isArray(payload.observationIds)) {
    return payload.observationIds.filter((id): id is string => typeof id === "string");
  }
  return [];
}

function assertTime(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative elapsed time.`);
  }
}

function isVisibleAt(eventTime: number, recordedTime: number | undefined, simulationTime: number): boolean {
  return eventTime <= simulationTime && (recordedTime === undefined || recordedTime <= simulationTime);
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
