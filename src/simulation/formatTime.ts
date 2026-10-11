/** Formats case wall time from its local start clock and elapsed simulation time. */
export function formatCaseTime(startedAt: string, elapsedMs: number): string {
  const match = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(startedAt);
  const startSeconds = match
    ? Number(match[1]) * 3_600 + Number(match[2]) * 60 + Number(match[3] ?? 0)
    : 0;
  const totalSeconds = (startSeconds + Math.floor(elapsedMs / 1_000)) % 86_400;
  const hours = Math.floor(totalSeconds / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3_600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3_600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
