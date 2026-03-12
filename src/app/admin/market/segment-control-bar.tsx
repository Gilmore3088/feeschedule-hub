"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { CharterToggle } from "@/components/charter-toggle";
import { TierMultiSelect } from "@/components/tier-multi-select";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

interface SegmentControlBarProps {
  tierCounts: { tier: string; count: number }[];
  selectedTiers: string[];
  selectedCharter: string;
  selectedDistricts: number[];
  hasFilters: boolean;
  institutionCount: number;
  nationalCount: number;
  filterDescription: string;
}

export function SegmentControlBar({
  tierCounts,
  selectedTiers,
  selectedCharter,
  selectedDistricts,
  hasFilters,
  institutionCount,
  nationalCount,
  filterDescription,
}: SegmentControlBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, router, pathname]
  );

  const toggleDistrict = useCallback(
    (district: number) => {
      const current = new Set(selectedDistricts);
      if (current.has(district)) {
        current.delete(district);
      } else {
        current.add(district);
      }
      if (current.size > 0) {
        updateParams({
          district: Array.from(current)
            .sort((a, b) => a - b)
            .join(","),
        });
      } else {
        updateParams({ district: null });
      }
    },
    [selectedDistricts, updateParams]
  );

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const pctOfNational =
    nationalCount > 0
      ? ((institutionCount / nationalCount) * 100).toFixed(1)
      : "0";

  return (
    <div className="sticky top-[57px] z-30 -mx-6 px-6 py-3 bg-white/95 backdrop-blur-sm border-b space-y-3 dark:bg-[oklch(0.15_0_0)]/95 dark:border-white/[0.08]">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* District selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Districts
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {selectedDistricts.length > 0 ? (
              selectedDistricts.map((d) => (
                <button
                  key={d}
                  onClick={() => toggleDistrict(d)}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-xs font-medium hover:bg-blue-100 transition-colors"
                >
                  {d} - {DISTRICT_NAMES[d]}
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              ))
            ) : (
              <DistrictDropdown onSelect={toggleDistrict} />
            )}
            {selectedDistricts.length > 0 && (
              <DistrictDropdown onSelect={toggleDistrict} />
            )}
          </div>
        </div>

        <span className="h-5 w-px bg-gray-200" />

        {/* Tier selector */}
        <TierMultiSelect
          tiers={tierCounts}
          selected={selectedTiers}
          basePath="/admin/market"
        />

        <span className="h-5 w-px bg-gray-200" />

        {/* Charter toggle */}
        <CharterToggle
          selected={selectedCharter}
          basePath="/admin/market"
        />

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {hasFilters && (
            <button
              onClick={() => router.push("/admin/market")}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleShare}
            className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.193-5.468a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757"
              />
            </svg>
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>

      {/* Segment summary line */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            hasFilters ? "bg-blue-500" : "bg-gray-300"
          }`}
        />
        {hasFilters ? (
          <span className="text-gray-700 font-medium">
            {filterDescription}
          </span>
        ) : (
          <span className="text-gray-500">National Segment Active</span>
        )}
        <span className="text-gray-400 mx-1">&middot;</span>
        <span className="text-gray-600 tabular-nums font-medium">
          {institutionCount.toLocaleString()} institutions
        </span>
        {hasFilters && (
          <span className="text-gray-400 tabular-nums text-xs">
            ({pctOfNational}% of national)
          </span>
        )}
      </div>
    </div>
  );
}

function DistrictDropdown({
  onSelect,
}: {
  onSelect: (district: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        Add
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-[35] rounded-lg border bg-white shadow-lg p-2 w-56 max-h-64 overflow-y-auto dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12]">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                onClick={() => {
                  onSelect(d);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors"
              >
                {d} &mdash; {DISTRICT_NAMES[d]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
