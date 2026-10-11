/**
 * Formats a model output with significant digits so small non-zero values do
 * not collapse to a displayed zero. This does not change the output semantics.
 */
export function formatModelOutput(value: number): string {
  if (!Number.isFinite(value)) return "NOT_AVAILABLE";
  if (value === 0) return "0";

  return value.toPrecision(4)
    .replace(/(\.\d*?[1-9])0+(e[+-]?\d+)?$/i, "$1$2")
    .replace(/\.0+(e[+-]?\d+)?$/i, "$1");
}

/**
 * Formats a model output (probability or normalized risk score in [0, 1]) as a readable percentage.
 * Returns null if the value is not in [0, 1] (e.g. unbounded logits like auxiliary ventilation loss).
 */
export function formatModelPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
    return null;
  }
  const pct = value * 100;
  if (pct === 0) return "0%";
  if (pct >= 1) {
    return `${pct.toFixed(1)}%`;
  }
  if (pct >= 0.01) {
    return `${pct.toFixed(2)}%`;
  }
  return `${pct.toPrecision(2).replace(/(\.\d*?[1-9])0+(e[+-]?\d+)?$/i, "$1$2")}%`;
}
