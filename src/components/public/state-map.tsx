"use client";

import { useState } from "react";
import { US_STATES } from "@/lib/us-map-paths";
import { STATE_TO_DISTRICT } from "@/lib/fed-districts";

interface StateMapProps {
  data: Record<string, number>;
  label?: string;
  colorScale?: "blue" | "green";
  onStateClick?: (stateCode: string) => void;
}

const COLOR_SCALES = {
  blue: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#3b82f6", "#1d4ed8"],
  green: ["#f0fdf4", "#dcfce7", "#bbf7d0", "#86efac", "#22c55e", "#15803d"],
};

function getColor(value: number, max: number, scale: string[]) {
  if (value === 0) return "#f1f5f9";
  const idx = Math.min(Math.floor((value / max) * (scale.length - 1)), scale.length - 1);
  return scale[idx];
}

export function StateMap({ data, label = "Value", colorScale = "blue", onStateClick }: StateMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...Object.values(data), 1);
  const scale = COLOR_SCALES[colorScale];

  return (
    <div className="relative">
      <svg viewBox="0 0 960 600" className="w-full h-auto">
        {US_STATES.map((state) => {
          const value = data[state.id] ?? 0;
          const fill = getColor(value, max, scale);
          const district = STATE_TO_DISTRICT[state.id];

          return (
            <path
              key={state.id}
              d={state.d}
              fill={hovered === state.id ? "#fbbf24" : fill}
              stroke="#94a3b8"
              strokeWidth={0.5}
              className={onStateClick ? "cursor-pointer" : ""}
              onMouseEnter={() => setHovered(state.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onStateClick?.(state.id)}
            >
              <title>
                {state.name}
                {district ? ` (District ${district})` : ""}
                {value > 0 ? ` — ${label}: ${value}` : ""}
              </title>
            </path>
          );
        })}
      </svg>

      {hovered && data[hovered] !== undefined && (
        <div className="absolute top-2 right-2 rounded-md bg-white px-3 py-1.5 text-xs shadow-sm border border-slate-200">
          <span className="font-medium text-slate-900">
            {US_STATES.find((s) => s.id === hovered)?.name}
          </span>
          <span className="ml-2 text-slate-500">
            {label}: {data[hovered]?.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
