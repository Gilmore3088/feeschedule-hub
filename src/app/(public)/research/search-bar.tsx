"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentQuery = searchParams.get("q") ?? "";

  function handleChange(value: string) {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
          params.set("q", value);
        } else {
          params.delete("q");
        }
        router.replace(`/research?${params.toString()}`);
      });
    }, 300);
  }

  return (
    <div className="relative">
      <input
        type="search"
        placeholder="Search articles..."
        defaultValue={currentQuery}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 transition-colors"
      />
      {isPending && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
        </div>
      )}
    </div>
  );
}
