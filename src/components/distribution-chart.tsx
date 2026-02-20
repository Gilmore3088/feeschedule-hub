import { formatAmount } from "@/lib/format";

interface DistributionChartProps {
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
}

export function DistributionChart({
  min,
  p25,
  median,
  p75,
  max,
}: DistributionChartProps) {
  if (min == null || max == null || median == null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-6 py-8 text-center">
        <p className="text-sm text-slate-400">Insufficient data for distribution chart</p>
      </div>
    );
  }

  const width = 480;
  const height = 80;
  const px = 40;
  const cy = 36;
  const range = max - min;

  const scale = (v: number) =>
    range === 0
      ? width / 2
      : px + ((v - min) / range) * (width - px * 2);

  const minX = scale(min);
  const maxX = scale(max);
  const medX = scale(median);
  const p25X = p25 != null ? scale(p25) : medX;
  const p75X = p75 != null ? scale(p75) : medX;
  const bandH = 16;
  const tickH = 10;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Price Distribution
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-lg" aria-label="Fee distribution chart">
        <title>
          {`Min: ${formatAmount(min)} | P25: ${formatAmount(p25)} | Median: ${formatAmount(median)} | P75: ${formatAmount(p75)} | Max: ${formatAmount(max)}`}
        </title>

        {/* Whisker line */}
        <line
          x1={minX} y1={cy} x2={maxX} y2={cy}
          stroke="#94a3b8" strokeWidth="1.5"
        />
        {/* Tick marks */}
        <line x1={minX} y1={cy - tickH / 2} x2={minX} y2={cy + tickH / 2} stroke="#94a3b8" strokeWidth="1.5" />
        <line x1={maxX} y1={cy - tickH / 2} x2={maxX} y2={cy + tickH / 2} stroke="#94a3b8" strokeWidth="1.5" />

        {/* IQR band */}
        <rect
          x={p25X} y={cy - bandH / 2}
          width={Math.max(p75X - p25X, 2)}
          height={bandH}
          rx={4}
          fill="#3b82f6"
          opacity={0.25}
        />

        {/* Median marker */}
        <line
          x1={medX} y1={cy - bandH / 2 - 2}
          x2={medX} y2={cy + bandH / 2 + 2}
          stroke="#1e40af" strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Labels */}
        <text x={minX} y={cy + tickH / 2 + 14} textAnchor="middle" className="fill-slate-400" fontSize="10">
          {formatAmount(min)}
        </text>
        <text x={medX} y={cy - bandH / 2 - 8} textAnchor="middle" className="fill-slate-700" fontSize="11" fontWeight="600">
          {formatAmount(median)}
        </text>
        <text x={maxX} y={cy + tickH / 2 + 14} textAnchor="middle" className="fill-slate-400" fontSize="10">
          {formatAmount(max)}
        </text>

        {/* P25/P75 labels if not too close to edges */}
        {p25 != null && Math.abs(p25X - minX) > 30 && (
          <text x={p25X} y={cy + tickH / 2 + 14} textAnchor="middle" className="fill-slate-400" fontSize="9">
            P25: {formatAmount(p25)}
          </text>
        )}
        {p75 != null && Math.abs(maxX - p75X) > 30 && (
          <text x={p75X} y={cy + tickH / 2 + 14} textAnchor="middle" className="fill-slate-400" fontSize="9">
            P75: {formatAmount(p75)}
          </text>
        )}
      </svg>

      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-slate-400" />
          Min-Max Range
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded bg-blue-500/25" />
          P25-P75 (IQR)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-blue-800" />
          Median
        </span>
      </div>
    </div>
  );
}
