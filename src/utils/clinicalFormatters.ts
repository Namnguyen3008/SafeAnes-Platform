/**
 * Standard clinical time and vital formatters for SafeAnes Workstation.
 */

/**
 * Formats a duration in seconds into clinical digital clock format (HH:MM:SS).
 * e.g. 9855 -> "02:44:15"
 */
export function formatSecondsToClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats an epoch millisecond timestamp into 12-hour AM/PM string.
 * e.g. 1717404240000 -> "10:44:00 AM"
 */
export function formatTimestampToTimeStr(timestampMs: number): string {
  const date = new Date(timestampMs);
  if (isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * Formats arterial blood pressure as systolic / diastolic string.
 * e.g. (104, 52) -> "104/52"
 */
export function formatBloodPressure(
  sbp?: number | null,
  dbp?: number | null
): string {
  if (sbp === undefined || sbp === null || dbp === undefined || dbp === null) {
    return "--/--";
  }
  return `${Math.round(sbp)}/${Math.round(dbp)}`;
}

/**
 * Formats clinical duration in minutes into human-readable hours and minutes.
 * e.g. 164 -> "2h 44m"
 */
export function formatMinutesToHumanDuration(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
