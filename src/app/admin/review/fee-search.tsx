"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const FEE_TYPES = [
  { label: "Wire Transfer", q: "wire" },
  { label: "ATM", q: "ATM" },
  { label: "Overdraft", q: "overdraft" },
  { label: "NSF / Returned", q: "insufficient" },
  { label: "Maintenance", q: "maintenance" },
  { label: "Stop Payment", q: "stop payment" },
  { label: "Safe Deposit", q: "safe deposit" },
  { label: "Check", q: "check" },
  { label: "Statement", q: "statement" },
  { label: "Card", q: "card" },
  { label: "Foreign / Intl", q: "foreign" },
  { label: "Options", q: "options" },
  { label: "Margin", q: "margin" },
  { label: "IRA / Retirement", q: "retirement" },
  { label: "Collections", q: "collection" },
  { label: "Cash Services", q: "cash services" },
  { label: "Bill Pay", q: "bill pay" },
];

export function FeeSearchForm({
  currentStatus,
  currentQuery,
}: {
  currentStatus: string;
  currentQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(currentQuery);

  function navigate(q: string) {
    const params = new URLSearchParams();
    params.set("status", currentStatus);
    if (q.trim()) {
      params.set("q", q.trim());
    }
    router.push(`/admin/review?${params.toString()}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(query);
  }

  function handleChipClick(q: string) {
    setQuery(q);
    navigate(q);
  }

  return (
    <div className="space-y-3">
      {/* Fee type chips */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
          Filter by fee type
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FEE_TYPES.map((ft) => {
            const isActive =
              currentQuery.toLowerCase() === ft.q.toLowerCase();
            return (
              <button
                key={ft.q}
                onClick={() =>
                  isActive ? navigate("") : handleChipClick(ft.q)
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800/40 dark:text-blue-400"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:bg-white/[0.04] dark:border-white/[0.1] dark:text-gray-400 dark:hover:bg-white/[0.08]"
                }`}
              >
                {ft.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Free text search */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Or type a custom search..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm
                     focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500
                     dark:bg-[oklch(0.18_0_0)] dark:border-white/[0.12] dark:text-gray-100 dark:placeholder:text-gray-500"
        />
        <button
          type="submit"
          className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white
                     hover:bg-gray-900 dark:bg-white/[0.15] dark:hover:bg-white/[0.2]"
        >
          Search
        </button>
      </form>
    </div>
  );
}
