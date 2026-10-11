export interface ReplayEventSelection {
  timestamp: number;
}

/** Keep evidence selection synchronized with replay snapshots without dropping
 * the event that initiated a backward seek. */
export function retainReplayEventSelectionAtTime<T extends ReplayEventSelection>(
  selection: T | null,
  currentTimeSeconds: number,
): T | null {
  if (!selection || !Number.isFinite(selection.timestamp) ||
    !Number.isFinite(currentTimeSeconds) || selection.timestamp > currentTimeSeconds) {
    return null;
  }
  return selection;
}
