"use client";

import { startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const TABS = ["overview", "call-reports", "economic", "health"] as const;
export type Tab = typeof TABS[number];

function tabLabel(tab: Tab): string {
  return tab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function TabNav({ active }: { active: Tab }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleTabChange(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`/admin/national?${params.toString()}`);
    });
  }

  return (
    <div className="sticky top-[57px] z-30 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-white/[0.06]">
      <div className="flex items-center gap-0 overflow-x-auto scrollbar-hide">
        {TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? "border-gray-900 text-gray-900 dark:border-gray-100 dark:text-gray-100"
                  : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tabLabel(tab)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
