"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const METRICS = [
  { value: "", label: "Coverage %" },
  { value: "fees", label: "Fees Extracted" },
  { value: "flag_rate", label: "Flag Rate" },
] as const;

export function MapMetricSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("mapMetric") ?? "";

  const update = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("mapMetric", value);
      } else {
        params.delete("mapMetric");
      }
      router.push(`/admin?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex items-center gap-1.5">
      {METRICS.map((m) => (
        <button
          key={m.value}
          onClick={() => update(m.value)}
          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            current === m.value
              ? "bg-blue-50 text-blue-600"
              : "bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
