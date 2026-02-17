"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { DistrictMapSelect } from "@/components/district-map-select";
import type { DistrictMetric } from "@/lib/crawler-db";

interface DistrictMapPanelProps {
  districtMetrics: DistrictMetric[];
  selectedDistricts: number[];
  mapMetric: string;
  selectedCategory: string | null;
  beigeBookHeadlines: Record<string, { text: string; release_date: string }>;
}

const METRICS = [
  { value: "", label: "Coverage %" },
  { value: "fees", label: "Fees" },
  { value: "flag_rate", label: "Flag Rate" },
] as const;

export function DistrictMapPanel({
  districtMetrics,
  selectedDistricts,
  mapMetric,
  selectedCategory,
  beigeBookHeadlines,
}: DistrictMapPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const setMetric = useCallback(
    (metric: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (metric) {
        params.set("mapMetric", metric);
      } else {
        params.delete("mapMetric");
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, router, pathname]
  );

  return (
    <div className="rounded-lg border bg-white">
      <div className="px-4 py-3 border-b bg-gray-50/80 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">
          Federal Reserve Districts
        </h3>
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`px-2 py-1 text-[10px] font-medium rounded-md transition ${
                mapMetric === m.value
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3">
        <DistrictMapSelect
          districtStats={districtMetrics}
          selected={selectedDistricts}
          basePath="/admin/market"
          beigeBookHeadlines={beigeBookHeadlines}
        />
      </div>
    </div>
  );
}
