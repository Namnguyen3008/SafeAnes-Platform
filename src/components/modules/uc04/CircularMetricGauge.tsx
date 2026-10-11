import React from "react";
import { polarToCartesian, describeArc } from "./visualization/svgPaths";

export interface GaugeZone {
  startPercent: number; // 0 to 100
  endPercent: number; // 0 to 100
  color: string;
}

export interface CircularMetricGaugeProps {
  label: string;
  subtitle?: string;
  value: number | string;
  unit: string;
  themeColor: string; // e.g. '#FF3348', '#F5E328', '#4AF26F'
  currentPercent: number | null; // 0 to 100; null means no current measurement/estimate
  zones?: GaugeZone[];
  valueColor?: string;
  topInnerLabel?: string;
  ticks?: {
    topLeft?: string;
    topRight?: string;
    topCenter?: string;
    bottomLeft?: string;
    bottomRight?: string;
  };
}

export function CircularMetricGauge({
  label,
  subtitle,
  value,
  unit,
  themeColor,
  currentPercent,
  zones,
  valueColor,
  topInnerLabel,
  ticks = {},
}: CircularMetricGaugeProps) {
  const size = 124;
  const cx = 62;
  const cy = 62;
  const radius = 43;
  const strokeWidth = 8.5;

  // Arc angles: start at 220° (bottom-left), sweep clockwise to 140° (bottom-right)
  // Total span = 280 degrees
  const startAngle = 220;
  const totalSpan = 280;

  // Compute angle for a given percentage (0..100)
  const getAngle = (pct: number) => {
    const clamped = Math.max(0, Math.min(1, pct));
    return (startAngle + (clamped / 100) * totalSpan) % 360;
  };

  // Active arc end angle
  const hasCurrentPercent = currentPercent !== null && Number.isFinite(currentPercent);
  const activeEndAngle = getAngle(hasCurrentPercent ? currentPercent : 0);

  // Tick notches percentages
  const notchPcts = [0, 25, 50, 75, 100];

  return (
    <div className="h-full flex flex-col items-center justify-between py-1 relative select-none">
      {/* Circular Gauge Centerpiece */}
      <div className="relative w-[124px] h-[124px] flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* Inner dark backdrop circle */}
          <circle cx={cx} cy={cy} r={radius - strokeWidth / 2 - 2} fill="#0A131B" />

          {/* Background Track Arc (full 280° span) */}
          <path
            d={describeArc(cx, cy, radius, startAngle, (startAngle + totalSpan) % 360)}
            fill="none"
            stroke="#162234"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Multi-color physiological background zones */}
          {zones &&
            zones.map((zone, idx) => {
              const zoneStart = getAngle(zone.startPercent);
              const zoneEnd = getAngle(zone.endPercent);
              return (
                <path
                  key={idx}
                  d={describeArc(cx, cy, radius, zoneStart, zoneEnd)}
                  fill="none"
                  stroke={zone.color}
                  strokeWidth={strokeWidth}
                  strokeOpacity={0.28}
                  strokeLinecap="butt"
                />
              );
            })}

          {/* Radial tick notches */}
          {notchPcts.map((pct, idx) => {
            const angle = getAngle(pct);
            const p1 = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 1, angle);
            const p2 = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 5, angle);
            return (
              <line
                key={idx}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="rgba(100,170,210,0.4)"
                strokeWidth="1.2"
              />
            );
          })}

          {/* Active Fill Arc */}
          {hasCurrentPercent && currentPercent > 0 && (
            <path
              d={describeArc(cx, cy, radius, startAngle, activeEndAngle)}
              fill="none"
              stroke={themeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )}

          {/* Indicator dot at current value */}
          {hasCurrentPercent && (() => {
            const pt = polarToCartesian(cx, cy, radius, activeEndAngle);
            return (
              <circle
                cx={pt.x}
                cy={pt.y}
                r={strokeWidth / 2 + 1.2}
                fill="#FFFFFF"
                stroke={themeColor}
                strokeWidth={2}
              />
            );
          })()}

          {/* Top Ticks positioned precisely around the arc */}
          {ticks.topCenter && (
            <text
              x={cx}
              y={cy - radius - 7}
              textAnchor="middle"
              fill="#AAB4BB"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {ticks.topCenter}
            </text>
          )}

          {ticks.topLeft && (
            <text
              x={cx - 30}
              y={cy - radius + 2}
              textAnchor="middle"
              fill="#AAB4BB"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {ticks.topLeft}
            </text>
          )}

          {ticks.topRight && (
            <text
              x={cx + 30}
              y={cy - radius + 2}
              textAnchor="middle"
              fill={themeColor}
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {ticks.topRight}
            </text>
          )}

          {/* Bottom Ticks */}
          {ticks.bottomLeft && (
            <text
              x={cx - radius + 5}
              y={cy + radius + 1}
              textAnchor="middle"
              fill="#AAB4BB"
              fontSize="9"
              fontFamily="monospace"
            >
              {ticks.bottomLeft}
            </text>
          )}

          {ticks.bottomRight && (
            <text
              x={cx + radius - 5}
              y={cy + radius + 1}
              textAnchor="middle"
              fill="#AAB4BB"
              fontSize="9"
              fontFamily="monospace"
            >
              {ticks.bottomRight}
            </text>
          )}
        </svg>

        {/* Central Numeric Value, Unit & Optional Top Inner Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {topInnerLabel && (
            <span className="text-[10px] text-[#AAB4BB] font-mono font-semibold leading-none mb-0.5">
              {topInnerLabel}
            </span>
          )}
          <span
            className="text-[36px] font-black font-mono tracking-tighter leading-none tabular-nums"
            style={{ color: valueColor || "#F4F6F7" }}
          >
            {value}
          </span>
          <span className="text-[11px] text-[#AAB4BB] font-mono leading-none mt-0.5">
            {unit}
          </span>
        </div>
      </div>

      {/* Metric Label and Subtitle */}
      <div className="text-center leading-tight -mt-1">
        <div className="text-[15px] font-bold text-[#F4F6F7] tracking-tight">{label}</div>
        <div className="text-[11px] text-[#AAB4BB] min-h-[14px]">
          {subtitle || ""}
        </div>
      </div>
    </div>
  );
}

export { CircularMetricGauge as HemodynamicGauge };
