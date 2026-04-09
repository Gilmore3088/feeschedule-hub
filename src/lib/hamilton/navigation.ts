/**
 * Hamilton Navigation — Single source of truth.
 * Top nav labels, left rail structure, CTA hierarchy, and label constants.
 * Per D-16: Nav locked to Home | Analyze | Simulate | Reports | Monitor | Admin.
 * Per D-17: Left rail + CTA hierarchy defined here, not in components.
 */

/** Base path for Hamilton screens. Change here if route group structure changes in Phase 40. */
export const HAMILTON_BASE = "/pro" as const;

export const HAMILTON_NAV = [
  { label: "Home",     href: `${HAMILTON_BASE}/home`     },
  { label: "Analyze",  href: `${HAMILTON_BASE}/analyze`  },
  { label: "Simulate", href: `${HAMILTON_BASE}/simulate` },
  { label: "Reports",  href: `${HAMILTON_BASE}/reports`  },
  { label: "Monitor",  href: `${HAMILTON_BASE}/monitor`  },
  { label: "Admin",    href: "/admin"                    },
] as const;

export type HamiltonScreen = (typeof HAMILTON_NAV)[number]["label"];

/** Left rail workspace memory config per screen (per D-17, 02-navigation doc) */
export const LEFT_RAIL_CONFIG: Record<HamiltonScreen, {
  primaryAction: string;
  sections: string[];
}> = {
  Home:     { primaryAction: "Simulate Change",          sections: ["Saved Analyses", "Recent Work"] },
  Analyze:  { primaryAction: "Simulate a Change",        sections: ["Saved Analyses", "Recent Work", "Pinned Institutions"] },
  Simulate: { primaryAction: "Generate Board Summary",   sections: ["Scenarios", "Saved Analyses"] },
  Reports:  { primaryAction: "Export PDF",               sections: ["Report History", "Templates"] },
  Monitor:  { primaryAction: "Review Pricing",           sections: ["Watchlist", "Signal Feed"] },
  Admin:    { primaryAction: "",                         sections: [] },
} as const;

/** CTA hierarchy per screen (per 09-copy-and-ux-rules.md) */
export const CTA_HIERARCHY: Record<Exclude<HamiltonScreen, "Admin">, {
  primary: string;
  secondary: string[];
}> = {
  Home:     { primary: "Simulate Change",                 secondary: [] },
  Analyze:  { primary: "Simulate a Change",               secondary: ["Show Peer Distribution", "View Risk Drivers"] },
  Simulate: { primary: "Generate Board Scenario Summary", secondary: [] },
  Reports:  { primary: "Export PDF",                      secondary: [] },
  Monitor:  { primary: "Review Pricing",                  secondary: ["Run Scenario"] },
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
