"use client";

import { Slider } from "radix-ui";

interface Props {
  min: number;
  max: number;
  step: number;
  currentFee: number;
  proposedFee: number;
  median: number;
  p75: number;
  onValueChange: (value: number[]) => void;
  onValueCommit: (value: number[]) => void;
}

function formatDollar(v: number): string {
  return `$${v.toFixed(2)}`;
}

/** Convert a fee amount to a percentage along the slider track [0, 100] */
function toPercent(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function FeeSlider({
  min,
  max,
  step,
  currentFee,
  proposedFee,
  median,
  p75,
  onValueChange,
  onValueCommit,
}: Props) {
  const medianPct = toPercent(median, min, max);
  const p75Pct = toPercent(p75, min, max);
  const currentPct = toPercent(currentFee, min, max);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--hamilton-text-tertiary)" }}
        >
          Proposed fee
        </span>
        <span
          className="text-lg font-bold tabular-nums"
          style={{ color: "var(--hamilton-accent)" }}
        >
          {formatDollar(proposedFee)}
        </span>
      </div>

      {/* Slider with custom track segments */}
      <div className="relative py-3">
        <Slider.Root
          className="relative flex w-full touch-none select-none items-center"
          value={[proposedFee]}
          min={min}
          max={max}
          step={step}
          onValueChange={onValueChange}
          onValueCommit={onValueCommit}
        >
          <Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full" style={{ background: "var(--hamilton-surface-sunken)" }}>
            {/* Color segments: emerald up to median, amber median to P75, red P75 to max */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${medianPct}%`,
                background: "rgb(16 185 129)", // emerald-500
                opacity: 0.5,
              }}
            />
            <div
              className="absolute inset-y-0"
              style={{
                left: `${medianPct}%`,
                width: `${p75Pct - medianPct}%`,
                background: "rgb(245 158 11)", // amber-500
                opacity: 0.5,
              }}
            />
            <div
              className="absolute inset-y-0"
              style={{
                left: `${p75Pct}%`,
                right: 0,
                background: "rgb(239 68 68)", // red-500
                opacity: 0.5,
              }}
            />
            <Slider.Range className="absolute h-full" style={{ background: "var(--hamilton-accent)", opacity: 0.3 }} />
          </Slider.Track>

          {/* Current fee marker (dashed vertical line) */}
          <div
            className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 border-l-2 border-dashed"
            style={{
              left: `${currentPct}%`,
              borderColor: "var(--hamilton-text-secondary)",
              zIndex: 10,
            }}
            title={`Current: ${formatDollar(currentFee)}`}
          />

          <Slider.Thumb
            className="block h-5 w-5 rounded-full border-2 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing"
            style={{
              background: "var(--hamilton-accent)",
              borderColor: "white",
            }}
            aria-label="Proposed fee"
          />
        </Slider.Root>
      </div>

      {/* Track labels */}
      <div className="flex justify-between">
        <span className="text-xs tabular-nums" style={{ color: "var(--hamilton-text-tertiary)" }}>
          {formatDollar(min)}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--hamilton-text-secondary)" }}>
          Median {formatDollar(median)}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--hamilton-text-tertiary)" }}>
          {formatDollar(max)}
        </span>
      </div>

      {/* Current fee legend */}
      <div className="flex items-center gap-1.5">
        <div
          className="h-px w-4 border-t-2 border-dashed"
          style={{ borderColor: "var(--hamilton-text-secondary)" }}
        />
        <span className="text-xs" style={{ color: "var(--hamilton-text-tertiary)" }}>
          Current: {formatDollar(currentFee)}
        </span>
      </div>
    </div>
  );
}
