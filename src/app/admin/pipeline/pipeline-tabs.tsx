"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode } from "react";

const TABS = [
  { id: "health", label: "Health" },
  { id: "ops", label: "Operations" },
  { id: "coverage", label: "Coverage" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function PipelineTabs({
  activeTab,
  children,
}: {
  activeTab: TabId;
  children: Record<TabId, ReactNode>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "health") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    // Clear coverage-specific params when leaving coverage tab
    if (tab !== "coverage") {
      params.delete("status");
      params.delete("charter");
      params.delete("state");
      params.delete("q");
      params.delete("page");
      params.delete("sort");
      params.delete("dir");
    }
    const qs = params.toString();
    router.push(`/admin/pipeline${qs ? `?${qs}` : ""}`);
  }

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`px-4 py-2 text-[12px] font-semibold tracking-wide transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{children[activeTab]}</div>
    </div>
  );
}
