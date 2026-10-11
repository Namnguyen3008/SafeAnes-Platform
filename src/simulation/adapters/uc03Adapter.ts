import type { SafeAnesSimulationCase } from "../types/case";

/** Medication projection preserves the distinction between administered and proposed. */
export function adaptUc03(simulationCase: SafeAnesSimulationCase) {
  const medicationEventIds = new Set(
    simulationCase.events
      .filter((event) => event.eventType.startsWith("MEDICATION_"))
      .map((event) => event.id)
  );
  return {
    caseId: simulationCase.encounter.caseId,
    simulationTime: simulationCase.simulationTime,
    medications: simulationCase.medications,
    medicationEvents: simulationCase.events.filter((event) => medicationEventIds.has(event.id)),
    alerts: simulationCase.alerts.filter((alert) => alert.sourceModule === "UC03"),
  };
}
