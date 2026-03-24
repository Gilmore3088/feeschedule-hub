import Link from "next/link";

interface UpgradeGateProps {
  message?: string;
  compact?: boolean;
  count?: number; // e.g., "43 more categories"
}

/**
 * Shown when a free user encounters a premium-only feature.
 * `compact` renders inline (for table rows). Default renders a card.
 */
export function UpgradeGate({
  message,
  compact = false,
  count,
}: UpgradeGateProps) {
  if (compact) {
    return (
      <div className="text-center py-6 px-4 border-t border-[#E8DFD1] bg-gradient-to-r from-[#FAF7F2] to-white">
        <div className="text-sm text-[#7A7062]">
          {count ? `${count} more available` : message || "Premium feature"}
          {" "}with a Seat License
        </div>
        <Link
          href="/subscribe"
          className="inline-block mt-2 text-sm font-bold text-[#C44B2E] hover:underline"
        >
          View Plans &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#FFFDF9] border border-[#E8DFD1] rounded-xl p-6 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#FFF0ED] mb-3">
        <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-[#C44B2E]" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <h3
        className="text-lg font-normal text-[#1A1815] mb-1"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {message || "Unlock full access"}
      </h3>
      <p className="text-sm text-[#7A7062] mb-4">
        {count
          ? `${count} more categories with peer filters, CSV exports, AI research, and full API access.`
          : "Unlock all 49 fee categories, peer benchmarks by charter/tier/district, data exports, and AI-powered research."}
      </p>
      <div className="text-[11px] text-[#A09788] mt-2 mb-4">
        Based on 60,000+ fee observations from 8,000+ institutions
      </div>
      <Link
        href="/subscribe"
        className="inline-flex items-center gap-1.5 rounded-md bg-[#C44B2E] px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-[#C44B2E]/15 hover:bg-[#A83D25] hover:shadow-md hover:shadow-[#C44B2E]/25 transition-all"
      >
        View Plans
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
        </svg>
      </Link>
    </div>
  );
}

/** Lock icon badge for quick action tiles. */
export function PremiumBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#FFF0ED] text-[#C44B2E] uppercase tracking-wider ml-1">
      Pro
    </span>
  );
}
