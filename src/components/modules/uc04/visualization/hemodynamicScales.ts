/**
 * Physiological thresholds for UC04
 */
export const HPI_ALARM_THRESHOLD = 85;
export const SVR_ABNORMAL_THRESHOLD = 1000;

/**
 * Maps a numeric physiological parameter value to SVG track Y-coordinate.
 */
export function mapY(
  val: number,
  min: number,
  max: number,
  trackHeight: number = 72,
  topPad: number = 6,
  botPad: number = 6
): number {
  const usableH = trackHeight - topPad - botPad;
  const ratio = (val - min) / (max - min);
  return topPad + usableH * (1 - Math.max(0, Math.min(1, ratio)));
}

/**
 * Color tokens for hemodynamic domain semantics.
 */
export const HEMODYNAMIC_COLORS = {
  hpi: "#FF3348",
  map: "#F5E328",
  ci: "#4AF26F",
  sv: "#4AF26F",
  svv: "#A3E635",
  svr: "#F5E328",
  svrAbnormal: "#FF3348",
  preload: "#0284c7",
  contractility: "#15803d",
  afterload: "#b91c1c",
  cyanAccent: "#00C5FF",
  neutralDark: "#071018",
  trackBg: "#162234",
  borderLight: "rgba(100,170,210,0.32)",
} as const;
