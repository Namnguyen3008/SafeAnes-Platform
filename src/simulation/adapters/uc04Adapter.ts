import type { SafeAnesSimulationCase } from "../types/case";
import type { SimulationSnapshot } from "../types/replay";

const hemodynamicSignals = new Set(["MAP", "SBP", "DBP", "HR", "CI", "SV", "SVV", "SVR", "ABP"]);

/** Hemodynamic projection filters canonical measured signals and shared episodes. */
export function adaptUc04(simulationCase: SafeAnesSimulationCase | SimulationSnapshot) {
  return {
    caseId: simulationCase.encounter.caseId,
    simulationTime: simulationCase.simulationTime,
    observations: simulationCase.observations.filter((item) => hemodynamicSignals.has(item.signal)),
    waveforms: simulationCase.waveforms.filter((item) => item.signal === "ABP"),
    events: simulationCase.events.filter((event) => {
      const payload = event.payload as {
        signal?: string;
        signals?: string[];
        type?: string;
        temporalRelation?: { relationship?: string };
      };
      return payload.signal
        ? hemodynamicSignals.has(payload.signal)
        : payload.signals?.some((signal) => hemodynamicSignals.has(signal)) ??
          (payload.type === "HYPOTENSION" || payload.temporalRelation?.relationship === "OVERLAPS");
    }),
    episodes: simulationCase.episodes.filter((episode) =>
      episode.type === "HYPOTENSION" || episode.type === "IMPENDING_HYPOTENSION"
    ),
    predictions: simulationCase.predictions.filter((prediction) =>
      prediction.modelId === "SAFEANES-DEMO-HPI" || prediction.task.includes("hemodynamic")
    ),
    alerts: simulationCase.alerts.filter((alert) => alert.sourceModule === "UC04"),
    eventGraph: "eventGraph" in simulationCase ? simulationCase.eventGraph : [],
    scenarioManifest: simulationCase.scenarioManifest,
  };
}
