# Phase 50: Home / Briefing Live Data - Research

**Researched:** 2026-04-09
**Domain:** Next.js server components, React prop wiring, hardcoded content removal
**Confidence:** HIGH — all findings are direct code inspection of source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** When `generateGlobalThesis()` fails, show data-only fallback — positioning numbers real, no AI narrative
- **D-02:** Log `console.warn` with structured context (user_id, timestamp, error type) when thesis fails for a client
- **D-03:** Never show fabricated thesis text as fallback
- **D-04:** HamiltonViewCard: remove `DEFAULT_THESIS_TEXT` and `DEFAULT_RECOMMENDED_ACTION` constants
- **D-05:** PriorityAlertsCard: remove `DefaultAlerts` component (hardcoded "Overdraft fee is $4 above median")
- **D-06:** WhatChangedCard: remove `DEFAULT_CARDS` array (hardcoded signal entries)
- **D-07:** MonitorFeedPreview: remove `DEFAULT_FEED` array (hardcoded CFPB content)
- **D-08:** All components render from props only — no internal default data

### Empty States (per D-09)
- WhatChangedCard empty: "Configure your watchlist to see fee changes here"
- PriorityAlertsCard empty: "No active alerts. Hamilton will flag high-priority changes."
- MonitorFeedPreview empty: "Add institutions to your watchlist to see the signal feed"
- RecommendedActionCard no-thesis: "Complete your institution profile in Settings to get personalized recommendations"

### Data Integrity
- **D-11:** Every number from real DB query — zero hardcoded fee amounts
- **D-12:** Thesis text from real `generateGlobalThesis()` — zero placeholder narrative
- **D-13:** RecommendedActionCard's category derived from thesis output, not hardcoded

### Claude's Discretion
- Exact empty state visual styling within Hamilton design system
- Whether to use toast/banner or inline indicator for thesis-unavailable state
- PositioningEvidence layout when fewer than 6 spotlight categories have data

### Deferred (OUT OF SCOPE)
- User-specific thesis with institution peer context injected (Phase 51+)
- Thesis caching/scheduling (generate once daily)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 | HamiltonViewCard calls real generateGlobalThesis() with user's peer context | Already wired — page passes `data.thesis`; fix is removing `DEFAULT_THESIS_TEXT` fallback inside component |
| HOME-02 | PositioningEvidence queries real getNationalIndex() for user's institution fee categories | Already wired via `data.positioning`; fix is removing `DefaultStats` hardcoded component |
| HOME-03 | WhatChangedCard + PriorityAlertsCard query real signal/alert tables | Page already passes real props; fixes are removing `DEFAULT_CARDS` and `DefaultAlerts` |
| HOME-04 | RecommendedActionCard derives from thesis, links to Simulate with suggested category | Component already wired correctly with `recommendedCategory` prop; page is NOT passing it — gap identified |
| HOME-05 | All data shown traces to pipeline-verified sources — no hallucinated data or fabricated recommendations | Requires removing all 6 hardcoded fallback locations identified below |
</phase_requirements>

---

## Summary

Phase 50 is a targeted hardcoded-content removal and prop-wiring phase. The data layer (`home-data.ts`) is fully implemented and already returning real data. The page (`hamilton/page.tsx`) already calls both `fetchHomeBriefingData()` and `fetchHomeBriefingSignals()` and passes results to components as props. The problem is purely at the component level: each component has internal fallback data (constants, helper components) that renders when the prop is empty or null — and in one case, the page is not passing the prop at all.

The work divides cleanly into three categories: (1) remove internal hardcoded defaults from 4 components, (2) replace those defaults with proper onboarding-guidance empty states, and (3) fix two page-level wiring gaps (RecommendedActionCard not rendered, duplicate WhatChangedCard rendered twice).

There is also a secondary concern in `PositioningEvidence`: the component correctly handles `entries.length === 0` by rendering `<DefaultStats />` with hardcoded `$33.00 / $29.00 / 88th` values, and hardcodes the progress bar at `width: "88%"` and the `88th` percentile stat even when real data is present. Both must be removed.

**Primary recommendation:** Fix components in dependency order — WhatChangedCard and PriorityAlertsCard first (simplest, no null handling), then MonitorFeedPreview, then PositioningEvidence (requires percentile computation or suppression), then HamiltonViewCard (requires thesis-null branch polish), then fix page wiring to add RecommendedActionCard and remove duplicate WhatChangedCard.

---

## Component Audit — Exact Hardcoded Locations

[VERIFIED: direct file read]

### 1. HamiltonViewCard (`src/components/hamilton/home/HamiltonViewCard.tsx`)

**Props received:** `thesis: ThesisOutput | null`, `confidence: "high" | "medium" | "low"`

**Hardcoded locations:**
- Lines 129-133: `DEFAULT_THESIS_TEXT` constant — `"Pricing is stable while risk is rising..."` — used as `thesis?.core_thesis ?? DEFAULT_THESIS_TEXT`
- Line 133: `DEFAULT_RECOMMENDED_ACTION` constant — used as `thesis?.narrative_summary ?? DEFAULT_RECOMMENDED_ACTION`

**Current null behavior:** When `thesis === null`, `EmptyState` is shown for the thesis paragraph (correct), but `recommendedText` still resolves to `DEFAULT_RECOMMENDED_ACTION` via the nullish coalescing fallback — the Recommended Action block ALWAYS renders with hardcoded text regardless of thesis null state.

**Fix required:**
- Delete `DEFAULT_THESIS_TEXT` and `DEFAULT_RECOMMENDED_ACTION` constants
- Change `thesisText` to `thesis?.core_thesis ?? null`
- Change `recommendedText` to `thesis?.narrative_summary ?? null`
- When `thesis === null`: existing `EmptyState` covers the thesis area; Recommended Action block should either be hidden or show "AI analysis temporarily unavailable" inline note (D-02 data-only fallback)
- Confidence attribution line ("High confidence — based on fee data, peer movement...") is hardcoded — should reflect actual `confidence` prop value

**Page passes:** `thesis={data.thesis}` and `confidence={data.confidence}` — already correct [VERIFIED]

---

### 2. PositioningEvidence (`src/components/hamilton/home/PositioningEvidence.tsx`)

**Props received:** `entries: PositioningEntry[]`

**Hardcoded locations:**
- Lines 22-78: `DefaultStats` component with `$33.00`, `$29.00`, `88th` — rendered when `entries.length === 0`
- Lines 157-159: `88th` percentile hardcoded in the real-data branch (when entries exist)
- Lines 191-193: Progress bar `width: "88%"` hardcoded in both branches
- Line 126: `"High Outlier"` label hardcoded (no logic to derive this from actual data)
- Line 144: `"Market Benchmark"` label hardcoded
- Line 152-153: `"Top Quartile Pricing (High Risk)"` label hardcoded

**Current data mapping (real-data branch):**
- `yourFee = first?.medianAmount` — uses first entry's median as "Your Fee" (not institution-specific, uses national median)
- `peerMedian = first?.p25Amount` — uses P25 as "Peer Median" (semantically incorrect — P25 is the 25th percentile, not the peer median)

**Fix required:**
- Remove `DefaultStats` component; replace `entries.length === 0` branch with proper empty state (per D-09: "Configure your institution in Settings to see positioning data" — already exists as `EmptyState` component at line 14, just not used for the zero-entries case)
- For the percentile stat: either compute it from real data or suppress/hide the Percentile column when derivable data isn't available. No formula for percentile is currently in the data layer — this is a gap requiring a decision (Claude's Discretion)
- Fix `peerMedian` to use `first?.medianAmount` (the actual median) — P25 is not the peer median
- Replace hardcoded outlier labels with data-driven logic or remove them

**Page passes:** `entries={data.positioning}` — already correct [VERIFIED]

**Data layer note:** `PositioningEntry` interface provides `medianAmount`, `p25Amount`, `p75Amount`, `institutionCount`, `maturityTier`. There is no `percentile` field. Computing percentile requires knowing where the institution's own fee sits relative to the distribution — but the institution's own fee is not in the data layer. This is a pre-existing gap; suppress the Percentile column rather than hardcode a number.

---

### 3. WhatChangedCard (`src/components/hamilton/home/WhatChangedCard.tsx`)

**Props received:** `signals: SignalEntry[]`

**Hardcoded locations:**
- Lines 21-40: `DEFAULT_CARDS` array with 3 hardcoded entries (Market Move / Peer Shift / Local Trend with fake text)
- Lines 60-93: Entire `signals.length === 0` branch renders the `DEFAULT_CARDS` array

**Fix required:**
- Delete `DEFAULT_CARDS` array and `DefaultCard` interface
- Replace the `signals.length === 0` branch with onboarding guidance empty state: "Configure your watchlist to see fee changes here" (per D-09)

**Page wiring note — CRITICAL GAP:**
The page renders `WhatChangedCard` TWICE:
1. Line 190: `<WhatChangedCard signals={[]} />` — inside the ISR-cached first row (always passes empty array)
2. Line 67: `<WhatChangedCard signals={signals.whatChanged} />` — inside `<BriefingSignals>` Suspense boundary (passes real data)

The first render (line 190) hardcodes an empty array, meaning WhatChangedCard in row 1 will always show the empty state or defaults. This is a layout/architecture issue in `page.tsx`. The planner must decide: remove the first WhatChangedCard entirely, or restructure the layout so WhatChangedCard only appears in BriefingSignals. [VERIFIED: page.tsx lines 190 and 67]

---

### 4. PriorityAlertsCard (`src/components/hamilton/home/PriorityAlertsCard.tsx`)

**Props received:** `alerts: AlertEntry[]`

**Hardcoded locations:**
- Lines 59-113: `DefaultAlerts` component with two hardcoded items: "Overdraft fee is $4 above median" and "Complaint language worsening"
- Line 161: `alerts.length === 0 ? <DefaultAlerts /> : ...` — the entire alerts-empty branch shows fake data

**Additional hardcoded content:**
- Lines 13-57: `WhyItMatters` sub-component with 3 fully hardcoded bullet points ("Retention risk is rising", "Peer pricing direction shifting downward", "Revenue exposure is increasing") — this always renders regardless of alerts prop

**Fix required:**
- Delete `DefaultAlerts` component
- Replace `alerts.length === 0` branch with onboarding guidance: "No active alerts. Hamilton will flag high-priority changes." (per D-09)
- Decision needed on `WhyItMatters`: the content is thematically generic — either remove it, populate it from thesis `tensions` array, or retain as static framing text (Claude's Discretion)

**Page wiring note:**
The page also renders `<PriorityAlertsCard alerts={[]} />` with hardcoded empty array at line 195 (ISR-cached first row), AND passes real data via BriefingSignals at line 68. Same dual-render issue as WhatChangedCard. [VERIFIED: page.tsx lines 195 and 68]

---

### 5. MonitorFeedPreview (`src/components/hamilton/home/MonitorFeedPreview.tsx`)

**Props received:** `signals: SignalEntry[]`

**Hardcoded locations:**
- Lines 22-35: `DEFAULT_FEED` array with 2 hardcoded entries (CFPB junk fees narrative, Heritage First overdraft story)
- Lines 99-171: `!hasSignals ? DEFAULT_FEED.map(...)` — renders fake feed when `signals` is empty

**Fix required:**
- Delete `DEFAULT_FEED` array and `DefaultFeedItem` interface
- Replace the `!hasSignals` branch with onboarding guidance: "Add institutions to your watchlist to see the signal feed" (per D-09)

**Page passes:** `signals={signals.monitorFeed}` via BriefingSignals — already correct [VERIFIED]

---

### 6. RecommendedActionCard (`src/components/hamilton/home/RecommendedActionCard.tsx`)

**Props received:** `recommendedCategory: string | null`, `thesisExists: boolean`

**Hardcoded content:**
- Line 25: `const category = recommendedCategory ?? "overdraft"` — falls back to "overdraft" when null
- `thesisExists: false` branch already shows onboarding-style text: "Complete your institution setup in Settings to receive personalized recommendations." (matches D-09 intent)
- `thesisExists: true` branch already shows correct dynamic text with derived category
- Link to `/pro/simulate?category=${category}` already implemented correctly

**Critical gap:** `RecommendedActionCard` is **not rendered anywhere in page.tsx**. [VERIFIED: grep found no import or usage of RecommendedActionCard in page.tsx]

**Fix required:**
- Add `RecommendedActionCard` import to `page.tsx`
- Render it with `recommendedCategory={data.recommendedCategory}` and `thesisExists={data.thesis !== null}`
- The `recommendedCategory ?? "overdraft"` fallback inside the component is acceptable per D-13 (data.recommendedCategory in home-data.ts already sets a fallback to "overdraft" when thesis doesn't mention any spotlight category — this is data-layer driven, not a hardcoded UI default)

---

## Page Architecture Audit

[VERIFIED: direct read of page.tsx]

### Current page structure

```
HamiltonHomePage (ISR 24h)
├── fetchHomeBriefingData()         ← real data, ISR cached
│
├── Row 1 (ISR grid):
│   ├── WhatChangedCard signals={[]}     ← ALWAYS EMPTY — BUG
│   ├── HamiltonViewCard thesis={data.thesis}  ← correctly wired
│   └── PriorityAlertsCard alerts={[]}   ← ALWAYS EMPTY — BUG
│
├── PositioningEvidence entries={data.positioning}  ← correctly wired
│
└── <Suspense fallback={SignalsSkeleton}>
    └── BriefingSignals (unstable_noStore)
        ├── WhatChangedCard signals={signals.whatChanged}  ← real data (duplicate)
        ├── PriorityAlertsCard alerts={signals.priorityAlerts}  ← real data (duplicate)
        └── MonitorFeedPreview signals={signals.monitorFeed}  ← real data
```

### Required final page structure

```
HamiltonHomePage (ISR 24h)
├── fetchHomeBriefingData()
│
├── Row 1 (ISR grid):
│   ├── HamiltonViewCard thesis={data.thesis} confidence={data.confidence}
│   └── [sidebar slot — PriorityAlerts moved to BriefingSignals]
│
├── PositioningEvidence entries={data.positioning}
│
├── RecommendedActionCard                      ← ADD THIS
│   recommendedCategory={data.recommendedCategory}
│   thesisExists={data.thesis !== null}
│
└── <Suspense fallback={SignalsSkeleton}>
    └── BriefingSignals (unstable_noStore)
        ├── WhatChangedCard signals={signals.whatChanged}
        ├── PriorityAlertsCard alerts={signals.priorityAlerts}
        └── MonitorFeedPreview signals={signals.monitorFeed}
```

**Note:** The planner must decide the final layout for the ISR row 1 sidebar. Options:
1. Move PriorityAlertsCard entirely into BriefingSignals (no ISR-cached sidebar)
2. Keep sidebar slot but fill it with something static that belongs in ISR (e.g., a static "Why It Matters" panel populated from thesis tensions)

---

## Thesis Failure Handling (D-01, D-02, D-03)

[VERIFIED: home-data.ts lines 147-153, generate.ts lines 195-242]

### Current behavior
- `fetchHomeBriefingData()` wraps `generateGlobalThesis()` in try/catch at line 147-153
- On failure: `thesis = null`, function returns normally — no warning logged
- Error is silently swallowed with empty catch block: `} catch { thesis = null; }`

### Required behavior (per D-02)
The catch block must add a `console.warn` with structured context:

```typescript
} catch (err) {
  console.warn('[Hamilton] Thesis generation failed', {
    timestamp: new Date().toISOString(),
    errorType: classifyThesisError(err),
    scope: 'monthly_pulse',
  });
  thesis = null;
}
```

**Error classification:** `generate.ts` throws errors with message pattern `Hamilton thesis generation failed [scope=...]: {message}`. The message content reveals error type:
- Contains "API key" or "ANTHROPIC_API_KEY" → `missing_key`
- Contains "rate_limit" or "429" → `rate_limit`
- All others → `api_error`

**Location for the warning:** `home-data.ts` in `fetchHomeBriefingData()` catch block (not in `generate.ts` itself — generate.ts is shared and shouldn't know about user context). When user_id becomes available in the function signature (after thesis-with-user-context is implemented in Phase 51+), user_id can be added to the warn payload. For now, log without user_id.

### HamiltonViewCard thesis-null branch

**Current:** When `thesis === null`, `EmptyState` renders for the thesis text block, but the Recommended Action block STILL renders with `DEFAULT_RECOMMENDED_ACTION` text (the nullish coalescing fallback).

**Required:** When `thesis === null`:
- Thesis block: show inline note "AI analysis temporarily unavailable" instead of the generic EmptyState (per D-01 specifics)
- Recommended Action block: hide entirely, or show "Analysis unavailable" note
- Do NOT render `DEFAULT_RECOMMENDED_ACTION` text

---

## Architecture Patterns

### Hamilton Design System tokens
[VERIFIED: direct read of components]

All components use CSS custom properties scoped to `.hamilton-shell`:
- `var(--hamilton-surface-container-lowest)` — card backgrounds
- `var(--hamilton-on-surface-variant)` — muted text, labels
- `var(--hamilton-primary)` — brand color (terracotta)
- `var(--hamilton-error)` — alert/risk indicators
- `var(--hamilton-radius-lg)` — border radius

Empty states must use `var(--hamilton-on-surface-variant)` for text color and follow the existing pattern in `PositioningEvidence.EmptyState` and `HamiltonViewCard.EmptyState`:
- Paragraph at ~`0.875rem` with `lineHeight: 1.6`
- Optional secondary line at `0.8125rem` in `var(--hamilton-text-tertiary)`
- Padding: `1rem 0` to `2rem 0`

### Server component pattern
All 6 components are server components (no `"use client"` directive). Empty states require no interactivity — plain JSX. [VERIFIED]

### `timeAgo()` usage
WhatChangedCard and MonitorFeedPreview both import and use `timeAgo(signal.createdAt)` from `@/lib/format`. The `createdAt` field is a string (ISO or PostgreSQL timestamp). `timeAgo()` already guards against empty/NaN inputs per MEMORY.md. No changes needed to the format utility.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Thesis error classification | Custom error type system | Simple string `includes()` check on error.message |
| Percentile calculation | Client-side math | Suppress the column — no institution-level fee is in scope |
| Empty state styling | New CSS classes | Reuse existing EmptyState pattern from HamiltonViewCard / PositioningEvidence |
| User_id in page | Auth re-fetch | `getCurrentUser()` already called in BriefingSignals — pass to fetchHomeBriefingData if needed |

---

## Common Pitfalls

### Pitfall 1: Removing the nullish coalescing fallback but keeping the render block
**What goes wrong:** Developer removes `DEFAULT_THESIS_TEXT` constant but leaves `thesisText` used in JSX without guarding the `thesis === null` case in the Recommended Action block.
**How to avoid:** The Recommended Action block must be wrapped in `{thesis !== null && (...)}` guard.

### Pitfall 2: Fixing the component but not the page dual-render
**What goes wrong:** WhatChangedCard and PriorityAlertsCard are fixed to show proper empty states, but the page still passes `signals={[]}` and `alerts={[]}` in row 1 — so users always see the empty state on initial load and then see real data after Suspense resolves (flash of empty state).
**How to avoid:** Remove the ISR-row instances; let Suspense handle both.

### Pitfall 3: Forgetting RecommendedActionCard is not in the page
**What goes wrong:** All 6 component fixes are complete but HOME-04 still fails because the component is never rendered.
**How to avoid:** Explicitly add the component to page.tsx imports and JSX.

### Pitfall 4: PositioningEvidence "Your Fee" label is semantic fiction
**What goes wrong:** `yourFee` maps to `first.medianAmount` — the national median for the first spotlight category. This is NOT the user's institution's fee. It looks like "Your Fee" but it's the market median.
**How to avoid:** Either rename the label to "Market Median" or note this as a known limitation. Without institution-specific fee data in scope, this column cannot show a true "Your Fee".

### Pitfall 5: Hardcoded "Updated 24m ago" and "Trend: Worsening" in page header
**What goes wrong:** The page header (lines 117, 139 in page.tsx) has two hardcoded strings that also violate HOME-05.
**How to avoid:** These are also hardcoded data — "Updated 24m ago" should derive from a real timestamp; "Trend: Worsening" should derive from thesis or signal data. Include these in the fix scope.

---

## Hardcoded Content Inventory

Complete list of all hardcoded content to remove, by file:

[VERIFIED: direct file reads]

| File | Line(s) | Content | Fix |
|------|---------|---------|-----|
| `HamiltonViewCard.tsx` | 129-130 | `DEFAULT_THESIS_TEXT` constant | Delete; use `thesis?.core_thesis` |
| `HamiltonViewCard.tsx` | 132-133 | `DEFAULT_RECOMMENDED_ACTION` constant | Delete; guard entire Recommended Action block |
| `HamiltonViewCard.tsx` | 202 | Hardcoded "High confidence — based on..." | Derive from `confidence` prop or remove |
| `WhatChangedCard.tsx` | 21-40 | `DEFAULT_CARDS` array | Delete entire array + `DefaultCard` interface |
| `WhatChangedCard.tsx` | 60-93 | Empty-branch rendering DEFAULT_CARDS | Replace with onboarding empty state |
| `PriorityAlertsCard.tsx` | 59-113 | `DefaultAlerts` component | Delete; replace with onboarding empty state |
| `PriorityAlertsCard.tsx` | 36-55 | `WhyItMatters` hardcoded bullets | Decision: remove or populate from thesis tensions |
| `MonitorFeedPreview.tsx` | 22-35 | `DEFAULT_FEED` array | Delete entire array + `DefaultFeedItem` interface |
| `MonitorFeedPreview.tsx` | 99-171 | Empty-branch rendering DEFAULT_FEED | Replace with onboarding empty state |
| `PositioningEvidence.tsx` | 22-78 | `DefaultStats` component | Delete; use existing `EmptyState` component |
| `PositioningEvidence.tsx` | 157-159 | Hardcoded `88th` percentile stat | Remove Percentile column or suppress |
| `PositioningEvidence.tsx` | 191-193 | Progress bar `width: "88%"` | Remove or compute from real data |
| `PositioningEvidence.tsx` | 126, 144 | "High Outlier", "Market Benchmark" labels | Remove or derive |
| `page.tsx` | 117 | "Updated 24m ago" | Derive from real timestamp or remove |
| `page.tsx` | 139 | "Trend: Worsening" | Derive from thesis/signals or remove |
| `page.tsx` | 190 | `<WhatChangedCard signals={[]} />` | Remove (keep only BriefingSignals version) |
| `page.tsx` | 195 | `<PriorityAlertsCard alerts={[]} />` | Remove (keep only BriefingSignals version) |
| `page.tsx` | — | No `RecommendedActionCard` | Add render with real props |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| HOME-01 | HamiltonViewCard renders thesis text when thesis is not null | visual / manual | Server component — no existing unit test |
| HOME-02 | PositioningEvidence renders real data without DefaultStats | visual / manual | No existing unit test |
| HOME-03 | WhatChangedCard + PriorityAlertsCard show empty states when arrays are empty | visual / manual | No existing unit test |
| HOME-04 | RecommendedActionCard appears and links to `/pro/simulate?category=X` | visual / manual | Component is not yet rendered |
| HOME-05 | No hardcoded strings remain in the 6 components | grep audit | `grep -r "DEFAULT_THESIS_TEXT\|DEFAULT_CARDS\|DEFAULT_FEED\|DefaultAlerts\|DefaultStats\|Overdraft fee is \$4\|Peer median decreased"` returns no matches |

### Automated Verification Command
```bash
# Confirm all hardcoded content constants are gone
grep -rn "DEFAULT_THESIS_TEXT\|DEFAULT_RECOMMENDED_ACTION\|DEFAULT_CARDS\|DEFAULT_FEED\|DefaultAlerts\|DefaultStats\|\$33\.00\|\$29\.00\|88th\|Overdraft fee is \\\$4\|Peer median decreased\|Heritage First\|CFPB release confirms" \
  src/components/hamilton/home/ src/app/pro/\(hamilton\)/hamilton/page.tsx

# Should return zero matches
```

### Wave 0 Gaps
None — existing vitest infrastructure covers utility functions. Component render tests are manual-verify (no component test harness). The grep audit command above serves as automated verification.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 50 is code/config-only changes to existing TypeScript/React files. No new external dependencies.

---

## Security Domain

V5 Input Validation: Not applicable — no user-controlled inputs processed in this phase. Components receive server-fetched data only.
V4 Access Control: Not applicable — auth gating is handled by Hamilton layout, not individual components.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RecommendedActionCard` is not imported or rendered in page.tsx | Component Audit — #6 | Low: verified by grep returning no matches |
| A2 | The `WhyItMatters` sub-component in PriorityAlertsCard is considered hardcoded content per HOME-05 | Hardcoded Inventory | Low: it contains no fee amounts; exclusion from fix scope is defensible |
| A3 | Suppressing the Percentile column in PositioningEvidence is acceptable per Claude's Discretion | PositioningEvidence section | Medium: if user expects a percentile, empty dash may confuse |
| A4 | "Updated 24m ago" and "Trend: Worsening" in page header are in scope for HOME-05 | Pitfalls section | Medium: they are hardcoded data, but CONTEXT.md doesn't explicitly call them out |

---

## Open Questions

1. **PositioningEvidence percentile column**
   - What we know: no institution-specific fee data is available from the data layer; `PositioningEntry` has no `percentile` field
   - What's unclear: should the column show "—" (em dash), be hidden entirely, or use a computed approximation based on median vs P75?
   - Recommendation: hide the Percentile column with a `display: none` wrapper until institution-specific fee data is in scope (Phase 51+)

2. **WhatChangedCard dual-render in page**
   - What we know: WhatChangedCard appears twice in page.tsx — once with `signals={[]}` in ISR row, once with real data in BriefingSignals
   - What's unclear: the original intent — was row 1 WhatChangedCard meant to be replaced by BriefingSignals, or intended as a layout placeholder?
   - Recommendation: remove the ISR-row WhatChangedCard; let BriefingSignals own all signal components

3. **WhyItMatters bullets in PriorityAlertsCard**
   - What we know: 3 hardcoded bullets always render regardless of alert data
   - What's unclear: should they be populated from `thesis.tensions` (all 3 removed if thesis null), or retained as evergreen framing?
   - Recommendation: populate first 2-3 bullets from `thesis.tensions[].implication` when thesis is available; hide section when thesis is null

4. **Page header "Updated 24m ago" / "Trend: Worsening"**
   - What we know: both are hardcoded strings in page.tsx header
   - What's unclear: whether HOME-05 explicitly covers these (CONTEXT.md lists 6 component files, not page.tsx header)
   - Recommendation: fix both as part of this phase — they are hardcoded data values visible to the user

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `src/app/pro/(hamilton)/hamilton/page.tsx`, `src/lib/hamilton/home-data.ts`, `src/lib/hamilton/generate.ts`, `src/lib/hamilton/types.ts`
- Direct component reads: all 6 Hamilton home components
- Planning artifacts: `50-CONTEXT.md`, `REQUIREMENTS.md`, `MILESTONE_8_HANDOFF.md`

### No external research required
This phase is a code-reading and refactoring exercise. All findings come from direct codebase inspection. No library API changes or ecosystem research is needed.

---

## Metadata

**Confidence breakdown:**
- Hardcoded content locations: HIGH — verified by line-by-line file reads
- Page wiring gaps: HIGH — verified by direct page.tsx inspection
- Thesis failure handling: HIGH — verified by home-data.ts catch block inspection
- Empty state text: HIGH — verbatim from CONTEXT.md D-09

**Research date:** 2026-04-09
**Valid until:** Until any of the 7 source files are modified
