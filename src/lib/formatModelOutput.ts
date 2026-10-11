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
