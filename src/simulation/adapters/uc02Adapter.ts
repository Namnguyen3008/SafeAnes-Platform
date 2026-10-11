import type { ClinicalClaim, ClinicalEvent, PatientDemographics, CaseErrorMetrics } from "@/types/uc02";
import type { RecordClaim, RecordClaimValidation } from "../types/claims";
import type { SimulationEvent } from "../types/events";
import type { SimulationSnapshot } from "../types/replay";
import { formatCaseTime } from "../formatTime";
import { getTemporalRelationship } from "../engines/uc02";

type Payload = Record<string, unknown>;

/** UC02 is a projection of the shared replay snapshot; it owns no event history. */
export function adaptUc02(snapshot: SimulationSnapshot, locale: "en" | "vi" = "en") {
  const eventGraph = snapshot.eventGraph ?? [];
  const events = adaptEvents(snapshot, locale);
  const claims = snapshot.recordClaims.map((claim) => adaptClaim(claim, snapshot, locale));
  const patient = adaptPatient(snapshot, locale);
  const errorMetrics = calculateErrorMetrics(snapshot.recordClaims);

  return {
    caseId: snapshot.encounter.caseId,
    events,
    claims,
    evidenceEvents: snapshot.events,
    observations: snapshot.observations,
    qualityStates: snapshot.qualityStates,
    alerts: snapshot.alerts.filter((alert) => alert.sourceModule === "UC02"),
    patient,
    errorMetrics,
    eventGraph,
    simulationTime: snapshot.simulationTime,
    canonicalEventCount: events.length,
    clinicalEpisodeCount: snapshot.episodes.length,
    caseStartedAt: snapshot.encounter.startedAt,
    timelineStartTime: formatCaseTime(snapshot.encounter.startedAt, 0).slice(0, 5),
    timelineDurationMs: snapshot.encounter.scheduledDurationMs,
    timelineTrackValues: getTimelineTrackValues(snapshot, locale),
    synthetic: snapshot.simulationMetadata.synthetic,
  };
}

function getTimelineTrackValues(snapshot: SimulationSnapshot, locale: "en" | "vi") {
  const latest = (signal: string) => snapshot.observations
    .filter((observation) => observation.signal === signal && observation.eventTime <= snapshot.simulationTime &&
      observation.receivedTime <= snapshot.simulationTime && !observation.imputed &&
      snapshot.simulationTime - observation.receivedTime <= 45_000 &&
      !["TECHNICAL_DROPOUT", "EXPECTED_INTERMITTENT", "STRUCTURAL_NOT_MONITORED", "INVALIDATED_ARTIFACT", "UNKNOWN", "UNAVAILABLE"].includes(observation.quality.status))
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const signalQuality = (signal: string) => snapshot.qualityStates
    .filter((quality) => quality.signal === signal && quality.eventTime <= snapshot.simulationTime &&
      (quality.validUntilTime === undefined || snapshot.simulationTime < quality.validUntilTime))
    .sort((left, right) => right.eventTime - left.eventTime)[0]?.status;
  const currentQuality = snapshot.qualityStates
    .filter((quality) => quality.eventTime <= snapshot.simulationTime &&
      (quality.validUntilTime === undefined || snapshot.simulationTime < quality.validUntilTime) &&
      quality.status !== "GOOD")
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const latestMedication = snapshot.medications
    .filter((medication) => medication.eventTime <= snapshot.simulationTime)
    .sort((left, right) => right.eventTime - left.eventTime)[0];
  const currentPhase = snapshot.perioperativePhases
    .filter((phase) => phase.startTime <= snapshot.simulationTime &&
      (phase.endTime === undefined || snapshot.simulationTime < phase.endTime))
    .sort((left, right) => right.startTime - left.startTime)[0];
  const hr = latest("HR");
  const map = isUnavailableQuality(signalQuality("MAP")) ? undefined : latest("MAP");
  const rr = latest("RR");
  const etco2 = isUnavailableQuality(signalQuality("ETCO2")) ? undefined : latest("ETCO2");
  const mapQuality = signalQuality("MAP") ?? map?.quality.status ?? "UNKNOWN";
  const etco2Quality = signalQuality("ETCO2") ?? etco2?.quality.status ?? "UNKNOWN";

  return {
    physiology: {
      value: map ? `${Number(map.value).toFixed(0)} ${map.unit}` : "—",
      status: `${hr ? `HR ${Number(hr.value).toFixed(0)}` : "HR —"} · ${localizedQuality(mapQuality, locale)}`,
    },
    medication: { value: latestMedication?.name ?? "—", status: latestMedication ? localizedMedicationStatus(latestMedication.status, locale) : localizedNoEvent(locale) },
    airway_procedure: {
      value: currentPhase ? (locale === "vi" ? translatePhaseLabel(currentPhase.label) : currentPhase.label) : "—",
      status: currentPhase ? (locale === "vi" ? "ĐANG DIỄN RA" : "ACTIVE") : (locale === "vi" ? "CHƯA CÓ GIAI ĐOẠN" : "NO PHASE"),
    },
    ventilation: {
      value: etco2 ? `${Number(etco2.value).toFixed(0)} ${etco2.unit}` : "—",
      status: `${rr ? `RR ${Number(rr.value).toFixed(0)}` : "RR —"} · ${localizedQuality(etco2Quality, locale)}`,
    },
    fluid_blood: { value: "—", status: localizedNoEvent(locale) },
    data_quality: {
      value: currentQuality?.signal ?? (locale === "vi" ? "Tín hiệu" : "Signals"),
      status: currentQuality ? localizedQuality(currentQuality.status, locale) : (locale === "vi" ? "TỐT" : "GOOD"),
    },
  } satisfies Record<ClinicalEvent["trackId"], { value: string; status: string }>;
}

function localizedNoEvent(locale: "en" | "vi"): string {
  return locale === "vi" ? "KHÔNG CÓ SỰ KIỆN" : "NO EVENT";
}

function localizedMedicationStatus(status: string, locale: "en" | "vi"): string {
  if (locale !== "vi") return status;
  const labels: Record<string, string> = {
    ORDERED: "ĐÃ Y LỆNH",
    PROPOSED: "ĐỀ XUẤT",
    ADMINISTERED: "ĐÃ DÙNG",
    INFUSING: "ĐANG TRUYỀN",
    STOPPED: "ĐÃ DỪNG",
    RATE_CHANGED: "ĐÃ ĐỔI TỐC ĐỘ",
  };
  return labels[status] ?? status;
}

function localizedQuality(status: string, locale: "en" | "vi"): string {
  if (locale !== "vi") return status;
  const labels: Record<string, string> = {
    GOOD: "TỐT",
    DEGRADED: "SUY GIẢM",
    TECHNICAL_DROPOUT: "MẤT TÍN HIỆU KỸ THUẬT",
    EXPECTED_INTERMITTENT: "GIÁN ĐOẠN THEO DỰ KIẾN",
    STRUCTURAL_NOT_MONITORED: "KHÔNG THEO DÕI",
    INVALIDATED_ARTIFACT: "NHIỄU KHÔNG HỢP LỆ",
    UNKNOWN: "CHƯA RÕ",
    UNAVAILABLE: "KHÔNG KHẢ DỤNG",
    DISCONNECTED: "MẤT KẾT NỐI",
  };
  return labels[status] ?? status;
}

function adaptEvents(snapshot: SimulationSnapshot, locale: "en" | "vi"): ClinicalEvent[] {
  const eventGraph = snapshot.eventGraph ?? [];
  const sourceEvents = snapshot.events;
  const visibleEvents = new Set(sourceEvents.map((event) => event.id));
  return sourceEvents
    .filter(isTimelineEvent)
    .map((event) => {
      const payload = objectPayload(event.payload);
      const trackId = getTrack(event);
      const intervalEnd = event.eventType === "EPISODE_DETECTED" || event.eventType === "SIGNAL_QUALITY_CHANGED" || event.eventType === "DEVICE_LATENCY_INCREASED"
        ? getIntervalEnd(event, sourceEvents)
        : undefined;
      const isStartMarker = intervalEnd !== undefined;
      const relations = eventGraph
        .filter((edge) => edge.eventId === event.id && visibleEvents.has(edge.relatedEventId))
        .map((edge) => ({ targetEventId: edge.relatedEventId, relation: edge.relationship }));
      const relatedBy = eventGraph
        .filter((edge) => edge.relatedEventId === event.id && visibleEvents.has(edge.eventId))
        .map((edge) => ({ targetEventId: edge.eventId, relation: invertRelation(edge.relationship) }));
      const name = getEventName(event, payload, locale);
      const value = getEventValue(event, payload);

      return {
        id: event.id,
        type: event.eventType.toLowerCase(),
        name,
        subText: getEventDescription(event, payload),
        startTime: formatCaseTime(snapshot.encounter.startedAt, event.eventTime).slice(0, 5),
        endTime: isStartMarker ? formatCaseTime(snapshot.encounter.startedAt, intervalEnd!).slice(0, 5) : undefined,
        eventTime: event.eventTime,
        recordedTime: event.recordedTime,
        evidenceRefs: event.evidenceRefs ?? [],
        quality: event.quality?.status,
        trackId,
        visualType: getVisualType(event, isStartMarker),
        semanticColor: getSemanticColor(event, trackId),
        doseOrValue: value,
        sourceDevice: event.source,
        temporalRelations: [...relations, ...relatedBy],
        provenance: event.provenance,
      };
    });
}

function adaptClaim(claim: RecordClaim, snapshot: SimulationSnapshot, locale: "en" | "vi"): ClinicalClaim {
  const validation = claim.validation ?? invalidValidation();
  const linkedEvents = claim.eventRefs
    .map((eventId) => snapshot.events.find((event) => event.id === eventId))
    .filter(isDefined);
  const sourceEvent = claim.conceptId === "HEMODYNAMIC_RESPONSE_ASSOCIATION"
    ? linkedEvents.find((event) => event.eventType === "EPISODE_DETECTED") ?? linkedEvents[0]
    : linkedEvents[0];
  const evidenceDetails = claim.evidenceRefs.map((reference) => ({
    ...reference,
    clinicalTime: formatCaseTime(snapshot.encounter.startedAt, reference.eventTime).slice(0, 5),
  }));
  const relatedEvents = linkedEvents.filter((event) => event.id !== sourceEvent?.id).map((event) => {
    const relation = relationBetween(sourceEvent ?? event, event, snapshot);
    const payload = objectPayload(event.payload);
    const dose = typeof payload.dose === "number" && typeof payload.doseUnit === "string"
      ? `${payload.dose} ${payload.doseUnit}`
      : undefined;
    return {
      targetEventId: event.id,
      name: getEventName(event, payload, locale),
      dose,
      time: formatCaseTime(snapshot.encounter.startedAt, event.eventTime).slice(0, 5),
      relationship: claim.causalityConfirmation?.targetEventId === event.id ? "TREATED_BY" : relation,
      clinicianConfirmedCausality: claim.causalityConfirmation?.targetEventId === event.id,
    };
  });
  const sourceDevice = sourceEvent?.source ?? evidenceDetails[0]?.source;
  const device = snapshot.devices.find((candidate) =>
    candidate.id === sourceDevice || candidate.sourceIds.includes(sourceDevice ?? ""),
  );
  const matchingQuality = sourceEvent
    ? snapshot.qualityStates
      .filter((quality) => quality.sourceDevice === sourceEvent.source && quality.eventTime <= sourceEvent.eventTime &&
        (quality.validUntilTime === undefined || quality.validUntilTime >= sourceEvent.eventTime))
      .sort((left, right) => right.eventTime - left.eventTime)[0]
    : undefined;
  const sourceQuality = sourceEvent?.quality?.status ?? matchingQuality?.status ?? "UNKNOWN";
  const start = claim.clinicalTime?.start ?? claim.eventTime;
  const end = claim.clinicalTime?.end ?? claim.endTime;

  return {
    id: claim.id,
    section: sectionForClaim(claim.section),
    propositionType: claim.conceptId ?? claim.section,
    text: claim.localizedText?.[locale] ?? claim.text,
    clinicalTime: {
      start: formatCaseTime(snapshot.encounter.startedAt, start).slice(0, 5),
      end: end === undefined ? undefined : formatCaseTime(snapshot.encounter.startedAt, end).slice(0, 5),
    },
    evidenceRefs: claim.eventRefs,
    evidenceDetails,
    provenance: claim.provenance,
    reviewStatus: claim.reviewStatus,
    validation: {
      numeric: validation.number,
      unit: validation.unit && validation.dose,
      temporal: validation.timestamp && validation.interval,
      evidence: validation.evidenceId,
      terminology: validation.entity && validation.conceptIdentity,
    },
    validationDetails: validation,
    conceptId: claim.conceptId,
    entityId: claim.entityId,
    derivation: claim.derivation,
    rejectionReason: claim.rejectionReason as ClinicalClaim["rejectionReason"],
    terminologyTerm: claim.terminologyTerm ?? claim.conceptId,
    ruleId: claim.derivation?.threshold ? "DEMO-MAP-THRESHOLD" : undefined,
    sourceStream: sourceDevice,
    observations: evidenceDetails.map((evidence) => ({
      time: formatCaseTime(snapshot.encounter.startedAt, evidence.eventTime).slice(0, 5),
      value: evidence.value ?? "Canonical event reference",
      sensor: evidence.source,
    })),
    deviceQuality: sourceDevice ? [{
      device: sourceDevice,
      signalQuality: sourceQuality,
      clockUncertainty: device ? `${device.clockOffsetMs > 0 ? "+" : ""}${device.clockOffsetMs} ms` : "Not reported",
    }] : [],
    relatedEvents,
    duration: end === undefined ? undefined : `${Math.round((end - start) / 60_000)} min`,
  };
}

function relationBetween(event: SimulationEvent, relatedEvent: SimulationEvent, snapshot: SimulationSnapshot): string {
  const eventGraph = snapshot.eventGraph ?? [];
  const direct = eventGraph.find((edge) => edge.eventId === event.id && edge.relatedEventId === relatedEvent.id);
  if (direct) return direct.relationship;
  const reverse = eventGraph.find((edge) => edge.eventId === relatedEvent.id && edge.relatedEventId === event.id);
  if (reverse) {
    if (reverse.relationship === "BEFORE") return "AFTER";
    if (reverse.relationship === "AFTER") return "BEFORE";
    return reverse.relationship;
  }
  return getTemporalRelationship(event, relatedEvent, snapshot.events);
}

function adaptPatient(snapshot: SimulationSnapshot, locale: "en" | "vi"): PatientDemographics {
  const { patient, procedure } = snapshot;
  const firstMap = snapshot.observations.find((observation) => observation.signal === "MAP");
  const cardiacIndex = snapshot.observations.find((observation) => observation.signal === "CI");
  return {
    ageSex: locale === "vi"
      ? `${patient.ageYears} tuổi / ${patient.sex === "Female" ? "Nữ" : patient.sex === "Male" ? "Nam" : patient.sex}`
      : `${patient.ageYears}y / ${patient.sex === "Female" ? "F" : patient.sex === "Male" ? "M" : patient.sex}`,
    allergies: patient.allergies.length
      ? patient.allergies.map((allergy) => `${allergy.substance} (${allergy.severity})`).join(", ")
      : "—",
    weightBmi: `${patient.weightKg} kg`,
    comorbidities: patient.comorbidities.length ? patient.comorbidities.join(", ") : "—",
    asaStatus: `ASA ${patient.asa}`,
    preopMap: firstMap ? `${Math.round(firstMap.value)} ${firstMap.unit}` : "Not recorded",
    procedure: procedure.name,
    baselineCi: cardiacIndex ? `${Number(cardiacIndex.value).toFixed(1)} ${cardiacIndex.unit}` : "Not recorded",
    anesthesia: procedure.anesthesia,
    fluidStatus: "—",
    orNumber: procedure.operatingRoom,
    caseId: snapshot.encounter.caseId,
  };
}

function calculateErrorMetrics(claims: readonly RecordClaim[]): CaseErrorMetrics {
  const validations = claims.map((claim) => claim.validation ?? invalidValidation());
  return {
    unsupportedClaims: validations.filter((validation) => !validation.evidenceId).length,
    omittedFacts: null,
    temporalErrors: validations.filter((validation) => !validation.timestamp || !validation.interval).length,
    wrongValues: validations.filter((validation) => !validation.number || !validation.unit || !validation.dose).length,
    terminologyIssues: validations.filter((validation) => !validation.entity || !validation.conceptIdentity).length,
    provenanceIssues: claims.filter((claim) => !claim.provenance).length,
  };
}

function isTimelineEvent(event: SimulationEvent): boolean {
  return !["OBSERVATION_BATCH_RECORDED", "WAVEFORM_SEGMENT_RECORDED", "PREDICTION_CREATED", "DEVICE_HEARTBEAT"].includes(event.eventType) &&
    !event.eventType.startsWith("RECORD_CLAIM_") &&
    !["RECORD_CAUSALITY_CONFIRMED", "RECORD_SIGNED"].includes(event.eventType);
}

function getTrack(event: SimulationEvent): ClinicalEvent["trackId"] {
  if (event.eventType.startsWith("MEDICATION_")) return "medication";
  if (event.eventType.includes("RESPIRATORY") || event.id.startsWith("respiratory-no-breath")) return "ventilation";
  if (event.eventType === "EPISODE_DETECTED" || event.eventType === "EPISODE_RESOLVED" || event.eventType.includes("HEMODYNAMIC")) return "physiology";
  if (event.eventType.startsWith("SIGNAL_QUALITY") || event.eventType.startsWith("DEVICE_LATENCY")) return "data_quality";
  if (event.eventType.includes("AIRWAY") || event.eventType.includes("PROCEDURE") || event.eventType === "PHASE_STARTED") return "airway_procedure";
  return "airway_procedure";
}

function getVisualType(event: SimulationEvent, isIntervalStart: boolean): ClinicalEvent["visualType"] {
  if (event.eventType.startsWith("SIGNAL_QUALITY") || event.eventType.startsWith("DEVICE_LATENCY")) {
    return isIntervalStart ? "data_quality_hatched" : "point_marker";
  }
  if (event.eventType === "MEDICATION_INFUSION_STARTED") return "infusion";
  if (event.eventType === "MEDICATION_ADMINISTERED") return "med_bolus";
  if (isIntervalStart) return "interval_band";
  return "point_marker";
}

function getSemanticColor(event: SimulationEvent, track: ClinicalEvent["trackId"]): string {
  if (event.eventType === "ALERT_RAISED") return "var(--safe-red, #EF4444)";
  if (track === "data_quality") return "var(--safe-yellow, #EAB308)";
  if (track === "medication") return "var(--safe-blue, #2563EB)";
  if (track === "ventilation") return "var(--safe-cyan, #00E5FF)";
  if (track === "physiology") return "var(--safe-orange, #F97316)";
  return "var(--safe-green, #22C55E)";
}

function getEventName(event: SimulationEvent, payload: Payload, locale: "en" | "vi"): string {
  if (typeof payload.name === "string") return payload.name;
  if (typeof payload.label === "string") {
    return locale === "vi" ? translatePhaseLabel(payload.label) : payload.label;
  }
  if (locale === "vi") {
    const vietnamese: Record<string, string> = {
      CASE_STARTED: "Bắt đầu khu chờ tiền mê",
      PATIENT_ENTERED_OR: "Bệnh nhân vào phòng mổ",
      AIRWAY_SECURED: "Đã kiểm soát đường thở",
      PROCEDURE_STARTED: "Bắt đầu phẫu thuật",
      CASE_COMPLETED: "Hoàn tất ca mổ",
      MEDICATION_ADMINISTERED: "Đã dùng thuốc",
      MEDICATION_INFUSION_STARTED: "Bắt đầu truyền thuốc",
      MEDICATION_PROPOSED: "Đề xuất thuốc mô phỏng",
      EPISODE_DETECTED: "Phát hiện đợt lâm sàng",
      EPISODE_RESOLVED: "Đợt lâm sàng kết thúc",
      SIGNAL_QUALITY_CHANGED: "Chất lượng tín hiệu thay đổi",
      SIGNAL_QUALITY_RESTORED: "Chất lượng tín hiệu được khôi phục",
      DEVICE_LATENCY_INCREASED: "Độ trễ cổng thiết bị tăng",
      DEVICE_LATENCY_RECOVERED: "Độ trễ cổng thiết bị trở lại bình thường",
      HEMODYNAMIC_TREND_CHANGED: "Xu hướng MAP thay đổi",
      RESPIRATORY_MORPHOLOGY_CHANGED: "Hình thái capnogram thay đổi",
      RESPIRATORY_RATE_TREND_CHANGED: "Tần số hô hấp giảm",
      ALERT_RAISED: "Cảnh báo hô hấp mô phỏng",
      PHASE_STARTED: "Bắt đầu giai đoạn phẫu thuật",
      PATIENT_TRANSFERRED: "Chuyển bệnh nhân",
    };
    if (vietnamese[event.eventType]) return vietnamese[event.eventType];
  }
  const labels: Record<string, string> = {
    CASE_STARTED: "Pre-op holding",
    PATIENT_ENTERED_OR: "Patient entered OR",
    AIRWAY_SECURED: "Airway secured",
    PROCEDURE_STARTED: "Surgery started",
    CASE_COMPLETED: "Case complete",
    MEDICATION_ADMINISTERED: "Medication administered",
    MEDICATION_INFUSION_STARTED: "Medication infusion started",
    MEDICATION_PROPOSED: "Medication proposed",
    EPISODE_DETECTED: typeof payload.type === "string" ? payload.type.replaceAll("_", " ") : "Clinical episode detected",
    EPISODE_RESOLVED: "Episode resolved",
    SIGNAL_QUALITY_CHANGED: `${String(payload.signal ?? "Signal")} quality changed`,
    SIGNAL_QUALITY_RESTORED: `${String(payload.signal ?? "Signal")} quality restored`,
    DEVICE_LATENCY_INCREASED: "Device gateway latency increased",
    DEVICE_LATENCY_RECOVERED: "Device gateway latency recovered",
    HEMODYNAMIC_TREND_CHANGED: "MAP trend changed",
    RESPIRATORY_MORPHOLOGY_CHANGED: "Capnogram morphology changed",
    RESPIRATORY_RATE_TREND_CHANGED: "Respiratory rate decreased",
    ALERT_RAISED: "Synthetic respiratory alert",
    PHASE_STARTED: "Perioperative phase started",
    PATIENT_TRANSFERRED: "Patient transferred",
  };
  return labels[event.eventType] ?? event.eventType.replaceAll("_", " ").toLowerCase();
}

function translatePhaseLabel(label: string): string {
  const labels: Record<string, string> = {
    "Pre-op Holding": "Khu chờ tiền mê",
    "Operating room preparation": "Chuẩn bị phòng mổ",
    Induction: "Khởi mê",
    Maintenance: "Duy trì mê",
    Surgery: "Phẫu thuật",
    Closure: "Đóng vết mổ",
    Emergence: "Thức tỉnh",
    "Transfer / PACU": "Chuyển / Hồi tỉnh",
    "Case complete": "Hoàn tất ca mổ",
  };
  return labels[label] ?? label;
}

function getEventDescription(event: SimulationEvent, payload: Payload): string | undefined {
  for (const key of ["reason", "observation", "location", "destination", "procedure", "thresholdLabel"]) {
    if (typeof payload[key] === "string") return payload[key] as string;
  }
  if (event.eventType === "MEDICATION_PROPOSED" && payload.proposalOnly === true) return "Synthetic proposed medication; not an administration.";
  return undefined;
}

function getEventValue(event: SimulationEvent, payload: Payload): string | undefined {
  if (typeof payload.dose === "number" && typeof payload.doseUnit === "string") {
    return `${payload.dose} ${payload.doseUnit}${typeof payload.route === "string" ? ` ${payload.route}` : ""}`;
  }
  if (typeof payload.mapMmHg === "number") return `MAP ${payload.mapMmHg} mmHg`;
  if (typeof payload.latencyMs === "number") return `${payload.latencyMs} ms`;
  if (typeof payload.quality === "string") return payload.quality;
  if (typeof payload.status === "string") return payload.status;
  if (typeof payload.signal === "string") return payload.signal;
  return event.quality?.status;
}

function getIntervalEnd(event: SimulationEvent, events: readonly SimulationEvent[]): number | undefined {
  const payload = objectPayload(event.payload);
  const episodeId = typeof payload.episodeId === "string" ? payload.episodeId : undefined;
  const signal = typeof payload.signal === "string" ? payload.signal : undefined;
  const endEvent = events.find((candidate) => {
    const candidatePayload = objectPayload(candidate.payload);
    if (episodeId) return candidate.eventType === "EPISODE_RESOLVED" && candidatePayload.episodeId === episodeId;
    return candidate.source === event.source && candidatePayload.signal === signal &&
      ["SIGNAL_QUALITY_RESTORED", "DEVICE_LATENCY_RECOVERED"].includes(candidate.eventType);
  });
  return endEvent?.eventTime;
}

function sectionForClaim(section: RecordClaim["section"]): ClinicalClaim["section"] {
  switch (section) {
    case "AIRWAY": return "airway";
    case "VENTILATION": return "ventilation";
    case "HEMODYNAMICS": return "hemodynamics";
    case "MEDICATIONS": return "medications";
    case "WORKFLOW": return "major_events";
  }
}

function invalidValidation(): RecordClaimValidation {
  return { number: false, unit: false, dose: false, timestamp: false, interval: false, entity: false, evidenceId: false, conceptIdentity: false };
}

function isUnavailableQuality(status: string | undefined): boolean {
  return status !== undefined && [
    "TECHNICAL_DROPOUT",
    "EXPECTED_INTERMITTENT",
    "STRUCTURAL_NOT_MONITORED",
    "INVALIDATED_ARTIFACT",
    "UNKNOWN",
    "UNAVAILABLE",
  ].includes(status);
}

function objectPayload(value: unknown): Payload {
  return typeof value === "object" && value !== null ? value as Payload : {};
}

function invertRelation(relation: string): NonNullable<ClinicalEvent["temporalRelations"]>[number]["relation"] {
  if (relation === "BEFORE") return "AFTER";
  if (relation === "AFTER") return "BEFORE";
  return relation as NonNullable<ClinicalEvent["temporalRelations"]>[number]["relation"];
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
