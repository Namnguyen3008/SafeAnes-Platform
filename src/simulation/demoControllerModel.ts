export type SimulationQuickJumpId =
  | "start"
  | "induction"
  | "data-quality"
  | "medication-safety"
  | "hemodynamic-warning"
  | "low-map"
  | "respiratory"
  | "emergence"
  | "pacu";

export interface SimulationQuickJump {
  id: SimulationQuickJumpId;
  labelKey: string;
  elapsedMs: number;
}

export interface AutoDemoMilestone {
  id: string;
  elapsedMs: number;
  route: string;
  target: string;
}

const QUICK_JUMP_DEFINITIONS: ReadonlyArray<{
  id: SimulationQuickJumpId;
  labelKey: string;
  clockTime: string;
}> = [
  { id: "start", labelKey: "start", clockTime: "07:15" },
  { id: "induction", labelKey: "induction", clockTime: "08:05" },
  { id: "data-quality", labelKey: "dataQualityEvent", clockTime: "09:14" },
  { id: "medication-safety", labelKey: "medicationSafetyEvent", clockTime: "10:42" },
  { id: "hemodynamic-warning", labelKey: "hemodynamicWarning", clockTime: "10:29" },
  { id: "low-map", labelKey: "lowMapEpisode", clockTime: "10:31" },
  { id: "respiratory", labelKey: "respiratoryEvent", clockTime: "10:52" },
  { id: "emergence", labelKey: "emergence", clockTime: "11:45" },
  { id: "pacu", labelKey: "pacu", clockTime: "12:05" },
];

/** Converts a case-local clock time to elapsed milliseconds without using browser timezone settings. */
export function caseClockTimeToElapsedMs(clockTime: string, startedAt: string): number {
  const target = parseClockMinutes(clockTime);
  const startMatch = /T(\d{2}:\d{2})/.exec(startedAt);
  if (!startMatch) throw new RangeError("startedAt must include a valid local clock time.");

  const start = parseClockMinutes(startMatch[1]);
  const elapsedMinutes = (target - start + 24 * 60) % (24 * 60);
  return elapsedMinutes * 60_000;
}

export function getSimulationQuickJumps(startedAt: string): SimulationQuickJump[] {
  return QUICK_JUMP_DEFINITIONS.map(({ id, labelKey, clockTime }) => ({
    id,
    labelKey,
    elapsedMs: caseClockTimeToElapsedMs(clockTime, startedAt),
  }));
}

export function getAutoDemoMilestones(startedAt: string, caseId: string): AutoDemoMilestone[] {
  const casePath = `/safeanes/case/${encodeURIComponent(caseId)}`;
  return [
    { id: "data-quality", clockTime: "09:14", route: `${casePath}/situation`, target: "uc01-quality" },
    { id: "hemodynamic-warning", clockTime: "10:29", route: `${casePath}/hemodynamics`, target: "uc04-risk" },
    { id: "medication-safety", clockTime: "10:42", route: `${casePath}/medications`, target: "uc03-medication" },
    { id: "respiratory", clockTime: "10:52", route: `${casePath}/respiratory`, target: "uc05-respiratory" },
    {
      id: "evidence-review",
      clockTime: "10:54",
      route: `${casePath}/record?claim=claim-respiratory-no-breath&event=respiratory-no-breath-detected&time=10%3A54%3A00`,
      target: "uc02-evidence",
    },
  ].map((milestone) => ({
    ...milestone,
    elapsedMs: caseClockTimeToElapsedMs(milestone.clockTime, startedAt),
  }));
}

function parseClockMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid case clock time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Invalid case clock time: ${value}`);
  return hours * 60 + minutes;
}
