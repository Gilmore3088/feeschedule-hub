/**
 * Hamilton Navigation — Single source of truth.
 * Top nav labels, left rail structure, CTA hierarchy, and label constants.
 *
 * Label set: My Bank | Peer Compare | Scenarios | Reports & Briefs | Watchlist | Admin.
 * URLs are unchanged from the prior label set (Home/Analyze/Simulate/Reports/Monitor)
 * to preserve bookmarks, internal links, and SEO. URL canonicalization is a
 * separate follow-up.
 *
 * Per D-17: Left rail + CTA hierarchy defined here, not in components.
 *
 * History:
 *   - D-16 (Phase 38) locked labels to Home | Analyze | Simulate | Reports | Monitor.
 *   - 2026-04-17 UX audit H-4 superseded D-16 with job-oriented labels (Option A).
 */

/** Base path for Hamilton screens. Change here if route group structure changes in Phase 40. */
export const HAMILTON_BASE = "/pro" as const;

export const HAMILTON_NAV = [
  { label: "My Bank",          href: `${HAMILTON_BASE}/hamilton`  },
  { label: "Peer Compare",     href: `${HAMILTON_BASE}/analyze`   },
  { label: "Scenarios",        href: `${HAMILTON_BASE}/simulate`  },
  { label: "Reports & Briefs", href: `${HAMILTON_BASE}/reports`   },
  { label: "Watchlist",        href: `${HAMILTON_BASE}/monitor`   },
  { label: "Admin",            href: "/admin"                     },
] as const;

export type HamiltonScreen = (typeof HAMILTON_NAV)[number]["label"];

/** Left rail workspace memory config per screen (per D-17, 02-navigation doc) */
export const LEFT_RAIL_CONFIG: Record<HamiltonScreen, {
  primaryAction: string;
  sections: string[];
}> = {
  "My Bank":          { primaryAction: "Simulate Change",          sections: ["Saved Analyses", "Recent Work"] },
  "Peer Compare":     { primaryAction: "Simulate a Change",        sections: ["Saved Analyses", "Recent Work", "Pinned Institutions"] },
  "Scenarios":        { primaryAction: "Generate Board Summary",   sections: ["Scenarios", "Saved Analyses"] },
  "Reports & Briefs": { primaryAction: "Export PDF",               sections: ["Report History", "Templates"] },
  "Watchlist":        { primaryAction: "Review Pricing",           sections: ["Watchlist", "Signal Feed"] },
  "Admin":            { primaryAction: "",                         sections: [] },
} as const;

/** CTA hierarchy per screen (per 09-copy-and-ux-rules.md) */
export const CTA_HIERARCHY: Record<Exclude<HamiltonScreen, "Admin">, {
  primary: string;
  secondary: string[];
}> = {
  "My Bank":          { primary: "Simulate Change",                 secondary: [] },
  "Peer Compare":     { primary: "Simulate a Change",               secondary: ["Show Peer Distribution", "View Risk Drivers"] },
  "Scenarios":        { primary: "Generate Board Scenario Summary", secondary: [] },
  "Reports & Briefs": { primary: "Export PDF",                      secondary: [] },
  "Watchlist":        { primary: "Review Pricing",                  secondary: ["Run Scenario"] },
} as const;

/** Analysis Focus tabs — used inside Analyze screen (per 02-navigation doc) */
export const ANALYSIS_FOCUS_TABS = ["Pricing", "Risk", "Peer Position", "Trend"] as const;
export type AnalysisFocus = (typeof ANALYSIS_FOCUS_TABS)[number];

/** Consistent label language across all screens (per D-08) */
export const HAMILTON_LABELS = {
  hamiltonsView:       "Hamilton's View",
  whatChanged:         "What Changed",
  whatThisMeans:       "What This Means",
  whyItMatters:        "Why It Matters",
  recommendedPosition: "Recommended Position",
  priorityAlert:       "Priority Alert",
  signalFeed:          "Signal Feed",
  analysisFocus:       "Analysis Focus",
} as const;
