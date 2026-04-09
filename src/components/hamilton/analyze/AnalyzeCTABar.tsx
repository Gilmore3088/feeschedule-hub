"use client";

import Link from "next/link";
import { CTA_HIERARCHY } from "@/lib/hamilton/navigation";

interface AnalyzeCTABarProps {
  /** Only show after analysis completes */
  isVisible: boolean;
}

/**
 * AnalyzeCTABar — CTA hierarchy footer for the Analyze screen.
 * Imports CTA hierarchy from navigation.ts (single source of truth).
 * Primary: "Simulate a Change" → /pro/simulate
 * Secondary: "Show Peer Distribution" | "View Risk Drivers"
 * No "Recommended Position" — this screen only analyzes, never recommends (ARCH-05).
 * Only visible when analysis has completed.
 */
export function AnalyzeCTABar({ isVisible }: AnalyzeCTABarProps) {
  if (!isVisible) return null;

  const { primary, secondary } = CTA_HIERARCHY["Analyze"];

  return (
    <div
      className="flex items-center gap-3 py-4 border-t mt-4"
      style={{ borderColor: "var(--hamilton-border)" }}
    >
      <Link
        href="/pro/simulate"
        className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 no-underline"
        style={{
          backgroundColor: "var(--hamilton-accent)",
          color: "var(--hamilton-accent-fg, #fff)",
        }}
      >
        {primary}
      </Link>

      {secondary.map((label) => (
        <button
          key={label}
          className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
          style={{
            borderColor: "var(--hamilton-border)",
            color: "var(--hamilton-text-secondary)",
            backgroundColor: "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--hamilton-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--hamilton-text-secondary)";
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
