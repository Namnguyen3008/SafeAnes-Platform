export type EpisodeType =
  | "RESPIRATORY_DESATURATION"
  | "RESPIRATORY_APNEA"
  | "RESPIRATORY_DETERIORATION_CANDIDATE"
  | "HYPOTENSION"
  | "IMPENDING_HYPOTENSION"
  | "SIGNAL_QUALITY_DEGRADATION";

export interface SimulationEpisode {
  id: string;
  type: EpisodeType;
  startTime: number;
  endTime?: number;
  status: "ACTIVE" | "RESOLVED";
  relatedEventIds: string[];
  summary: string;
}
