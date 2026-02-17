"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

export function IndexFilters({ families }: { families: string[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = searchParams.get("q") ?? "";
  const family = searchParams.get("family") ?? "";
  const approved = searchParams.get("approved") === "1";

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

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <input
        type="search"
        placeholder="Search fee categories..."
        defaultValue={q}
        onChange={(e) => updateParams({ q: e.target.value || null })}
        className="w-56 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      />

      <select
        value={family}
        onChange={(e) => updateParams({ family: e.target.value || null })}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      >
        <option value="">All families</option>
        {families.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
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

      {(q || family || approved) && (
        <button
          onClick={() => updateParams({ q: null, family: null, approved: null })}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Reset
        </button>
      )}
    </div>
  );
}
