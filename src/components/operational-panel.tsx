"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface OperationalPanelProps {
  crawlCount: number;
  reviewCount: number;
  children: ReactNode;
}

export function OperationalPanel({
  crawlCount,
  reviewCount,
  children,
}: OperationalPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Operational Activity
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            {crawlCount} crawls, {reviewCount} reviews recently
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-gray-100 dark:border-white/[0.06]">{children}</div>}
    </div>
  );
}
