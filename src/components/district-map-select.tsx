"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useRef } from "react";
import { DISTRICT_NAMES, STATE_TO_DISTRICT } from "@/lib/fed-districts";
import type { DistrictMetric } from "@/lib/crawler-db";
import { US_STATES } from "@/lib/us-map-paths";

interface DistrictMapSelectProps {
  districtStats: DistrictMetric[];
  selected: number[];
  basePath: string;
  beigeBookHeadlines?: Record<number, { text: string; release_date: string }>;
}

const DISTRICT_COLORS: Record<number, string> = {
  1: "#4f46e5", 2: "#7c3aed", 3: "#2563eb", 4: "#0891b2",
  5: "#059669", 6: "#16a34a", 7: "#ca8a04", 8: "#ea580c",
  9: "#dc2626", 10: "#e11d48", 11: "#9333ea", 12: "#0284c7",
};

export function DistrictMapSelect({
  districtStats,
  selected,
  basePath,
  beigeBookHeadlines,
}: DistrictMapSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<"map" | "list">("map");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    district: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const statsMap = new Map(districtStats.map((d) => [d.district, d]));

  // Compute max institution count for opacity scaling
  const maxCount = Math.max(
    1,
    ...districtStats.map((d) => d.institution_count)
  );

  const toggleDistrict = useCallback(
    (district: number) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = new Set(selected);

      if (current.has(district)) {
        current.delete(district);
      } else {
        current.add(district);
      }

      if (current.size > 0) {
        params.set(
          "district",
          Array.from(current)
            .sort((a, b) => a - b)
            .join(",")
        );
      } else {
        params.delete("district");
      }

      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, selected, basePath]
  );

  const getDistrictForState = (stateId: string): number | undefined => {
    return STATE_TO_DISTRICT[stateId];
  };

  const handleStateClick = (stateId: string) => {
    const district = getDistrictForState(stateId);
    if (district) toggleDistrict(district);
  };

  const handleStateHover = (
    e: React.MouseEvent<SVGPathElement>,
    stateId: string
  ) => {
    const district = getDistrictForState(stateId);
    if (!district || !svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    setTooltip({
      x: e.clientX - svgRect.left,
      y: e.clientY - svgRect.top - 10,
      district,
    });
  };

  const tooltipData = tooltip ? statsMap.get(tooltip.district) : null;
  const tooltipHeadline = tooltip
    ? beigeBookHeadlines?.[tooltip.district]
    : null;

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-1 mb-3">
        <button
          onClick={() => setView("map")}
          className={`px-3 py-1 text-xs rounded-md transition ${
            view === "map"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Map
        </button>
        <button
          onClick={() => setView("list")}
          className={`px-3 py-1 text-xs rounded-md transition ${
            view === "list"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          List
        </button>
      </div>

      {view === "map" ? (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox="0 0 960 600"
            className="w-full h-auto"
            onMouseLeave={() => setTooltip(null)}
          >
            {US_STATES.map((state) => {
              const district = getDistrictForState(state.id);
              const isSelected = district ? selected.includes(district) : false;
              const baseColor = district ? DISTRICT_COLORS[district] : "#d1d5db";
              const stat = district ? statsMap.get(district) : undefined;
              const count = stat?.institution_count ?? 0;

              // Scale opacity by institution count so the map reacts to filters
              const densityOpacity = count > 0
                ? 0.3 + 0.7 * (count / maxCount)
                : 0.12;

              return (
                <path
                  key={state.id}
                  d={state.d}
                  fill={count > 0 ? baseColor : "#e5e7eb"}
                  stroke={isSelected ? baseColor : "#fff"}
                  strokeWidth={isSelected ? 2.5 : 1}
                  className="cursor-pointer transition-all hover:brightness-110"
                  style={{
                    opacity: isSelected ? 1 : densityOpacity,
                  }}
                  onClick={() => handleStateClick(state.id)}
                  onMouseMove={(e) => handleStateHover(e, state.id)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && tooltipData && (
            <div
              className="absolute pointer-events-none z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
              }}
            >
              <div className="font-semibold">
                {tooltip.district} - {DISTRICT_NAMES[tooltip.district]}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                <span className="text-gray-400">Institutions</span>
                <span className="text-right">{tooltipData.institution_count}</span>
                <span className="text-gray-400">Fee URL%</span>
                <span className="text-right">
                  {(tooltipData.fee_url_pct * 100).toFixed(0)}%
                </span>
                <span className="text-gray-400">Fees</span>
                <span className="text-right">{tooltipData.total_fees}</span>
                <span className="text-gray-400">Confidence</span>
                <span className="text-right">
                  {(tooltipData.avg_confidence * 100).toFixed(0)}%
                </span>
              </div>
              {tooltipHeadline && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-700 text-gray-300 text-[11px] leading-snug max-w-[260px]">
                  {tooltipHeadline.text}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => {
            const stat = statsMap.get(d);
            const isSelected = selected.includes(d);
            return (
              <button
                key={d}
                onClick={() => toggleDistrict(d)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200 font-medium"
                    : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900 text-xs">{d}</span>
                  <span className="text-[10px] text-gray-500">
                    {DISTRICT_NAMES[d]}
                  </span>
                </div>
                {stat && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {stat.institution_count.toLocaleString()}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {selected.map((d) => (
            <button
              key={d}
              onClick={() => toggleDistrict(d)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-medium hover:bg-blue-200 transition"
            >
              {d} - {DISTRICT_NAMES[d]}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
