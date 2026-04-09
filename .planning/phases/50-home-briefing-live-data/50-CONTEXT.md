# Phase 50: Home / Briefing Live Data - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Strip all hardcoded fallback content from the 6 Home screen components (HamiltonViewCard, PositioningEvidence, WhatChangedCard, PriorityAlertsCard, RecommendedActionCard, MonitorFeedPreview) and ensure they render exclusively from real data passed by the page via `fetchHomeBriefingData()` and `fetchHomeBriefingSignals()`. When data is missing, show onboarding guidance empty states — never fake data.

</domain>

<decisions>
## Implementation Decisions

### Thesis Generation Failure
- **D-01:** When `generateGlobalThesis()` fails (API unavailable, rate limited, key missing), show data-only fallback: positioning numbers are real, just no AI narrative
- **D-02:** Log a backend warning (console.warn with structured context) when thesis generation fails for a client — operators need visibility into API failures
- **D-03:** Never show fabricated thesis text as fallback — the card renders positioning data only

### Hardcoded Content Removal
- **D-04:** HamiltonViewCard: remove hardcoded thesis text ("Pricing is stable while risk is rising...") and recommendation text ("Evaluate reducing overdraft to $30-$31...")
- **D-05:** PriorityAlertsCard: remove hardcoded "Overdraft fee is $4 above median" fallback
- **D-06:** WhatChangedCard: remove hardcoded signal entries ("Peer median decreased $1 this quarter")
- **D-07:** MonitorFeedPreview: remove hardcoded CFPB content
- **D-08:** All components must render from props passed by the page — no internal default data

### Empty States
- **D-09:** Each card with no real data shows onboarding guidance:
  - WhatChangedCard: "Configure your watchlist to see fee changes here"
  - PriorityAlertsCard: "No active alerts. Hamilton will flag high-priority changes."
  - MonitorFeedPreview: "Add institutions to your watchlist to see the signal feed"
  - RecommendedActionCard: "Complete your institution profile in Settings to get personalized recommendations"
- **D-10:** Empty states must look intentional (styled within Hamilton design system), not broken

### Data Integrity (HOME-05)
- **D-11:** Every number displayed must come from a real DB query — zero hardcoded fee amounts
- **D-12:** Thesis text must come from real `generateGlobalThesis()` call — zero placeholder narrative
- **D-13:** RecommendedActionCard's suggested category must derive from thesis output, not hardcoded

### Claude's Discretion
- Exact empty state visual styling within Hamilton design system
- Whether to use a toast/banner or inline indicator for thesis-unavailable state
- Positioning evidence layout when fewer than 6 spotlight categories have data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Page
- `src/app/pro/(hamilton)/hamilton/page.tsx` — Main page, calls fetchHomeBriefingData + fetchHomeBriefingSignals

### Components (6 files to strip)
- `src/components/hamilton/home/HamiltonViewCard.tsx` — Has hardcoded thesis fallback (line ~130-133)
- `src/components/hamilton/home/PositioningEvidence.tsx` — May have positioning fallbacks
- `src/components/hamilton/home/WhatChangedCard.tsx` — Has hardcoded signal entries (line ~25)
- `src/components/hamilton/home/PriorityAlertsCard.tsx` — Has hardcoded alert text (line ~79)
- `src/components/hamilton/home/RecommendedActionCard.tsx` — Check for hardcoded category
- `src/components/hamilton/home/MonitorFeedPreview.tsx` — Has hardcoded CFPB content (line ~26)

### Data Layer
- `src/lib/hamilton/home-data.ts` — fetchHomeBriefingData() + fetchHomeBriefingSignals() — already real
- `src/lib/hamilton/generate.ts` — generateGlobalThesis() function

### Handoff
- `.planning/MILESTONE_8_HANDOFF.md` — Section "Screen 3: Home / Briefing"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchHomeBriefingData()` already calls real `generateGlobalThesis()` with monthly_pulse scope
- `fetchHomeBriefingSignals()` already queries real hamilton_signals and hamilton_priority_alerts
- `getNationalIndexCached()` returns real fee index data
- Page already calls both functions and passes data to components

### Established Patterns
- Thesis returns null on API failure — components should handle null gracefully
- Signal/alert queries return empty arrays on failure — clean empty state
- Monitor Phase 49 established the onboarding guidance empty state pattern

### Integration Points
- HamiltonViewCard receives thesis data from page — strip internal fallback
- RecommendedActionCard links to `/pro/simulate?category={recommended}` — derived from thesis
- MonitorFeedPreview shows latest 3 signals — same data source as Monitor screen

</code_context>

<specifics>
## Specific Ideas

- Backend warning on thesis failure should include: user_id, timestamp, error type (rate_limit vs api_error vs missing_key)
- Data-only fallback in HamiltonViewCard: show the positioning table with a note "AI analysis temporarily unavailable"

</specifics>

<deferred>
## Deferred Ideas

- User-specific thesis (with institution peer context injected) — current thesis is national-level. Phase 51+ could personalize.
- Thesis caching/scheduling — generate once daily instead of on-demand

</deferred>

---

*Phase: 50-home-briefing-live-data*
*Context gathered: 2026-04-09*
