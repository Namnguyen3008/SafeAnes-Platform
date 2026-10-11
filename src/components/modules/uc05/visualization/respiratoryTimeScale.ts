/** A replay-visible respiratory trend point projected from canonical observations. */
export interface TrendDataPoint {
  timestamp: number;
  timeStr: string;
  etco2: number | null;
  rr: number | null;
  spo2: number | null;
}

/**
 * Interpolates only between samples supplied by the replay projection. A null
 * endpoint remains unavailable, so missing signal is never drawn as zero.
 */
export function interpolateAtTimestamp(
  points: readonly TrendDataPoint[],
  timestamp: number,
  startTime: number,
  endTime: number,
): {
  etco2: number | null;
  rr: number | null;
  spo2: number | null;
  timeStr: string;
} {
  const clampedTime = Math.max(startTime, Math.min(endTime, timestamp));
  const timeStr = new Date(clampedTime).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Ho_Chi_Minh",
  });
  if (points.length === 0) return { etco2: null, rr: null, spo2: null, timeStr };

  const sorted = [...points].sort((left, right) => left.timestamp - right.timestamp);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (clampedTime < first.timestamp || clampedTime > last.timestamp) {
    return { etco2: null, rr: null, spo2: null, timeStr };
  }

  let rightIndex = sorted.findIndex((point) => point.timestamp >= clampedTime);
  if (rightIndex < 0) rightIndex = sorted.length - 1;
  const right = sorted[rightIndex];
  const left = sorted[Math.max(0, rightIndex - 1)];
  const ratio = right.timestamp === left.timestamp
    ? 0
    : Math.max(0, Math.min(1, (clampedTime - left.timestamp) / (right.timestamp - left.timestamp)));
  const interpolate = (a: number | null, b: number | null) =>
    a === null || b === null ? null : a + (b - a) * ratio;

  return {
    etco2: interpolate(left.etco2, right.etco2),
    rr: interpolate(left.rr, right.rr),
    spo2: interpolate(left.spo2, right.spo2),
    timeStr,
  };
}
