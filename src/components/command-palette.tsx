"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { searchDashboard, type SearchResult } from "@/app/admin/actions/search";
import { getDisplayName } from "@/lib/fee-taxonomy";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const data = await searchDashboard(query);
      setResults(data);
      setSelectedIndex(0);
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const flatItems = useCallback((): { label: string; sub: string; href: string }[] => {
    if (!results) return [];
    const items: { label: string; sub: string; href: string }[] = [];

    for (const inst of results.institutions) {
      items.push({
        label: inst.name,
        sub: `${inst.charter === "bank" ? "Bank" : "CU"} | ${inst.state ?? ""}`,
        href: `/admin/peers/${inst.id}`,
      });
    }
    for (const cat of results.categories) {
      items.push({
        label: getDisplayName(cat.fee_category),
        sub: `${cat.count} institutions`,
        href: `/admin/fees/catalog/${cat.fee_category}`,
      });
    }
    for (const fn of results.feeNames) {
      items.push({
        label: fn.fee_name,
        sub: `${fn.count} occurrences`,
        href: `/admin/fees`,
      });
    }
    return items;
  }, [results]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    const items = flatItems();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && items[selectedIndex]) {
      e.preventDefault();
      navigate(items[selectedIndex].href);
    }
  }

  const items = flatItems();
  let sectionStart = 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-4">
          <svg
            className="w-4 h-4 text-gray-400 mr-2 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search institutions, fee categories, fee names..."
            className="w-full py-3 text-sm outline-none placeholder:text-gray-400"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin shrink-0" />
          )}
        </div>

        {results && items.length > 0 && (
          <div className="max-h-72 overflow-y-auto py-2">
            {results.institutions.length > 0 && (
              <>
                <p className="px-4 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Institutions
                </p>
                {results.institutions.map((inst, i) => {
                  const idx = sectionStart + i;
                  return (
                    <button
                      key={`inst-${inst.id}`}
                      onClick={() => navigate(`/admin/peers/${inst.id}`)}
                      className={`w-full px-4 py-2 flex items-center justify-between text-sm text-left hover:bg-gray-50 ${
                        selectedIndex === idx ? "bg-blue-50 text-blue-700" : ""
                      }`}
                    >
                      <span className="font-medium">{inst.name}</span>
                      <span className="text-xs text-gray-400">
                        {inst.charter === "bank" ? "Bank" : "CU"} | {inst.state}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {(() => {
              sectionStart = results.institutions.length;
              return null;
            })()}

            {results.categories.length > 0 && (
              <>
                <p className="px-4 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
                  Fee Categories
                </p>
                {results.categories.map((cat, i) => {
                  const idx = sectionStart + i;
                  return (
                    <button
                      key={`cat-${cat.fee_category}`}
                      onClick={() =>
                        navigate(`/admin/fees/catalog/${cat.fee_category}`)
                      }
                      className={`w-full px-4 py-2 flex items-center justify-between text-sm text-left hover:bg-gray-50 ${
                        selectedIndex === idx ? "bg-blue-50 text-blue-700" : ""
                      }`}
                    >
                      <span className="font-medium">
                        {getDisplayName(cat.fee_category)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {cat.count} inst.
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {(() => {
              sectionStart += results.categories.length;
              return null;
            })()}

            {results.feeNames.length > 0 && (
              <>
                <p className="px-4 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide mt-1">
                  Fee Names
                </p>
                {results.feeNames.map((fn, i) => {
                  const idx = sectionStart + i;
                  return (
                    <button
                      key={`fn-${fn.fee_name}`}
                      onClick={() => navigate(`/admin/fees`)}
                      className={`w-full px-4 py-2 flex items-center justify-between text-sm text-left hover:bg-gray-50 ${
                        selectedIndex === idx ? "bg-blue-50 text-blue-700" : ""
                      }`}
                    >
                      <span className="font-medium">{fn.fee_name}</span>
                      <span className="text-xs text-gray-400">
                        {fn.count}x
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {results && items.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No results for &quot;{query}&quot;
          </div>
        )}

        {!results && query.length < 2 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            Type at least 2 characters to search
          </div>
        )}

        <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-gray-400">
          <div className="flex gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                ↑↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                ↵
              </kbd>{" "}
              select
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">
                esc
              </kbd>{" "}
              close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommandPaletteTrigger() {
  const [, setOpen] = useState(false);

  function handleClick() {
    // Dispatch Cmd+K to open the palette
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      })
    );
    setOpen(true);
  }

  return (
    <button
      onClick={handleClick}
      className="hidden md:flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      Search...
      <kbd className="ml-1 px-1 py-0.5 rounded bg-gray-200 text-[10px] font-mono text-gray-500">
        ⌘K
      </kbd>
    </button>
  );
}
