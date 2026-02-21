"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchInstitutionsAction } from "@/app/(public)/institutions/actions";
import type { InstitutionSearchResult } from "@/lib/crawler-db/institutions";

export function CompareSelector() {
  const router = useRouter();
  const [instA, setInstA] = useState<InstitutionSearchResult | null>(null);
  const [instB, setInstB] = useState<InstitutionSearchResult | null>(null);

  function handleCompare() {
    if (!instA || !instB) return;
    router.push(`/compare/${instA.id}/vs/${instB.id}`);
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Institution A
          </label>
          <SearchInput
            selected={instA}
            onSelect={setInstA}
            placeholder="Search first bank or credit union..."
            excludeId={instB?.id}
          />
        </div>
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Institution B
          </label>
          <SearchInput
            selected={instB}
            onSelect={setInstB}
            placeholder="Search second bank or credit union..."
            excludeId={instA?.id}
          />
        </div>
      </div>

      <button
        onClick={handleCompare}
        disabled={!instA || !instB}
        className="rounded-md bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Compare Fees
      </button>

      {instA && instB && instA.id === instB.id && (
        <p className="text-sm text-amber-600">
          Please select two different institutions to compare.
        </p>
      )}
    </div>
  );
}

function SearchInput({
  selected,
  onSelect,
  placeholder,
  excludeId,
}: {
  selected: InstitutionSearchResult | null;
  onSelect: (result: InstitutionSearchResult | null) => void;
  placeholder: string;
  excludeId?: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstitutionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }

      setLoading(true);
      const gen = ++generationRef.current;
      const data = await searchInstitutionsAction(q);

      if (gen !== generationRef.current) return;

      const filtered = excludeId
        ? data.filter((d) => d.id !== excludeId)
        : data;
      setResults(filtered);
      setActiveIndex(-1);
      setOpen(filtered.length > 0);
      setLoading(false);
    },
    [excludeId]
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    onSelect(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  }

  function selectResult(result: InstitutionSearchResult) {
    setQuery(result.institution_name);
    setResults([]);
    setOpen(false);
    onSelect(result);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          selectResult(results[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={`w-full rounded-md border bg-white py-3 pl-4 pr-10 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 transition-colors ${
            selected
              ? "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-400"
              : "border-slate-200 focus:border-slate-400 focus:ring-slate-900"
          }`}
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          </div>
        )}
        {selected && !loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <svg
              className="h-4 w-4 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
        )}
      </div>

      {open && (
        <ul className="absolute z-40 mt-1 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-md max-h-[240px]">
          {results.map((result, index) => (
            <li
              key={result.id}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                selectResult(result);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                index === activeIndex ? "bg-slate-50" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium text-slate-900">
                  {result.institution_name}
                </span>
                {(result.city || result.state_code) && (
                  <span className="ml-1.5 text-slate-400">
                    {[result.city, result.state_code]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </div>
              <span className="ml-3 flex-shrink-0 text-[11px] tabular-nums text-slate-400">
                {result.fee_count > 0
                  ? `${result.fee_count} fees`
                  : "No data"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <p className="mt-1 text-[11px] text-slate-400">
          {selected.charter_type === "bank" ? "Bank" : "Credit Union"}
          {selected.city ? ` \u00b7 ${selected.city}` : ""}
          {selected.state_code ? `, ${selected.state_code}` : ""}
        </p>
      )}
    </div>
  );
}
