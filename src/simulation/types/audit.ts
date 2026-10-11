export interface SimulationAuditEntry {
  id: string;
  simulationTime: number;
  eventId: string;
  stateChanges: string[];
  rulesTriggered: string[];
  predictionsGenerated: string[];
  alertsCreated: string[];
  alertsUpdated: string[];
}
