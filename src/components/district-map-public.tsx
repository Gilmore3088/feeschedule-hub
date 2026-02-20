"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { US_STATES } from "@/lib/us-map-paths";
import { STATE_TO_DISTRICT, DISTRICT_NAMES } from "@/lib/fed-districts";

const DISTRICT_COLORS: Record<number, string> = {
  1: "#3b82f6",   // blue
  2: "#8b5cf6",   // violet
  3: "#06b6d4",   // cyan
  4: "#f59e0b",   // amber
  5: "#10b981",   // emerald
  6: "#ef4444",   // red
  7: "#6366f1",   // indigo
  8: "#f97316",   // orange
  9: "#14b8a6",   // teal
  10: "#ec4899",  // pink
  11: "#84cc16",  // lime
  12: "#a855f7",  // purple
};

export function DistrictMapPublic() {
  const router = useRouter();
  const [hoveredDistrict, setHoveredDistrict] = useState<number | null>(null);

  return (
    <div>
      <svg
        viewBox="0 0 960 600"
        className="w-full"
        aria-label="Federal Reserve district map"
      >
        {US_STATES.map((state) => {
          const district = STATE_TO_DISTRICT[state.id];
          if (!district) return null;

          const color = DISTRICT_COLORS[district] ?? "#94a3b8";
          const isHovered = hoveredDistrict === district;

          return (
            <path
              key={state.id}
              d={state.d}
              fill={color}
              fillOpacity={isHovered ? 0.7 : 0.35}
              stroke={isHovered ? color : "#fff"}
              strokeWidth={isHovered ? 1.5 : 0.75}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHoveredDistrict(district)}
              onMouseLeave={() => setHoveredDistrict(null)}
              onClick={() => router.push(`/districts/${district}`)}
            >
              <title>
                {state.name} - District {district} ({DISTRICT_NAMES[district]})
              </title>
            </path>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            onClick={() => router.push(`/districts/${d}`)}
            onMouseEnter={() => setHoveredDistrict(d)}
            onMouseLeave={() => setHoveredDistrict(null)}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              hoveredDistrict === d
                ? "text-slate-900 font-medium"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{
                backgroundColor: DISTRICT_COLORS[d],
                opacity: hoveredDistrict === d ? 1 : 0.5,
              }}
            />
            {d}. {DISTRICT_NAMES[d]}
          </button>
        ))}
      </div>
    </div>
  );
}
