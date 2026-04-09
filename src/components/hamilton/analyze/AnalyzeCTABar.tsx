"use client";

import Link from "next/link";
import { CTA_HIERARCHY } from "@/lib/hamilton/navigation";

interface AnalyzeCTABarProps {
  /** Only show after analysis completes */
  isVisible: boolean;
}

/**
 * AnalyzeCTABar — CTA hierarchy for the Analyze screen.
 * Matches HTML prototype: burnished primary + outlined secondary buttons.
 * Primary: "Simulate a Change" → /pro/simulate (burnished green)
 * Secondary: "Show Peer Distribution" | "View Risk Drivers" (outlined, hover primary)
 * No "Recommended Position" — analyze only (ARCH-05).
 */
export function AnalyzeCTABar({ isVisible }: AnalyzeCTABarProps) {
  if (!isVisible) return null;

  const { primary, secondary } = CTA_HIERARCHY["Analyze"];

  return (
    <div className="flex flex-wrap items-center gap-3 pb-2">
      <Link
        href="/pro/simulate"
        className="burnished-cta px-6 py-2.5 rounded text-[10px] uppercase tracking-widest font-bold no-underline transition-opacity hover:opacity-90"
        style={{ boxShadow: "0 2px 8px rgba(138,76,39,0.25)" }}
      >
        {primary}
      </Link>

      {secondary.map((label) => (
        <button
          key={label}
          className="px-5 py-2.5 rounded text-[10px] uppercase tracking-widest font-bold border transition-all"
          style={{
            borderColor: "var(--hamilton-outline-variant, #d8c2b8)",
            backgroundColor: "var(--hamilton-surface-container-lowest, #ffffff)",
            color: "var(--hamilton-text-secondary)",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = "var(--hamilton-primary)";
            el.style.color = "var(--hamilton-primary)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = "var(--hamilton-outline-variant, #d8c2b8)";
            el.style.color = "var(--hamilton-text-secondary)";
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
