import type { SafeAnesSimulationCase } from "../types/case";

const respiratorySignals = new Set(["SPO2", "ETCO2", "RR", "CAPNOGRAM"]);

/** Respiratory projection keeps measured waveforms, episodes, and predictions separate. */
export function adaptUc05(simulationCase: SafeAnesSimulationCase) {
  return {
    caseId: simulationCase.encounter.caseId,
    simulationTime: simulationCase.simulationTime,
    observations: simulationCase.observations.filter((item) => respiratorySignals.has(item.signal)),
    waveforms: simulationCase.waveforms.filter((item) => item.signal === "CAPNOGRAM" || item.signal === "PLETH"),
    respiratoryEvents: simulationCase.events.filter((event) => {
      const payload = event.payload as { signal?: string; signals?: string[]; type?: string };
      return (
        (payload.signal !== undefined && respiratorySignals.has(payload.signal)) ||
        (payload.signals?.some((signal) => respiratorySignals.has(signal)) ?? false) ||
        payload.type === "RESPIRATORY_APNEA" ||
        payload.type === "RESPIRATORY_DESATURATION" ||
        payload.type === "RESPIRATORY_DETERIORATION_CANDIDATE"
      );
    }),
    episodes: simulationCase.episodes.filter((episode) => episode.type.startsWith("RESPIRATORY_")),
    predictions: simulationCase.predictions.filter((prediction) => prediction.task.includes("respiratory")),
    alerts: simulationCase.alerts.filter((alert) => alert.sourceModule === "UC05"),
  };
}
