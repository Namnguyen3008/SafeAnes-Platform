const PHASE_LABEL_KEYS: Readonly<Record<string, string>> = {
  preoperative: "timeline.phases.preoperative",
  "or-preparation": "timeline.phases.orPreparation",
  induction: "timeline.phases.induction",
  maintenance: "timeline.phases.maintenance",
  surgery: "timeline.phases.surgery",
  closure: "timeline.phases.closure",
  emergence: "timeline.phases.emergence",
  "transfer-pacu": "timeline.phases.transferPacu",
  completed: "timeline.phases.completed",
};

export function getPerioperativePhaseLabel(
  phaseId: string,
  sourceLabel: string,
  translate: (key: string) => string
): string {
  const key = PHASE_LABEL_KEYS[phaseId];
  if (!key) return sourceLabel;

  const translated = translate(key);
  return translated === key ? sourceLabel : translated;
}
