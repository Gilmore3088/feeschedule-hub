---
phase: 50-home-briefing-live-data
plan: "01"
subsystem: hamilton-home
tags: [hamilton, home, live-data, empty-states, hardcoded-removal]
dependency_graph:
  requires: []
  provides: [clean-home-components-from-props]
  affects: [src/app/pro/(hamilton)/hamilton/page.tsx]
tech_stack:
  added: []
  patterns: [onboarding-empty-state, props-only-rendering]
key_files:
  created: []
  modified:
    - src/components/hamilton/home/WhatChangedCard.tsx
    - src/components/hamilton/home/PriorityAlertsCard.tsx
    - src/components/hamilton/home/MonitorFeedPreview.tsx
    - src/components/hamilton/home/PositioningEvidence.tsx
decisions:
  - "Empty states use inline centered paragraph with hamilton-on-surface-variant color — no separate EmptyState component needed at this scale"
  - "PositioningEvidence percentile column suppressed entirely — PositioningEntry has no percentile field and computing it requires institution-specific data not in scope"
  - "PositioningEvidence third column repurposed to Coverage/Maturity using maturityTier field from real data"
  - "WhatChangedCard emoji literals replaced with unicode symbols (no emojis per coding style rules)"
  - "WhyItMatters removed entirely — fabricated claims violate HOME-05; real alert items provide their own context"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-09T20:01:32Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 50 Plan 01: Strip Hardcoded Home Component Defaults — Summary

**One-liner:** Removed all hardcoded fallback data from 4 Hamilton Home components — WhatChangedCard, PriorityAlertsCard, MonitorFeedPreview, PositioningEvidence — replacing fake content with props-only rendering and styled onboarding empty states.

## What Was Built

All 4 Home/Briefing components now render exclusively from props passed by the page. When those props are empty arrays, each component shows a contextual onboarding guidance message styled within the Hamilton design system.

### Task 1 — WhatChangedCard, PriorityAlertsCard, MonitorFeedPreview (commit `44d58e9`)

**WhatChangedCard:** Deleted `DEFAULT_CARDS` array (3 fake signal entries including "Peer median decreased $1 this quarter") and `DefaultCard` interface. Empty branch now shows: "Configure your watchlist to see fee changes here".

**PriorityAlertsCard:** Deleted `DefaultAlerts` component (hardcoded "Overdraft fee is $4 above median", "Complaint language worsening") and the entire `WhyItMatters` component (fabricated bullets: "Retention risk is rising", "Peer pricing direction shifting downward", "Revenue exposure is increasing"). Empty branch now shows: "No active alerts. Hamilton will flag high-priority changes."

**MonitorFeedPreview:** Deleted `DEFAULT_FEED` array (hardcoded CFPB and "Heritage First" content) and `DefaultFeedItem` interface. Empty branch now shows: "Add institutions to your watchlist to see the signal feed". Vertical timeline line conditionally rendered only when signals exist.

### Task 2 — PositioningEvidence (commit `01dfee5`)

- Deleted `DefaultStats` component with hardcoded `$33.00`, `$29.00`, `88th` values
- Fixed semantic error: `peerMedian` was incorrectly reading from `first?.p25Amount` (25th percentile) — now uses `first?.medianAmount` (actual market median). Column relabeled "Market Median"
- Removed hardcoded labels: "High Outlier", "Market Benchmark", "Top Quartile Pricing (High Risk)"
- Removed hardcoded 88% progress bar — suppressed entirely (no percentile data in `PositioningEntry`)
- Third stat column repurposed: now shows category display name + maturity tier badge from real `maturityTier` field
- Empty state: "Configure your institution in Settings to see positioning data"
- "View full distribution" link only renders when `entries.length > 0`

## Verification

```
Combined audit (zero hardcoded content): EXIT 1 (no matches — pass)
Onboarding text audit (4 matches, one per component): EXIT 0 (pass)
TypeScript errors in modified files: 0 (pre-existing errors in unrelated files)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] Removed emojis from WhatChangedCard labelMap**
- **Found during:** Task 1
- **Issue:** CLAUDE.md coding style rules prohibit emojis in production code; the original had emoji literals in the labelMap for the props-rendering branch
- **Fix:** Replaced emoji literals (📉, 🏦, ⚠️) with unicode symbols (↘, ⬡, ⚠) in labelMap
- **Files modified:** `src/components/hamilton/home/WhatChangedCard.tsx`
- **Commit:** `44d58e9`

**2. [Rule 1 - Bug] Fixed peerMedian using wrong field**
- **Found during:** Task 2
- **Issue:** `peerMedian` was assigned from `first?.p25Amount` (25th percentile, not the median). The existing real-data branch had this bug before this plan.
- **Fix:** Changed to `first?.medianAmount`; renamed column label from "Peer Median" to "Market Median" since there is no institution-specific fee — it represents the national/peer median
- **Files modified:** `src/components/hamilton/home/PositioningEvidence.tsx`
- **Commit:** `01dfee5`

## Known Stubs

None. All 4 components now render from real props. Empty states are intentional onboarding guidance, not data stubs.

## Threat Flags

None. These components display read-only aggregate data passed from server-side props. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- `src/components/hamilton/home/WhatChangedCard.tsx` — exists, verified
- `src/components/hamilton/home/PriorityAlertsCard.tsx` — exists, verified
- `src/components/hamilton/home/MonitorFeedPreview.tsx` — exists, verified
- `src/components/hamilton/home/PositioningEvidence.tsx` — exists, verified
- Commit `44d58e9` — present in git log
- Commit `01dfee5` — present in git log
