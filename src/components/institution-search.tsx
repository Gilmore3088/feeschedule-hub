"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { searchInstitutionsAction } from "@/app/(public)/institutions/actions";
import type { InstitutionSearchResult } from "@/lib/crawler-db/institutions";

type SearchState = "idle" | "typing" | "loading" | "showing";

export function InstitutionSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InstitutionSearchResult[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const listboxId = "institution-search-listbox";
  const isOpen = state === "showing" && results.length > 0;

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setState("idle");
      return;
    }

    setState("loading");
    const gen = ++generationRef.current;
    const data = await searchInstitutionsAction(q);

    if (gen !== generationRef.current) return;

    setResults(data);
    setActiveIndex(-1);
    setState(data.length > 0 ? "showing" : "idle");
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    setState("typing");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  }

  function selectResult(result: InstitutionSearchResult) {
    setQuery(result.institution_name);
    setResults([]);
    setState("idle");
    router.push(`/institutions/${result.id}`);
  }

  function close() {
    setResults([]);
    setState("idle");
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "Escape") {
        setQuery("");
        close();
      }
      return;
    }

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
        close();
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(results.length - 1);
        break;
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const activeDescendant =
    activeIndex >= 0 ? `institution-option-${results[activeIndex]?.id}` : undefined;

  return (
    <div className="relative w-full">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-label="Search for a bank or credit union"
          placeholder="Search by bank or credit union name..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Delay to allow onMouseDown on options to fire first
            setTimeout(close, 150);
          }}
          className="w-full rounded-md border border-slate-200 bg-white py-3 pl-10 pr-4 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
        />
        {state === "loading" && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          </div>
        )}
      </div>

      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="absolute z-40 mt-1 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-md max-h-[280px]"
        >
          {results.map((result, index) => (
            <li
              key={result.id}
              id={`institution-option-${result.id}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                selectResult(result);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center justify-between px-4 py-3 text-sm transition-colors ${
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
                <span className="ml-1.5 text-slate-300">
                  ({result.charter_type === "bank" ? "Bank" : "CU"})
                </span>
              </div>
              <span
                className={`ml-3 flex-shrink-0 text-[11px] tabular-nums ${
                  result.fee_count > 0
                    ? "text-slate-400"
                    : "italic text-slate-300"
                }`}
              >
                {result.fee_count > 0
                  ? `${result.fee_count} fees`
                  : "No data"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {state === "showing" && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute z-40 mt-1 w-full rounded-md border border-slate-200 bg-white p-4 text-center text-sm italic text-slate-400 shadow-md">
          No institutions found matching &ldquo;{query.trim()}&rdquo;
        </div>
      )}

      <div aria-live="polite" className="sr-only">
        {state === "showing" && results.length > 0
          ? `${results.length} result${results.length === 1 ? "" : "s"} available`
          : ""}
      </div>
    </div>
  );
}
