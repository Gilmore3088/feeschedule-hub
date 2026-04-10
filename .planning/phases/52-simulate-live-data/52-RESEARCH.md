# Phase 52: Simulate Live Data - Research

**Researched:** 2026-04-09
**Domain:** Hamilton Simulate screen — category selector, distribution data, confidence gating, streaming API
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Category selector must list ALL 49 fee categories organized by the 9 fee families (Account Maintenance, Overdraft & NSF, ATM, Wire Transfer, etc.) with family group headers
- **D-02:** Strip the "Overdraft Fees" default label fallback — show "Select a category" or similar when none selected
- **D-03:** Distribution data already fetches from real getNationalIndex() via getDistributionForCategory() — verify this works for all 49 categories
- **D-04:** Confidence gating via canSimulate/InsufficientConfidenceGate already exists — verify it correctly blocks categories with insufficient data
- **D-05:** Hamilton's streaming interpretation must surface contextual intelligence: CFPB complaints, peer behavior at similar fee levels, revenue subcategory impact, regulatory signals
- **D-06:** NO concrete dollar predictions — no "you'll lose $X million" or "revenue impact: -$500K"
- **D-07:** The simulate API route system prompt should be checked/updated to enforce contextual intelligence over dollar predictions
- **D-08:** Strip any overdraft-specific hardcoded text from Simulate components

### Claude's Discretion

- Exact wording for the "no category selected" empty state
- Whether to show a loading skeleton during category data fetch
- How to handle categories where getNationalIndex returns but with null median

### Deferred Ideas (OUT OF SCOPE)

None.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIM-01 | Category selector works for all 49 fee categories (not just overdraft) | ScenarioCategorySelector currently groups by confidence tier, not by family. FEE_FAMILIES in fee-taxonomy.ts has all 9 families and 49 categories ready to use. Selector needs family grouping restructure. |
| SIM-02 | Fee distribution data fetched from real getNationalIndex() for selected category | getDistributionForCategory() and getSimulationCategories() both call real getNationalIndex(false). Data layer is correctly wired. No changes needed here. |
| SIM-03 | canSimulate() blocks categories with insufficient data (confidence gating) | canSimulate() and InsufficientConfidenceGate are fully implemented and wired in SimulateWorkspace. Logic is correct. Needs verification against live data only. |
| SIM-04 | Hamilton interpretation streams real API with scenario context — surfaces complaints, peer behavior, revenue subcategories (no concrete dollar predictions) | System prompt currently does NOT enforce no-dollar-predictions. It says "be specific about dollar amounts." System prompt needs rewriting to enforce contextual intelligence (D-05/D-06). |
</phase_requirements>

---

## Summary

Phase 52 is a targeted wiring and audit task across four specific gaps. The Simulate screen is architecturally complete — data layer, confidence gating, streaming, and scenario persistence all work. Three of the four requirements involve small, specific changes; one (SIM-04 system prompt) requires substantive rewriting.

**SIM-01 (category selector):** The `ScenarioCategorySelector` component currently groups categories by confidence tier (strong/provisional/insufficient). Decision D-01 requires grouping by fee family instead (9 families with optgroup headers). `FEE_FAMILIES` and `DISPLAY_NAMES` from `fee-taxonomy.ts` are ready to use — this is a UI restructure of the selector only. `getSimulationCategories()` already returns all categories that have valid distribution data from the national index; the selector just needs to reorganize how it groups them.

**SIM-02 (distribution data):** Already wired correctly. `getDistributionForCategory()` calls `getNationalIndex(false)` and returns real data for any category present in the index. `getSimulationCategories()` filters to categories with non-null median/p25/p75. No code changes needed for data layer.

**SIM-03 (confidence gating):** Fully implemented. `computeConfidenceTier()`, `canSimulate()`, and `InsufficientConfidenceGate` are all wired correctly in `SimulateWorkspace`. Thresholds: strong=20+, provisional=10-19, insufficient=<10 approved fees.

**SIM-04 (system prompt):** The current system prompt in `route.ts` says "Be specific about dollar amounts" — this directly violates D-06. The prompt needs to be rewritten to enforce contextual framing: CFPB complaint positioning, peer migration patterns at similar fee levels, revenue subcategory direction (not exact dollar figures), and regulatory signals. The user prompt structure is sound (it already sends feeCategory, distribution percentiles, institution context) — only the system instructions need revision.

**Primary recommendation:** Four changes total — (1) restructure ScenarioCategorySelector to use FEE_FAMILIES grouping, (2) strip the "Overdraft Fees" fallback label in SimulateWorkspace (line 267), (3) rewrite the system prompt in route.ts to enforce contextual intelligence, (4) wire `?category=` URL param from page.tsx into SimulateWorkspace as `initialCategory` prop.

---

## Findings by Requirement

### SIM-01: Category Selector — All 49 by Family

**Current state:** `ScenarioCategorySelector` groups into three optgroups: "Strong Data (20+ approved)", "Provisional (10–19 approved)", "Insufficient (<10 approved)". It accepts a `categories: SimulationCategory[]` array from `getSimulationCategories()`.

**What's needed:** Replace the three confidence-tier optgroups with nine family optgroups. The component must import `FEE_FAMILIES` and `DISPLAY_NAMES` from `fee-taxonomy.ts` and reorganize the grouped render loop.

**Concrete approach:**

```typescript
// In ScenarioCategorySelector.tsx
import { FEE_FAMILIES, DISPLAY_NAMES } from "@/lib/fee-taxonomy";

// Group incoming categories by family using FEE_FAMILIES lookup
const grouped = Object.entries(FEE_FAMILIES).map(([family, members]) => ({
  family,
  items: members
    .map((cat) => categories.find((c) => c.fee_category === cat))
    .filter(Boolean) as SimulationCategory[],
})).filter((g) => g.items.length > 0);

// Render with family optgroups
{grouped.map(({ family, items }) => (
  <optgroup key={family} label={family}>
    {items.map((cat) => (
      <option key={cat.fee_category} value={cat.fee_category}>
        {DISPLAY_NAMES[cat.fee_category] ?? cat.display_name}
      </option>
    ))}
  </optgroup>
))}
```

**Note:** Categories not in any family (none in current taxonomy) should have a fallback "Other" group. The confidence tier badge can be moved to the option label text or dropped per D-01's intent to use family grouping. Confidence information is already surfaced once a category is selected (via InsufficientConfidenceGate).

**D-02 fix:** `SimulateWorkspace` line 267 contains:
```typescript
const categoryLabel = selectedCategory ? formatCategory(selectedCategory) : "Overdraft Fees";
```
Change the fallback to an empty string or "Fee Simulation" — the page header should not default to "Overdraft Fees" when no category is selected.

**Source:** [VERIFIED: codebase grep — ScenarioCategorySelector.tsx:65-77, SimulateWorkspace.tsx:267, fee-taxonomy.ts:1-73]

---

### SIM-02: Distribution Data from getNationalIndex()

**Current state:** Fully wired. `getSimulationCategories()` calls `getNationalIndex(false)` (false = include non-approved), filters entries with non-null median/p25/p75, and returns all qualifying categories. `getDistributionForCategory()` also calls `getNationalIndex(false)` and finds the entry by `fee_category`.

**Verification needed at runtime:** Whether the live Postgres database has fee data across multiple families or only overdraft/NSF heavy coverage. The code handles any category correctly — this is a data coverage question, not a code question.

**Edge case (Claude's Discretion — D-03):** If `getNationalIndex` returns an entry for a category but with null median (e.g., only one fee record), `getDistributionForCategory()` returns `{ error: "Insufficient distribution data for this category" }`. This surfaces as an error state in `SimulateWorkspace`. The plan should verify this error path renders gracefully in the UI.

**Source:** [VERIFIED: actions.ts:16-52, actions.ts:163-192]

---

### SIM-03: Confidence Gating

**Current state:** Fully implemented and wired. No changes needed.

- `computeConfidenceTier(approvedFeeCount)` in `confidence.ts` returns "strong" / "provisional" / "insufficient"
- `canSimulate(tier)` returns `{ allowed: true }` or `{ allowed: false, reason: string }`
- `InsufficientConfidenceGate` renders a blocking UI when `simulationBlocked === true`
- `SimulateWorkspace` computes `simulationBlocked` from `confidenceTier` and hides the slider + analysis sections
- `saveScenario()` server action enforces the gate server-side before writing to DB

**Thresholds verified:**
- strong: 20+ approved fees
- provisional: 10–19 approved fees
- insufficient: <10 approved fees (blocks simulation)

**Source:** [VERIFIED: confidence.ts:1-53, SimulateWorkspace.tsx:89-94, actions.ts:75-76]

---

### SIM-04: System Prompt Audit — Contextual Intelligence vs Dollar Predictions

**Current system prompt (route.ts:94-98):**
```
You are Hamilton, a senior banking fee strategist. You provide precise, authoritative analysis of fee change scenarios.

Your response MUST be plain prose — NO markdown headers, NO bullet points, NO lists.
Write 3–4 sentences maximum. Be specific about dollar amounts, percentile positions, and peer context.
Tone: McKinsey-grade strategic advisor. Confident, not hedging. Data-grounded, not generic.
```

**Problem:** "Be specific about dollar amounts" directly contradicts D-06 (no concrete dollar predictions). The prompt is generic and does not direct Hamilton to surface CFPB complaints, peer migration risk, revenue subcategory patterns, or regulatory signals (D-05).

**Current user prompt sends (route.ts:104-115):**
- Institution name/type/assetTier
- Fee category (human-readable)
- Current fee, proposed fee, direction, change amount
- Distribution percentiles (P25/median/P75) and approved_count

The user prompt structure is sound — it gives Hamilton enough context to reason about peer positioning. The system prompt is what needs rewriting.

**Proposed system prompt revision (planner should use this as the spec):**

The revised system prompt must:
1. Forbid concrete revenue projections (no "$X million", no "revenue impact: -$Y")
2. Instruct Hamilton to frame the change in terms of: percentile position relative to peers, CFPB complaint rate context for above-P75 positioning, peer migration behavior at similar fee levels, revenue direction (qualitative: "revenue-positive" / "revenue-neutral"), regulatory signal awareness
3. Keep the 3-4 sentence, plain prose, McKinsey-advisor tone
4. Make clear the output is strategic framing, not financial modeling

**Note on HamiltonInterpretation footer:** The confidence grounding footer text (line 96) already mentions "CFPB complaint trends" — this is correct and should be kept. It signals to the user what Hamilton draws on.

**Source:** [VERIFIED: route.ts:94-115, HamiltonInterpretation.tsx:93-97]

---

### URL Param `?category=` — Missing Wire

**Finding:** `RecommendedActionCard` links to `/pro/simulate?category={recommendedCategory}` (confirmed in `src/components/hamilton/home/RecommendedActionCard.tsx:66`). However, `SimulatePage` (page.tsx) does not accept `searchParams`, and `SimulateWorkspace` has no `initialCategory` prop.

**Impact:** The Home -> Simulate CTA navigation sets a `?category=` param that is currently silently ignored. The user lands on Simulate with no category pre-selected.

**Fix required:** This is an integration concern (Phase 54 covers INT-01), but the planner should include it in Phase 52 since D-07 in CONTEXT.md notes "Category from URL param `?category=` enables Home -> Simulate CTA flow" as an integration point. The wiring is:
1. `SimulatePage` reads `searchParams.category` (Next.js App Router — must be `Promise<{category?: string}>` and awaited)
2. Passes `initialCategory` prop to `SimulateWorkspace`
3. `SimulateWorkspace` calls `handleCategorySelect(initialCategory)` in the initialization `useEffect`

**Source:** [VERIFIED: page.tsx:14-35, SimulateWorkspace.tsx:99-109, RecommendedActionCard.tsx grep result]

---

## Architecture Patterns

### Component Topology (no structural changes needed)

```
SimulatePage (server)
  └── SimulateWorkspace (client, "use client")
        ├── ScenarioCategorySelector    ← CHANGE: family grouping
        ├── FeeSlider                   ← no change
        ├── CurrentVsProposed           ← no change
        ├── StrategicTradeoffs          ← no change (tradeoffs computed client-side)
        ├── RecommendedPositionCard     ← no change
        ├── HamiltonInterpretation      ← no change
        ├── InsufficientConfidenceGate  ← no change
        └── ScenarioArchive             ← no change
```

### Data Flow (verified correct)

```
SimulatePage (server)
  → getSimulationCategories() [server action]
      → getNationalIndex(false) [DB query]
      → computeConfidenceTier() [pure math]
  
User selects category
  → getDistributionForCategory(feeCategory) [server action]
      → getNationalIndex(false) [DB query]
      → computeConfidenceTier() [pure math]
  
User commits slider value
  → POST /api/hamilton/simulate [streaming API]
      → streamText(anthropic, systemPrompt, userPrompt)
      → logUsage() [background]
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fee family grouping | Custom hardcoded family lists | `FEE_FAMILIES` from `fee-taxonomy.ts` | Single source of truth already exists |
| Display names | Manual string transforms | `DISPLAY_NAMES` from `fee-taxonomy.ts` | Already maps all 49 categories |
| Confidence tier compute | Threshold logic | `computeConfidenceTier()` from `confidence.ts` | Already implemented, thresholds codified |
| Simulation gate | Manual approved_count check | `canSimulate()` from `confidence.ts` | Already returns typed result with reason |

---

## Common Pitfalls

### Pitfall 1: ScenarioCategorySelector receives only "live" categories
**What goes wrong:** `getSimulationCategories()` filters to categories where median/p25/p75 are non-null. If the live DB has sparse data, many of the 49 categories won't appear in the selector at all — which is correct behavior. The plan should NOT try to list all 49 regardless; only those with distribution data should appear.

**How to avoid:** Keep the existing filter in `getSimulationCategories()`. The family grouping in the UI should show only families that have at least one qualifying category. Empty families get no optgroup.

### Pitfall 2: System prompt dollar amounts vs percentile specificity
**What goes wrong:** Removing "Be specific about dollar amounts" must not remove percentile specificity. The revised prompt should still ask Hamilton to reference the P25/median/P75 values from the user prompt — it just must not extrapolate those into revenue forecasts.

**How to avoid:** Distinguish between citing distribution data (allowed, encouraged) and projecting revenue outcomes (forbidden). The prompt rewrite should make this distinction explicit.

### Pitfall 3: initialCategory race condition on mount
**What goes wrong:** `SimulateWorkspace` initialization `useEffect` calls `getSimulationCategories()` and `listScenarios()`. If `initialCategory` also triggers `handleCategorySelect` in the same effect, you get two concurrent server action calls on mount.

**How to avoid:** Wire the initial category select into the existing initialization effect after categories are loaded, or run it as a second effect that depends on `[categories.length]`. Do not fire `handleCategorySelect` before `categories` state is populated.

### Pitfall 4: Next.js 16 searchParams are Promise-based
**What goes wrong:** In Next.js 16 App Router, `searchParams` is a `Promise<Record<string, string>>` — not a plain object. Reading `searchParams.category` directly will return undefined.

**How to avoid:** The page must declare `searchParams` as `Promise<{ category?: string }>` and `await` it before reading. [VERIFIED: CLAUDE.md states `params and searchParams are Promise-based (must await)`]

---

## Code Findings

### SimulateWorkspace.tsx — Hardcoded "Overdraft Fees" label
Line 267:
```typescript
const categoryLabel = selectedCategory ? formatCategory(selectedCategory) : "Overdraft Fees";
```
This is the only hardcoded overdraft-specific string found in Simulate components. `StrategicTradeoffs` and `RecommendedPositionCard` have no overdraft-specific content — they render from computed data only.

### route.ts — System prompt (current, needs update)
```typescript
const systemPrompt = `You are Hamilton, a senior banking fee strategist...
Be specific about dollar amounts, percentile positions, and peer context.`;
```
The phrase "Be specific about dollar amounts" must be removed and replaced with contextual intelligence directives.

### ScenarioCategorySelector.tsx — Grouping structure to change
Current: three `TIER_ORDER` optgroups with tier labels
Target: nine family optgroups using `FEE_FAMILIES` keys as labels

### page.tsx — Missing searchParams
Current signature: `async function SimulatePage()` — no params
Needs: `async function SimulatePage({ searchParams }: { searchParams: Promise<{ category?: string }> })`

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
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIM-01 | ScenarioCategorySelector renders family optgroups | unit | `npx vitest run src/lib/fee-taxonomy.test.ts` | Taxonomy tests exist; selector rendering is manual-only (DOM test) |
| SIM-02 | getDistributionForCategory returns valid DistributionData | manual-only | verify in browser with live data | No automated DB integration test |
| SIM-03 | canSimulate blocks insufficient tier | unit | `npx vitest run` (confidence.ts logic covered by simulation.ts tests if present) | Check for confidence.test.ts |
| SIM-04 | System prompt does not produce dollar predictions | manual-only | Browser test — verify Hamilton response text | No automated LLM output test |

### Wave 0 Gaps
- [ ] `src/lib/hamilton/confidence.test.ts` — unit tests for `computeConfidenceTier` and `canSimulate` thresholds. Simple pure function tests, quick to write.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `getCurrentUser()` + `canAccessPremium()` enforced in route.ts |
| V4 Access Control | yes | Premium/admin gate on streaming route and saveScenario action |
| V5 Input Validation | yes | `feeCategory`, `currentFee`, `proposedFee` validated in route.ts before LLM call |
| V6 Cryptography | no | No cryptographic operations in this phase |

**Note:** The system prompt rewrite should not introduce new user-controlled inputs. The category name is sanitized via `displayCategory` before injection into the prompt (verified in route.ts:92).

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond the existing Postgres + Anthropic API, both confirmed operational by prior phases).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | StrategicTradeoffs and RecommendedPositionCard have no other overdraft-specific hardcoded strings beyond what was read | Code Findings | A string was missed; planner should do a targeted grep for "overdraft" (case-insensitive) in all Simulate components before marking D-08 complete |
| A2 | Live Postgres DB has fee data for multiple families beyond Overdraft & NSF | SIM-02 | If data is sparse, the category selector will show very few families — acceptable behavior, but the phase verification step should note what families are actually present |

---

## Open Questions

1. **Should confidence tier still be visible in the selector?**
   - What we know: D-01 requires family grouping. Current selector shows confidence tier as the grouping axis.
   - What's unclear: Whether confidence info should still appear as a suffix in the option label (e.g., "Overdraft (OD) — Provisional") or be surfaced only after selection via the InsufficientConfidenceGate.
   - Recommendation: Show confidence tier only after selection (gate is more informative). Keep the option label clean. This is Claude's Discretion.

2. **`?category=` — Phase 52 or Phase 54?**
   - What we know: CONTEXT.md mentions it as an integration point. Phase 54 covers INT-01 (Home CTA links navigate correctly). The wiring is 3–4 lines in page.tsx + SimulateWorkspace.
   - What's unclear: Whether the planner should include it in Phase 52 (natural fit since SimulateWorkspace is being modified anyway) or defer to Phase 54.
   - Recommendation: Include in Phase 52. The modification is minimal and avoids shipping a broken Home -> Simulate CTA in Phase 50.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase read] `ScenarioCategorySelector.tsx` — current tier-based grouping confirmed
- [VERIFIED: codebase read] `SimulateWorkspace.tsx:267` — "Overdraft Fees" fallback label confirmed
- [VERIFIED: codebase read] `route.ts:94-98` — system prompt "Be specific about dollar amounts" confirmed
- [VERIFIED: codebase read] `actions.ts:16-192` — getNationalIndex() wiring confirmed for both getSimulationCategories and getDistributionForCategory
- [VERIFIED: codebase read] `confidence.ts:1-53` — canSimulate() and computeConfidenceTier() confirmed complete
- [VERIFIED: codebase read] `fee-taxonomy.ts:1-73` — FEE_FAMILIES (9 families, 49 categories) and DISPLAY_NAMES confirmed available
- [VERIFIED: codebase read] `page.tsx:14-35` — searchParams not wired confirmed
- [VERIFIED: codebase grep] `RecommendedActionCard.tsx:66` — ?category= URL param confirmed in Home CTA

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing code thoroughly read, no external deps
- Architecture: HIGH — all components read directly from source
- Pitfalls: HIGH — all pitfalls derived from direct code inspection, not assumed
- System prompt rewrite: MEDIUM — direction is clear (D-05/D-06), exact wording is Claude's Discretion

**Research date:** 2026-04-09
**Valid until:** 60 days (stable internal code, no external library volatility)
