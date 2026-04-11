"use client";

import { useState, type ReactNode } from "react";

const TABS = [
  { id: "economy", label: "Economy" },
  { id: "fees", label: "Fees" },
  { id: "complaints", label: "Complaints" },
  { id: "beigebook", label: "Beige Book" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function DistrictTabs({ children }: { children: Record<TabId, ReactNode> }) {
  const [active, setActive] = useState<TabId>("economy");
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/10 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab.id
                ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{children[active]}</div>
    </div>
  );
}
