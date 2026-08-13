---
phase: 30-institution-educational-pages
plan: 02
subsystem: consumer-ui
tags: [fee-distribution, histogram, intelligence-section, pro-gate, hamilton-cta, institution-page]
dependency_graph:
  requires: [30-01]
  provides: [institution-histogram-component, intelligence-section, related-reports-query]
  affects: [src/app/(public)/institution/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [consumer-recharts-histogram, recharts-reference-line-marker, server-side-pro-gate, dynamic-import-db-connection]
key_files:
  created:
    - src/app/(public)/institution/[id]/fee-distribution.tsx
  modified:
    - src/app/(public)/institution/[id]/page.tsx
decisions:
  - "InstitutionHistogram is a new component (not imported from fee-histogram.tsx) — admin histogram uses dark-mode/admin-card styling that conflicts with consumer warm palette"
  - "Institution ReferenceLine uses bucket label (x=label) not raw amount — Recharts xAxis is categorical so marker must match a label string"
  - "getRelatedReports uses dynamic import of getSql() to avoid circular dependency with top-level server component imports"
  - "Fee Distribution section is FREE (no pro gate) — strongest visual differentiator from NerdWallet/Bankrate per D-08 decision"
  - "Intelligence section absorbs old Report Card + Links pill row — no duplicate link set anywhere on page"
metrics:
  duration: "4 minutes"
  completed_date: "2026-04-08T20:21:43Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 1
  files_modified: 1
requirements:
  - INST-03
  - INST-04
---

# Phase 30 Plan 02: Institution Educational Pages — Fee Distribution & Intelligence Summary

**One-liner:** Recharts histogram grid (up to 6 spotlight categories, institution position in #C44B2E dashed ReferenceLine) free for all users, plus pro-gated Intelligence section with related-reports query and Hamilton CTAs absorbing the old link pill row.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fee Distribution histograms with institution marker | 27dfd77 | src/app/(public)/institution/[id]/fee-distribution.tsx, page.tsx |
| 2 | Intelligence section with reports + Hamilton CTAs | e803aeb | src/app/(public)/institution/[id]/page.tsx |
| 3 | Visual verification | — | (checkpoint: awaiting human) |

## What Was Built

### Task 1 — InstitutionHistogram Component (`fee-distribution.tsx`)

A `"use client"` component adapting the admin `FeeHistogram` pattern for consumer brand. Key differences:

- **Styling:** Consumer warm palette (`#E8DFD1` borders, `white/70` background, `#A09788` muted labels) vs. admin-card dark-mode styling
- **Bar color:** `#D4C9BA` gray for national distribution (not blue/emerald split — consumer view doesn't need charter breakdown)
- **Bucket logic:** `buildBuckets` copied and simplified — single `count` field instead of banks/creditUnions split
- **Institution marker:** `ReferenceLine` at the bucket label matching the institution's fee amount, `stroke="#C44B2E"`, `strokeWidth=2`, `strokeDasharray="3 3"`
- **Median marker:** `ReferenceLine` at median bucket label, `stroke="#A09788"`, `strokeDasharray="4 3"`
- **Chart height:** 160px (compact for 3-column grid)
- **Tooltip:** Simplified — shows range and institution count only

The `instBucketLabel` computation maps the institution's fee amount to the closest bucket's label string (required because Recharts categorical xAxis uses label strings, not numeric x values).

Page-level changes:
- Imports `getFeesForCategory` from `@/lib/crawler-db/market`
- Imports `InstitutionHistogram` from `./fee-distribution`
- Filters approved spotlight fees the institution has, fetches national distribution data in parallel
- Renders `FeeDistributionSection` between Financial Context and Fee Schedule
- Section conditionally rendered only when institution has 2+ spotlight categories

### Task 2 — Intelligence & Reports Section

**`getRelatedReports` helper:** Async function at module scope. Uses dynamic `import("@/lib/crawler-db/connection")` to get `getSql()` and queries `published_reports` for the 20 most recent public reports. Client-side keyword filter matches by charter type ("bank"/"credit union"), fed district ("district N"), and asset tier. Returns up to 5 matched reports. Wrapped in try/catch returning `[]` on any error.

**IntelligenceSection (pro users):**
- Two-column grid (`grid-cols-1 sm:grid-cols-2`)
- Left: "Related Reports" heading + report link pills (or empty state "No peer reports published yet for this segment.")
- Right: "Ask Hamilton" heading + two CTA pills in accent style ("Generate a competitive brief" → `/pro/research?prompt=competitive-brief&instId={id}`, "Ask about this institution" → `/pro/research?prompt=institution&instId={id}`)
- Secondary pills below CTAs: Fee Report Card (external), State Report, District Report, Fee Index

**IntelligenceSection (non-pro users):**
- `<UpgradeGate message="Unlock competitive intelligence — see how your peer group compares." />`

**Old block removed:** The standalone `<div className="mt-8 flex flex-wrap gap-2">` Report Card + Links pill row has been removed. All links now live exclusively inside the Intelligence section. `Fee Report Card` appears exactly once in page.tsx.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `getSql()` dynamic import pattern**
- **Found during:** Task 2 TypeScript check
- **Issue:** Plan's code sample used `{ sql: getSql }` destructuring and called `getSql()` as if it returns a client factory. Actual module exports `getSql()` which returns the postgres client directly (a tagged template literal function). The dynamic import + wrong destructuring produced TS2555/TS2349 errors.
- **Fix:** Changed to `const { getSql } = await import(...)` then `const db = getSql()` and used `db\`SELECT...\`` directly.
- **Files modified:** `src/app/(public)/institution/[id]/page.tsx`
- **Commit:** e803aeb

**2. [Rule 1 - Bug] Institution ReferenceLine uses bucket label not raw amount**
- **Found during:** Task 1 implementation
- **Issue:** Plan's spec shows `x={institutionAmount}` but Recharts categorical BarChart uses string labels on xAxis — numeric x values don't match any bucket and the line doesn't render.
- **Fix:** Computed `instBucketLabel` by finding the bucket index for the institution's amount and using its label string for the ReferenceLine `x` prop.
- **Files modified:** `src/app/(public)/institution/[id]/fee-distribution.tsx`
- **Commit:** 27dfd77

## Known Stubs

None. Distribution data comes from live `getFeesForCategory()` DB queries. Related reports come from live `published_reports` query (graceful empty state when no matches). All histogram data is real at render time.

## Threat Flags

None. `getRelatedReports` uses parameterized template literals (postgres library) — no string concatenation. Client-side title filter is read-only. Distribution data (fee amounts without institution names) is aggregate data already public on the index page. Pro gate uses server-side `canAccessPremium(user)` check.

## Self-Check: PASSED

- `src/app/(public)/institution/[id]/fee-distribution.tsx` exists
- `"use client"` on line 1 of fee-distribution.tsx: confirmed
- `export function InstitutionHistogram` in fee-distribution.tsx: confirmed
- `import { InstitutionHistogram }` in page.tsx: confirmed
- `getFeesForCategory` imported and used in page.tsx: confirmed
- `#C44B2E` accent color in fee-distribution.tsx: confirmed (stroke + label fill)
- `ReferenceLine` count in fee-distribution.tsx: 3 (import + median + institution)
- `Fee Distribution` section heading in page.tsx: confirmed (line 760)
- Fee Distribution (line 753) before Fee Schedule (line 785): confirmed correct order
- `distributionData.length >= 2` conditional render: confirmed
- `published_reports` SQL query in page.tsx: confirmed
- `competitive-brief` Hamilton CTA: confirmed
- `Ask about this institution` CTA: confirmed
- `Unlock competitive intelligence` UpgradeGate message: confirmed
- `No peer reports published yet` empty state: confirmed
- `Fee Report Card` appears exactly 1 time in page.tsx: confirmed
- Commits 27dfd77 and e803aeb present in git log: confirmed
- TypeScript: no errors in institution page files (pre-existing test-file errors are out of scope)
- No console.log statements added
