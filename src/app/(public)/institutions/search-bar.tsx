"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Result {
  id: number;
  institution_name: string;
  city: string | null;
  state_code: string | null;
  charter_type: string | null;
  fee_count: number;
}

type Variant = "light" | "dark";

interface InstitutionSearchBarProps {
  autoFocus?: boolean;
  /**
   * Visual variant. "light" (default) is the consumer/parchment background.
   * "dark" is for the institutional landing's dark column.
   */
  variant?: Variant;
  placeholder?: string;
}

export function InstitutionSearchBar({
  autoFocus = false,
  variant = "light",
  placeholder = "Search your bank or credit union...",
}: InstitutionSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDark = variant === "dark";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/institutions?q=${encodeURIComponent(value.trim())}`);
        const data = await resp.json();
        setResults(data);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function handleSelect(id: number) {
    setShowResults(false);
    router.push(`/institution/${id}`);
  }

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 ${isDark ? "text-[#7A7062]" : "text-[#A69D90]"}`}
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={
            isDark
              ? "w-full rounded-xl border border-[#3D3830] bg-[#2D2A26] pl-10 pr-4 py-3 text-sm text-[#F5EFE6] placeholder:text-[#7A7062] focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent"
              : "w-full rounded-xl border border-[#E8DFD1] bg-[#FFFDF9] pl-10 pr-4 py-3 text-sm text-[#1A1815] placeholder:text-[#A69D90] focus:outline-none focus:ring-2 focus:ring-[#C44B2E] focus:border-transparent"
          }
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div
              className={`h-4 w-4 border-2 ${isDark ? "border-[#3D3830]" : "border-[#E8DFD1]"} border-t-[#C44B2E] rounded-full animate-spin`}
            />
          </div>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl shadow-lg overflow-hidden z-50">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r.id)}
              className="w-full text-left px-4 py-3 hover:bg-[#FAF7F2] transition-colors border-b border-[#E8DFD1] last:border-0"
            >
              <div className="text-sm font-medium text-[#1A1815]">
                {r.institution_name}
              </div>
              <div className="text-xs text-[#7A7062] mt-0.5">
                {[r.city, r.state_code].filter(Boolean).join(", ")}
                {r.charter_type && (
                  <span className="ml-2 text-[#A69D90]">
                    {r.charter_type === "bank" ? "Bank" : "Credit Union"}
                  </span>
                )}
                {r.fee_count > 0 && (
                  <span className="ml-2 text-[#C44B2E]">
                    {r.fee_count} fees
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && results.length === 0 && query.trim().length >= 2 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl shadow-lg p-4 z-50">
          <p className="text-sm text-[#7A7062]">No institutions found for "{query}"</p>
        </div>
      )}
    </div>
  );
}
