"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { FDIC_TIER_LABELS, FDIC_TIER_ORDER, DISTRICT_NAMES } from "@/lib/fed-districts";
import { FEATURED_COUNT, TAXONOMY_COUNT } from "@/lib/fee-taxonomy";
import { exportIndexCsv } from "./actions";

interface IndexFilterBarProps {
  families: string[];
  selectedTiers: string[];
  selectedCharter: string;
  selectedDistricts: number[];
}

export function IndexFilterBar({
  families,
  selectedTiers,
  selectedCharter,
  selectedDistricts,
}: IndexFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [exporting, startExport] = useTransition();

  const q = searchParams.get("q") ?? "";
  const family = searchParams.get("family") ?? "";
  const approved = searchParams.get("approved") === "1";
  const showAll = searchParams.get("show") === "all";
  const sortKey = searchParams.get("sort") ?? "";
  const sortDir = searchParams.get("dir") ?? "";

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

  const toggleTier = useCallback(
    (tier: string) => {
      const current = new Set(selectedTiers);
      if (current.has(tier)) {
        current.delete(tier);
      } else {
        current.add(tier);
      }
      updateParams({
        tier: current.size > 0 ? Array.from(current).join(",") : null,
      });
    },
    [selectedTiers, updateParams]
  );

  const toggleDistrict = useCallback(
    (district: number) => {
      const current = new Set(selectedDistricts);
      if (current.has(district)) {
        current.delete(district);
      } else {
        current.add(district);
      }
      updateParams({
        district:
          current.size > 0
            ? Array.from(current)
                .sort((a, b) => a - b)
                .join(",")
            : null,
      });
    },
    [selectedDistricts, updateParams]
  );

  const hasPeerFilters =
    selectedCharter ||
    selectedTiers.length > 0 ||
    selectedDistricts.length > 0;
  const hasAnyFilter = hasPeerFilters || q || family || approved || showAll;

  const handleExport = useCallback(() => {
    startExport(async () => {
      const csv = await exportIndexCsv(
        {
          charter_type: selectedCharter || undefined,
          asset_tiers: selectedTiers.length > 0 ? selectedTiers : undefined,
          fed_districts:
            selectedDistricts.length > 0 ? selectedDistricts : undefined,
        },
        approved
      );
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fee-index-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [selectedCharter, selectedTiers, selectedDistricts, approved]);

  return (
    <div className="sticky top-[57px] z-30 -mx-6 px-6 py-3 bg-white/95 backdrop-blur-sm border-b dark:bg-[oklch(0.15_0_0)]/95 dark:border-white/[0.08] space-y-3 mb-6">
      {/* Row 1: Peer segment filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Charter toggle */}
        <div
          className="inline-flex rounded-lg border border-gray-200 dark:border-white/[0.12] p-0.5"
          role="radiogroup"
        >
          {[
            { value: "", label: "All" },
            { value: "bank", label: "Banks" },
            { value: "credit_union", label: "CUs" },
          ].map((opt) => {
            const isActive = selectedCharter === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={isActive}
                onClick={() => updateParams({ charter: opt.value || null })}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  isActive
                    ? "bg-gray-900 text-white shadow-sm dark:bg-white/15 dark:text-gray-100"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.06]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <span className="h-5 w-px bg-gray-200 dark:bg-white/[0.08]" />

        {/* Tier chips */}
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Tiers
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {FDIC_TIER_ORDER.map((t) => {
            const isSelected = selectedTiers.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTier(t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  isSelected
                    ? "bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06]"
                }`}
              >
                {FDIC_TIER_LABELS[t].replace(/\s*\(.*?\)/, "")}
              </button>
            );
          })}
        </div>

        <span className="h-5 w-px bg-gray-200 dark:bg-white/[0.08]" />

        {/* District chips */}
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          Districts
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {selectedDistricts.map((d) => (
            <button
              key={d}
              onClick={() => toggleDistrict(d)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-xs font-medium hover:bg-blue-100 transition-colors dark:bg-blue-900/30 dark:text-blue-400"
            >
              {d}-{DISTRICT_NAMES[d]}
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
          ))}
          <DistrictDropdown onSelect={toggleDistrict} />
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          {hasPeerFilters && (
            <button
              onClick={() =>
                updateParams({ charter: null, tier: null, district: null })
              }
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors dark:text-gray-400"
            >
              Reset peers
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Search, family, toggles, export */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => updateParams({ show: showAll ? null : "all" })}
          aria-pressed={showAll}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            showAll
              ? "bg-gray-900 border-gray-900 text-white dark:bg-white/15 dark:border-white/15"
              : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-white/[0.12] dark:text-gray-400"
          }`}
        >
          {showAll ? `All (${TAXONOMY_COUNT})` : `Featured (${FEATURED_COUNT})`}
        </button>

        <input
          type="search"
          placeholder="Search categories..."
          defaultValue={q}
          onChange={(e) => updateParams({ q: e.target.value || null })}
          className="w-48 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none
                   dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
        />

        <select
          value={family}
          onChange={(e) => updateParams({ family: e.target.value || null })}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none
                   dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100"
        >
          <option value="">All families</option>
          {families.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none dark:text-gray-400">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) =>
              updateParams({ approved: e.target.checked ? "1" : null })
            }
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Approved only
        </label>

        <div className="ml-auto flex items-center gap-2">
          {hasAnyFilter && (
            <button
              onClick={() =>
                updateParams({
                  q: null,
                  family: null,
                  approved: null,
                  show: null,
                  charter: null,
                  tier: null,
                  district: null,
                  sort: null,
                  dir: null,
                })
              }
              className="text-xs text-gray-500 hover:text-gray-700 underline dark:text-gray-400"
            >
              Reset all
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50
                     dark:border-white/[0.12] dark:text-gray-400 dark:hover:bg-white/[0.06]"
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            {exporting ? "Exporting..." : "CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey: key,
  currentSort,
  currentDir,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const isActive = currentSort === key;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const handleSort = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", key);
    params.set("dir", nextDir);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <button
      onClick={handleSort}
      className="inline-flex items-center gap-1 group"
    >
      {label}
      <span
        className={`text-[9px] ${isActive ? "text-gray-700 dark:text-gray-300" : "text-gray-300 group-hover:text-gray-400 dark:text-gray-600"}`}
      >
        {isActive ? (currentDir === "desc" ? "\u25BC" : "\u25B2") : "\u25B2\u25BC"}
      </span>
    </button>
  );
}

export { SortHeader };

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
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors dark:border-white/[0.15] dark:text-gray-500"
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
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border bg-white shadow-lg p-2 w-56 max-h-64 overflow-y-auto dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12]">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                onClick={() => {
                  onSelect(d);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors dark:text-gray-300 dark:hover:bg-blue-900/30"
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
