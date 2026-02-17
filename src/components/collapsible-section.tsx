"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  summary: string;
  colorClasses: { bg: string; text: string; border: string };
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  summary,
  colorClasses,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-4 print:break-inside-avoid">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left ${colorClasses.bg} hover:opacity-90 transition-opacity print:pointer-events-none`}
      >
        {open ? (
          <ChevronDown className={`h-4 w-4 flex-shrink-0 ${colorClasses.text} print:hidden`} />
        ) : (
          <ChevronRight className={`h-4 w-4 flex-shrink-0 ${colorClasses.text} print:hidden`} />
        )}
        <h2 className={`text-sm font-semibold ${colorClasses.text}`}>
          {title}
        </h2>
        <span className="text-xs text-gray-500 ml-auto">{summary}</span>
      </button>
      {/* Screen: show only when open. Print: always show. */}
      <div
        className={`mt-1 bg-white rounded-lg border border-l-4 ${colorClasses.border} ${
          open ? "block" : "hidden print:block"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
