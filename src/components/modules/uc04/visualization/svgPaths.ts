/**
 * Convert polar to cartesian coordinates.
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

/**
 * Describe SVG Arc path clockwise from startAngle to endAngle.
 */
export function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const arcSweep = endAngle >= startAngle ? endAngle - startAngle : 360 - startAngle + endAngle;
  const largeArcFlag = arcSweep <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

/**
 * Convert data points to smooth SVG Bezier curve.
 */
export function pointsToSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Builds a compact sparkline from the visible replay-window measurements. */
export function valuesToPath(
  values: Array<number | null | undefined>,
  width: number,
  height: number,
  minValue: number,
  maxValue: number
): string {
  if (maxValue <= minValue || values.filter((value) => typeof value === "number" && Number.isFinite(value)).length < 2) return "";
  let hasPrevious = false;
  return values.flatMap((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      hasPrevious = false;
      return [];
    }
    const x = (index / Math.max(1, values.length - 1)) * width;
    const normalized = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
    const y = height - normalized * height;
    const command = hasPrevious ? "L" : "M";
    hasPrevious = true;
    return [`${command} ${x.toFixed(1)} ${y.toFixed(1)}`];
  }).join(" ");
}
