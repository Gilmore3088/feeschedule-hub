"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface CharterToggleProps {
  selected: string;
  basePath: string;
}

const OPTIONS = [
  { value: "", label: "All Types" },
  { value: "bank", label: "Banks" },
  { value: "credit_union", label: "Credit Unions" },
] as const;

export function CharterToggle({ selected, basePath }: CharterToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setCharter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("type", value);
      } else {
        params.delete("type");
      }
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, basePath]
  );

  return (
    <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="radiogroup">
      {OPTIONS.map((opt) => {
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={isActive}
            onClick={() => setCharter(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              isActive
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
