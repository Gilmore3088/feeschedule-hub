import { formatAmount } from "@/lib/format";

interface DistributionBarProps {
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  width?: number;
  height?: number;
}

export function DistributionBar({
  min,
  p25,
  median,
  p75,
  max,
  width = 140,
  height = 20,
}: DistributionBarProps) {
  const cy = height / 2;
  const px = 6;

  if (min === null || max === null || median === null) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line
          x1={px}
          y1={cy}
          x2={width - px}
          y2={cy}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity={0.2}
        />
      </svg>
    );
  }

  const range = max - min;
  const scale = (v: number) =>
    range === 0
      ? width / 2
      : px + ((v - min) / range) * (width - px * 2);

  const minX = scale(min);
  const maxX = scale(max);
  const medX = scale(median);
  const p25X = p25 !== null ? scale(p25) : medX;
  const p75X = p75 !== null ? scale(p75) : medX;
  const bandH = 6;
  const tickH = 4;

  return (
    <svg width={width} height={height} aria-hidden="true">
      <title>
        {`Min: ${formatAmount(min)} | P25: ${formatAmount(p25)} | Median: ${formatAmount(median)} | P75: ${formatAmount(p75)} | Max: ${formatAmount(max)}`}
      </title>
      {/* Whisker line */}
      <line
        x1={minX}
        y1={cy}
        x2={maxX}
        y2={cy}
        stroke="currentColor"
        strokeWidth="1"
        opacity={0.25}
      />
      {/* Tick marks at min and max */}
      <line
        x1={minX}
        y1={cy - tickH / 2}
        x2={minX}
        y2={cy + tickH / 2}
        stroke="currentColor"
        strokeWidth="1"
        opacity={0.25}
      />
      <line
        x1={maxX}
        y1={cy - tickH / 2}
        x2={maxX}
        y2={cy + tickH / 2}
        stroke="currentColor"
        strokeWidth="1"
        opacity={0.25}
      />
      {/* IQR band */}
      <rect
        x={p25X}
        y={cy - bandH / 2}
        width={Math.max(p75X - p25X, 1)}
        height={bandH}
        rx={3}
        fill="currentColor"
        opacity={0.35}
      />
      {/* Median dot */}
      <circle
        cx={medX}
        cy={cy}
        r={3.5}
        fill="currentColor"
        opacity={0.85}
      />
    </svg>
  );
}
