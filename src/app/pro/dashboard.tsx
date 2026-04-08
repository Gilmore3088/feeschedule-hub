import Link from "next/link";
import {
  getNationalIndexCached,
  getPeerIndex,
} from "@/lib/crawler-db";
import { getSpotlightCategories, getDisplayName } from "@/lib/fee-taxonomy";
import { formatAmount } from "@/lib/format";
import { STATE_TO_DISTRICT } from "@/lib/fed-districts";
import { derivePersonalizationContext } from "@/lib/personalization";
import type { User } from "@/lib/auth";

interface DashboardProps {
  user: User;
}

// SVG path data for door icons (Heroicons outline)
const ICON_CHAT_BUBBLE =
  "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.181 0-2.35-.034-3.5-.1-1.187-.068-2.122-.937-2.37-2.043M8.25 12.75a4.5 4.5 0 01-2.414-4.241c0-1.045.537-1.963 1.357-2.493.254-.164.534-.241.807-.241h6.09c.273 0 .553.077.807.241.82.53 1.357 1.448 1.357 2.493M8.25 12.75a4.5 4.5 0 002.25 3.897m-4.5-3.897H5.625c-.621 0-1.125.504-1.125 1.125v4.134c0 .621.504 1.125 1.125 1.125h4.5c.621 0 1.125-.504 1.125-1.125v-4.134c0-.621-.504-1.125-1.125-1.125H5.625z M3.75 21v-4.5M3.75 16.5h4.5";

const ICON_USER_GROUP =
  "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z";

const ICON_DOCUMENT_CHART =
  "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3M12 11.25v.008M12 8.25v.008M9 11.25v.008M9 8.25v.008M15 11.25v.008M15 8.25v.008";

const ICON_BUILDING_LIBRARY =
  "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z";

const DOORS = [
  {
    href: "/pro/research",
    title: "Hamilton AI Analyst",
    description:
      "Ask questions about fees, markets, and competitive positioning. Powered by 12-source intelligence.",
    icon: ICON_CHAT_BUBBLE,
    isHamilton: true,
  },
  {
    href: "/pro/peers",
    title: "Peer Builder",
    description:
      "Compare your institution against charter, tier, and district segments.",
    icon: ICON_USER_GROUP,
    isHamilton: false,
  },
  {
    href: "/pro/reports",
    title: "Reports",
    description:
      "Generate and download peer briefs, competitive snapshots, and district outlooks.",
    icon: ICON_DOCUMENT_CHART,
    isHamilton: false,
  },
  {
    href: "/pro/data",
    title: "Federal Data",
    description:
      "Fed district analysis, Beige Book themes, and FRED economic indicators.",
    icon: ICON_BUILDING_LIBRARY,
    isHamilton: false,
  },
];

export async function ProDashboard({ user }: DashboardProps) {
  const personalization = derivePersonalizationContext(user);

  // Resolve district number for peer filters
  const district = user.state_code ? STATE_TO_DISTRICT[user.state_code] : null;

  // Build peer filters from user profile
  const peerFilters: {
    charter_type?: string;
    asset_tiers?: string[];
    fed_districts?: number[];
  } = {};
  if (user.institution_type) {
    peerFilters.charter_type =
      user.institution_type === "credit_union" ? "credit_union" : "bank";
  }
  if (user.asset_tier) {
    peerFilters.asset_tiers = [user.asset_tier];
  }
  if (district) {
    peerFilters.fed_districts = [district];
  }

  const hasPeerFilters = Object.keys(peerFilters).length > 0;

  const [nationalIndex, peerIndex] = await Promise.all([
    getNationalIndexCached(),
    hasPeerFilters ? getPeerIndex(peerFilters) : Promise.resolve([]),
  ]);

  const spotlightCats = getSpotlightCategories().slice(0, 3);

  // Build comparison rows: peer vs national when filters exist, else national only
  const comparisonRows = spotlightCats
    .map((cat) => {
      const national = nationalIndex.find((e) => e.fee_category === cat);
      if (!national?.median_amount) return null;
      if (hasPeerFilters) {
        const peer = peerIndex.find((e) => e.fee_category === cat);
        if (!peer?.median_amount) return null;
        const delta =
          ((peer.median_amount - national.median_amount) /
            national.median_amount) *
          100;
        return {
          category: cat,
          peerMedian: peer.median_amount,
          nationalMedian: national.median_amount,
          delta,
        };
      }
      // Fallback: national spotlight only
      return {
        category: cat,
        peerMedian: national.median_amount,
        nationalMedian: national.median_amount,
        delta: 0,
      };
    })
    .filter(Boolean) as {
    category: string;
    peerMedian: number;
    nationalMedian: number;
    delta: number;
  }[];

  const userInitial = (
    user.institution_name?.[0] ||
    user.email?.[0] ||
    user.username?.[0] ||
    "P"
  ).toUpperCase();

  const subLine = [personalization.peerGroupLabel, personalization.fedDistrictLabel]
    .filter(Boolean)
    .join(" | ");

  const sidebarTitle = hasPeerFilters && comparisonRows.length > 0
    ? "Peer Snapshot"
    : "National Spotlight";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main content area */}
        <div className="lg:col-span-8">
          {/* Welcome header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1A1815] text-[16px] font-bold text-white shrink-0">
              {userInitial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-px w-6 bg-[#C44B2E]/40" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
                  Pro Dashboard
                </span>
              </div>
              <h1
                className="mt-0.5 text-[1.5rem] sm:text-[1.75rem] leading-[1.15] tracking-[-0.02em] text-[#1A1815]"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                {user.institution_name || "Welcome back"}
              </h1>
              {subLine && (
                <p className="mt-1 text-[13px] text-[#7A7062]">{subLine}</p>
              )}
            </div>
          </div>

          {/* Four-door grid */}
          <div className="grid grid-cols-2 gap-4 mt-2">
            {DOORS.map((door) => (
              <Link
                key={door.href}
                href={door.href}
                className={[
                  "group rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm p-5",
                  "hover:border-[#C44B2E]/30 hover:shadow-md hover:shadow-[#C44B2E]/5",
                  "transition-all duration-300 no-underline",
                  door.isHamilton ? "col-span-2 border-l-4 border-l-[#C44B2E]" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={[
                    "text-[#C44B2E]/60 group-hover:text-[#C44B2E] transition-colors",
                    door.isHamilton ? "h-7 w-7" : "h-6 w-6",
                  ].join(" ")}
                >
                  <path d={door.icon} />
                </svg>
                <p
                  className={[
                    "mt-3 font-semibold text-[#1A1815]",
                    door.isHamilton ? "text-[17px]" : "text-[15px]",
                  ].join(" ")}
                  style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
                >
                  {door.title}
                </p>
                <p className="text-[12px] leading-relaxed text-[#7A7062] mt-1">
                  {door.description}
                  {door.isHamilton && <span className="ml-1">&rarr;</span>}
                </p>
              </Link>
            ))}
          </div>
        </div>

        {/* Peer snapshot sidebar */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 self-start">
          <div className="rounded-xl border border-[#E8DFD1] bg-white/80 backdrop-blur-sm overflow-hidden">
            {/* Sidebar header */}
            <div className="px-5 py-3 border-b border-[#E8DFD1]/60 bg-[#FAF7F2]/60">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#A09788]">
                {sidebarTitle}
              </p>
              {personalization.peerGroupLabel && hasPeerFilters && (
                <p className="text-[11px] text-[#7A7062] mt-0.5">
                  {personalization.peerGroupLabel}
                </p>
              )}
            </div>

            {/* Comparison rows */}
            <div className="divide-y divide-[#E8DFD1]/40">
              {comparisonRows.length > 0 ? (
                comparisonRows.map((row) => {
                  const deltaColor =
                    row.delta < -2
                      ? "text-emerald-600"
                      : row.delta > 2
                        ? "text-red-500"
                        : "text-[#A09788]";

                  return (
                    <div key={row.category} className="px-5 py-3.5">
                      <p className="text-[13px] text-[#1A1815] font-medium">
                        {getDisplayName(row.category)}
                      </p>
                      <div className="mt-1.5 flex items-end justify-between">
                        <div>
                          <p className="text-[10px] text-[#A09788] uppercase tracking-wide">
                            {hasPeerFilters ? "Your Peers" : "National"}
                          </p>
                          <p className="text-[15px] font-semibold tabular-nums text-[#1A1815]">
                            {formatAmount(row.peerMedian)}
                          </p>
                        </div>
                        <div className="text-right">
                          {hasPeerFilters && (
                            <>
                              <p className="text-[10px] text-[#A09788] uppercase tracking-wide">
                                National
                              </p>
                              <p className="text-[13px] tabular-nums text-[#7A7062]">
                                {formatAmount(row.nationalMedian)}
                              </p>
                            </>
                          )}
                        </div>
                        {hasPeerFilters && (
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${deltaColor}`}
                          >
                            {row.delta > 0 ? "+" : ""}
                            {row.delta.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-6 text-center">
                  <p className="text-[13px] text-[#7A7062]">
                    No fee data available yet.
                  </p>
                </div>
              )}
            </div>

            {/* Sidebar footer */}
            <div className="px-5 py-3 border-t border-[#E8DFD1]/60">
              <Link
                href="/pro/market"
                className="text-[11px] font-medium text-[#C44B2E]/70 hover:text-[#C44B2E] transition-colors no-underline"
              >
                Full Market Explorer &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
