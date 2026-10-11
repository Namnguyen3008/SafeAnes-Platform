/** Convert a case-clock time to an SVG X coordinate within the shared window. */
export function timeToX(timeStr: string, width: number, rangeStart: string, rangeEnd: string): number {
  const start = toSeconds(rangeStart);
  let end = toSeconds(rangeEnd);
  if (end <= start) end += 24 * 3600;
  const time = toSeconds(timeStr);
  const adjustedTime = time < start && end >= 24 * 3600 ? time + 24 * 3600 : time;
  const span = end - start;
  if (span <= 0 || width <= 0) return 0;
  return Math.max(0, Math.min(1, (adjustedTime - start) / span)) * width;
}

/** Convert an SVG X coordinate back to case-clock time within the shared window. */
export function xToTime(x: number, width: number, rangeStart: string, rangeEnd: string): string {
  const ratio = width > 0 ? Math.max(0, Math.min(1, x / width)) : 0;
  const start = toSeconds(rangeStart);
  let end = toSeconds(rangeEnd);
  if (end <= start) end += 24 * 3600;
  const totalSec = (start + ratio * (end - start)) % (24 * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Evenly spaced labels for the same canonical case-clock trend window. */
export function buildTimeLabels(startTime: string, endTime: string, count: number, includeEnd = false): string[] {
  if (count <= 0) return [];
  const start = toSeconds(startTime);
  let end = toSeconds(endTime);
  if (end <= start) end += 24 * 3600;
  return Array.from({ length: count }, (_, index) => {
    const divisor = includeEnd ? Math.max(1, count - 1) : count;
    const value = Math.floor((start + ((end - start) * index) / divisor) % (24 * 3600));
    const hours = Math.floor(value / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((value % 3600) / 60).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  });
}

/** Map an ABP strip click to its actual visible waveform window, not the longer trend window. */
export function waveformTimeAtRatio(ratio: number, endTime: string, windowMs: number): string {
  if (!Number.isFinite(ratio) || !Number.isFinite(windowMs) || windowMs < 0) {
    throw new RangeError("Waveform time mapping requires a finite ratio and non-negative window.");
  }
  const endSeconds = toSeconds(endTime);
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const startSeconds = endSeconds - windowMs / 1_000;
  const totalSeconds = ((startSeconds + clampedRatio * (windowMs / 1_000)) % (24 * 60 * 60) + 24 * 60 * 60) % (24 * 60 * 60);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");
}

function toSeconds(timeStr: string): number {
  const parts = timeStr.replace(/\s*[AP]M/i, "").trim().split(":").map(Number);
  return (parts[0] || 0) * 3_600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}
