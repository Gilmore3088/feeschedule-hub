---
phase: 44
name: Simulate
wave: 1
depends_on: []
files_modified:
  - src/lib/hamilton/simulation.ts
  - src/app/pro/(hamilton)/simulate/page.tsx
  - src/app/pro/(hamilton)/simulate/actions.ts
  - src/app/api/hamilton/simulate/route.ts
  - src/components/hamilton/simulate/SimulateWorkspace.tsx
  - src/components/hamilton/simulate/ScenarioCategorySelector.tsx
  - src/components/hamilton/simulate/FeeSlider.tsx
  - src/components/hamilton/simulate/CurrentVsProposed.tsx
  - src/components/hamilton/simulate/StrategicTradeoffs.tsx
  - src/components/hamilton/simulate/RecommendedPositionCard.tsx
  - src/components/hamilton/simulate/HamiltonInterpretation.tsx
  - src/components/hamilton/simulate/ScenarioArchive.tsx
  - src/components/hamilton/simulate/GenerateBoardSummaryButton.tsx
  - src/components/hamilton/simulate/InsufficientConfidenceGate.tsx
  - src/components/hamilton/simulate/index.ts
autonomous: true
requirements: []
---

# Phase 44: Simulate — Implementation Plan

## Objective

Replace the stub at `/pro/simulate` with a fully functional fee scenario modeling screen (the "Strategy Terminal"). A Pro subscriber can select a fee category, drag a slider to model a proposed fee change, see live current-vs-proposed comparison, receive Hamilton's streaming interpretation, view strategic tradeoffs, save the scenario, and generate a board-ready summary with one click.

**Phase goal**: A Pro subscriber can model a proposed fee change, see the strategic tradeoffs with a confidence-tiered recommendation, save the scenario, and generate a board-ready summary with one click.

## Architecture Summary

- **Client state**: React `useState` + `useReducer` in `SimulateWorkspace` (single component tree — no zustand needed; state is local to this page)
- **Distribution data**: Fetched once on category select via server action → `getNationalIndex()` for p25/p75/min/max/median/approved_count
- **Live math**: Client-side in `src/lib/hamilton/simulation.ts` — percentile rank, median gap, risk classification, tradeoff deltas (~25 lines)
- **Interpretation**: POST to `/api/hamilton/simulate` after `onValueCommit` → streaming `SimulationResponse.interpretation` + structured fields
- **Persistence**: Server actions in `actions.ts` write to `hamilton_scenarios` table (already exists via `ensureHamiltonProTables`)
- **Board summary CTA**: Saves scenario then navigates to `/pro/report?scenario_id={uuid}`

---

## Wave 1: Simulation Math Library + API Route

### Task 1.1 — Create `src/lib/hamilton/simulation.ts`

<read_first>
- src/lib/hamilton/confidence.ts
- src/lib/hamilton/types.ts
- src/lib/crawler-db/fee-index.ts
</read_first>

<action>
Create `src/lib/hamilton/simulation.ts` with the following exported functions:

```typescript
/**
 * Hamilton Simulation Math — client-safe, pure functions.
 * All inputs come from IndexEntry distribution data fetched from the server.
 */

export interface DistributionData {
  fee_category: string;
  median_amount: number;
  p25_amount: number;
  p75_amount: number;
  min_amount: number;
  max_amount: number;
  approved_count: number;
}

export interface FeePosition {
  percentile: number;      // 0-100, estimated from p25/median/p75 breakpoints
  medianGap: number;       // proposed - median (negative = below median)
  riskProfile: "low" | "medium" | "high";
}

/**
 * Estimate percentile rank using linear interpolation across p25/median/p75 breakpoints.
 * Below p25 → 0–25 range. Between p25/median → 25–50. Between median/p75 → 50–75. Above p75 → 75–100.
 */
export function estimatePercentile(fee: number, dist: DistributionData): number {
  const { min_amount, p25_amount, median_amount, p75_amount, max_amount } = dist;
  if (fee <= min_amount) return 0;
  if (fee >= max_amount) return 100;
  if (fee <= p25_amount) {
    return lerp(0, 25, fee, min_amount, p25_amount);
  }
  if (fee <= median_amount) {
    return lerp(25, 50, fee, p25_amount, median_amount);
  }
  if (fee <= p75_amount) {
    return lerp(50, 75, fee, median_amount, p75_amount);
  }
  return lerp(75, 100, fee, p75_amount, max_amount);
}

function lerp(pctLow: number, pctHigh: number, fee: number, low: number, high: number): number {
  if (high === low) return pctLow;
  return pctLow + ((fee - low) / (high - low)) * (pctHigh - pctLow);
}

/**
 * Classify risk based on percentile position.
 * low: below P50 (below peer median — cost advantage)
 * medium: P50-P75 (near or at median)
 * high: above P75 (above 75th percentile — outlier risk, complaint exposure)
 */
export function classifyRisk(percentile: number): "low" | "medium" | "high" {
  if (percentile < 50) return "low";
  if (percentile < 75) return "medium";
  return "high";
}

/**
 * Compute fee position (percentile, medianGap, riskProfile) for a given fee amount.
 */
export function computeFeePosition(fee: number, dist: DistributionData): FeePosition {
  const percentile = Math.round(estimatePercentile(fee, dist));
  const medianGap = parseFloat((fee - dist.median_amount).toFixed(2));
  const riskProfile = classifyRisk(percentile);
  return { percentile, medianGap, riskProfile };
}

/**
 * Compute strategic tradeoffs between current and proposed positions.
 * Returns the three tradeoff dimensions shown in StrategicTradeoffs component.
 */
export interface TradeoffDeltas {
  revenueImpact: { label: string; value: string; note: string };
  riskMitigation: { label: string; value: string; note: string };
  operationalImpact: { label: string; value: string; note: string };
}

export function computeTradeoffs(
  currentFee: number,
  proposedFee: number,
  current: FeePosition,
  proposed: FeePosition
): TradeoffDeltas {
  const feeChangePct = currentFee > 0
    ? (((proposedFee - currentFee) / currentFee) * 100).toFixed(1)
    : "N/A";
  const direction = proposedFee > currentFee ? "+" : "";
  const percentileDelta = proposed.percentile - current.percentile;
  const riskShift = proposed.riskProfile !== current.riskProfile
    ? `${current.riskProfile} → ${proposed.riskProfile}`
    : "no change";

  return {
    revenueImpact: {
      label: "Revenue Impact",
      value: `${direction}${feeChangePct}% per transaction`,
      note: proposedFee > currentFee
        ? "Higher fee increases per-incident revenue"
        : proposedFee < currentFee
        ? "Lower fee reduces per-incident revenue"
        : "No revenue change",
    },
    riskMitigation: {
      label: "Peer Risk Exposure",
      value: `${percentileDelta > 0 ? "+" : ""}${percentileDelta} percentile points`,
      note: percentileDelta < 0
        ? "Moving closer to or below median reduces outlier complaint risk"
        : percentileDelta > 0
        ? "Moving above median increases regulatory and reputational exposure"
        : "No change in peer positioning",
    },
    operationalImpact: {
      label: "Risk Profile Shift",
      value: riskShift,
      note: proposed.riskProfile === "low"
        ? "Below-median positioning — strongest competitive stance"
        : proposed.riskProfile === "medium"
        ? "Near-median positioning — balanced revenue and risk"
        : "Above 75th percentile — elevated complaint and attrition risk",
    },
  };
}
```
</action>

<acceptance_criteria>
- `src/lib/hamilton/simulation.ts` exists
- File exports `estimatePercentile`, `classifyRisk`, `computeFeePosition`, `computeTradeoffs`
- File exports interfaces `DistributionData`, `FeePosition`, `TradeoffDeltas`
- `computeFeePosition(20, { median_amount: 35, p25_amount: 25, p75_amount: 45, min_amount: 5, max_amount: 75, ...})` returns `{ percentile: 30, medianGap: -15, riskProfile: "low" }`
- `classifyRisk(80)` returns `"high"`; `classifyRisk(60)` returns `"medium"`; `classifyRisk(40)` returns `"low"`
- No imports from react, next, or server-side modules (file must be client-safe)
</acceptance_criteria>

---

### Task 1.2 — Create `/api/hamilton/simulate` route

<read_first>
- src/app/api/hamilton/chat/route.ts
- src/lib/hamilton/types.ts
- src/lib/hamilton/confidence.ts
- src/lib/hamilton/simulation.ts
- src/lib/auth.ts
- src/lib/access.ts
</read_first>

<action>
Create `src/app/api/hamilton/simulate/route.ts`:

```typescript
/**
 * POST /api/hamilton/simulate
 *
 * Generates Hamilton's interpretation of a fee change scenario.
 * Called ONLY on slider commit (onValueCommit), NOT on every drag.
 *
 * Request body:
 *   feeCategory: string
 *   currentFee: number
 *   proposedFee: number
 *   distributionData: DistributionData (p25/median/p75/min/max/approved_count)
 *   institutionContext: { name?: string; type?: string; assetTier?: string; fedDistrict?: number | null }
 *
 * Response: StreamingTextResponse — plain text prose interpretation
 * Only the interpretation field streams. Structured fields (tradeoffs, recommendedPosition)
 * are computed client-side in simulation.ts.
 *
 * Auth: premium/admin required
 * Cost: same daily circuit breaker as /api/hamilton/chat ($50)
 */

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getDailyCostCents, logUsage } from "@/lib/research/history";
import type { DistributionData } from "@/lib/hamilton/simulation";

export const maxDuration = 30;

const HAMILTON_MODEL = "claude-sonnet-4-5-20250929";
const DAILY_COST_LIMIT_CENTS = 5000;

const COST_PER_M_INPUT: Record<string, number> = {
  "claude-haiku-4-5-20251001": 80,
  "claude-sonnet-4-5-20250929": 300,
};
const COST_PER_M_OUTPUT: Record<string, number> = {
  "claude-haiku-4-5-20251001": 400,
  "claude-sonnet-4-5-20250929": 1500,
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dailyCost = await getDailyCostCents().catch(() => 0);
  if (dailyCost >= DAILY_COST_LIMIT_CENTS) {
    return new Response("Daily cost limit reached", { status: 429 });
  }

  let body: {
    feeCategory: string;
    currentFee: number;
    proposedFee: number;
    distributionData: DistributionData;
    institutionContext: { name?: string; type?: string; assetTier?: string; fedDistrict?: number | null };
  };

  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { feeCategory, currentFee, proposedFee, distributionData, institutionContext } = body;

  if (!feeCategory || typeof currentFee !== "number" || typeof proposedFee !== "number") {
    return new Response("Missing required fields", { status: 400 });
  }

  const { median_amount, p25_amount, p75_amount, approved_count } = distributionData;
  const direction = proposedFee > currentFee ? "increasing" : proposedFee < currentFee ? "decreasing" : "maintaining";
  const change = Math.abs(proposedFee - currentFee).toFixed(2);

  const systemPrompt = `You are Hamilton, a senior banking fee strategist. You provide precise, authoritative analysis of fee change scenarios.

Your response MUST be plain prose — NO markdown headers, NO bullet points, NO lists.
Write 3–4 sentences maximum. Be specific about dollar amounts, percentile positions, and peer context.
Tone: McKinsey-grade strategic advisor. Confident, not hedging. Data-grounded, not generic.`;

  const userPrompt = `${institutionContext.name ? `Institution: ${institutionContext.name} (${institutionContext.type ?? "bank"}, ${institutionContext.assetTier ?? "unknown tier"})` : ""}

Fee category: ${feeCategory}
Current fee: $${currentFee.toFixed(2)}
Proposed fee: $${proposedFee.toFixed(2)} (${direction} by $${change})

Market distribution (${approved_count} approved observations):
- P25: $${p25_amount?.toFixed(2) ?? "N/A"}
- Median: $${median_amount?.toFixed(2) ?? "N/A"}
- P75: $${p75_amount?.toFixed(2) ?? "N/A"}

Provide a concise strategic interpretation of this fee change. What does this positioning mean competitively? What is the key risk or opportunity?`;

  const result = await streamText({
    model: anthropic(HAMILTON_MODEL),
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 300,
    onFinish: ({ usage }) => {
      const inputRate = COST_PER_M_INPUT[HAMILTON_MODEL] ?? 300;
      const outputRate = COST_PER_M_OUTPUT[HAMILTON_MODEL] ?? 1500;
      const costCents = Math.round(
        (usage.promptTokens * inputRate + usage.completionTokens * outputRate) / 1_000_000
      );
      logUsage({
        agentId: "hamilton-simulate",
        userId: String(user.id),
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        costCents,
      }).catch(() => {});
    },
  });

  return result.toDataStreamResponse();
}
```
</action>

<acceptance_criteria>
- `src/app/api/hamilton/simulate/route.ts` exists
- File exports `POST` and `maxDuration = 30`
- POST returns 401 if user not authenticated or not premium
- POST returns 429 if daily cost limit exceeded
- POST returns 400 if `feeCategory`, `currentFee`, or `proposedFee` missing
- `streamText` called with `anthropic("claude-sonnet-4-5-20250929")` model
- `logUsage` called in `onFinish` callback
</acceptance_criteria>

---

## Wave 2: Server Actions + Scenario Persistence

### Task 2.1 — Create `src/app/pro/(hamilton)/simulate/actions.ts`

<read_first>
- src/app/pro/(hamilton)/analyze/actions.ts
- src/lib/hamilton/pro-tables.ts
- src/lib/auth.ts
- src/lib/access.ts
- src/lib/hamilton/confidence.ts
- src/lib/hamilton/simulation.ts
</read_first>

<action>
Create `src/app/pro/(hamilton)/simulate/actions.ts`:

```typescript
"use server";

import { sql } from "@/lib/crawler-db/connection";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getNationalIndex } from "@/lib/crawler-db/fee-index";
import { computeConfidenceTier, canSimulate } from "@/lib/hamilton/confidence";
import type { DistributionData } from "@/lib/hamilton/simulation";
import type { ConfidenceTier } from "@/lib/hamilton/confidence";

/**
 * Fetch distribution data for a fee category.
 * Returns null if category not found or data insufficient for display.
 * Used to hydrate the slider range and compute confidence tier.
 */
export async function getDistributionForCategory(
  feeCategory: string
): Promise<{ distribution: DistributionData; confidenceTier: ConfidenceTier } | { error: string }> {
  try {
    const index = await getNationalIndex(false);
    const entry = index.find((e) => e.fee_category === feeCategory);

    if (!entry) {
      return { error: `No data found for category: ${feeCategory}` };
    }

    if (
      entry.median_amount === null ||
      entry.p25_amount === null ||
      entry.p75_amount === null ||
      entry.min_amount === null ||
      entry.max_amount === null
    ) {
      return { error: "Insufficient distribution data for this category" };
    }

    const distribution: DistributionData = {
      fee_category: entry.fee_category,
      median_amount: entry.median_amount,
      p25_amount: entry.p25_amount,
      p75_amount: entry.p75_amount,
      min_amount: entry.min_amount,
      max_amount: entry.max_amount,
      approved_count: entry.approved_count,
    };

    const confidenceTier = computeConfidenceTier(entry.approved_count);
    return { distribution, confidenceTier };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { error: message };
  }
}

/**
 * Save a scenario to hamilton_scenarios.
 * Requires premium/admin role.
 * Returns the new scenario UUID on success.
 * confidence_tier is snapshotted at save time (D-04 from Phase 39).
 */
export async function saveScenario(params: {
  institutionId: string;
  feeCategory: string;
  currentValue: number;
  proposedValue: number;
  resultJson: object;
  confidenceTier: ConfidenceTier;
}): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user || !canAccessPremium(user)) {
    return { error: "Active subscription required" };
  }

  // Insufficient tier must not be saved (canSimulate enforces this)
  const check = canSimulate(params.confidenceTier);
  if (!check.allowed) {
    return { error: check.reason };
  }

  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO hamilton_scenarios (
        user_id,
        institution_id,
        fee_category,
        current_value,
        proposed_value,
        result_json,
        confidence_tier,
        status
      ) VALUES (
        ${user.id},
        ${params.institutionId ?? ""},
        ${params.feeCategory},
        ${params.currentValue},
        ${params.proposedValue},
        ${JSON.stringify(params.resultJson)},
        ${params.confidenceTier},
        'active'
      )
      RETURNING id::text
    `;

    const id = rows[0]?.id;
    if (!id) return { error: "Failed to save scenario" };
    return { id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { error: message };
  }
}

/**
 * List saved scenarios for the current user (active only, soft-deleted excluded).
 */
export async function listScenarios(limit = 20): Promise<
  Array<{
    id: string;
    fee_category: string;
    current_value: string;
    proposed_value: string;
    confidence_tier: string;
    created_at: string;
  }>
> {
  const user = await getCurrentUser();
  if (!user) return [];

  try {
    const rows = await sql<
      Array<{
        id: string;
        fee_category: string;
        current_value: string;
        proposed_value: string;
        confidence_tier: string;
        created_at: string;
      }>
    >`
      SELECT
        id::text,
        fee_category,
        current_value::text,
        proposed_value::text,
        confidence_tier,
        created_at::text
      FROM hamilton_scenarios
      WHERE user_id = ${user.id} AND status = 'active'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  } catch {
    return [];
  }
}

/**
 * Load the fee categories available for simulation (those with distribution data).
 * Returns array of { fee_category, display_name, approved_count, confidence_tier }.
 */
export async function getSimulationCategories(): Promise<
  Array<{
    fee_category: string;
    display_name: string;
    approved_count: number;
    confidence_tier: ConfidenceTier;
  }>
> {
  try {
    const index = await getNationalIndex(false);
    return index
      .filter(
        (e) =>
          e.median_amount !== null &&
          e.p25_amount !== null &&
          e.p75_amount !== null
      )
      .map((e) => ({
        fee_category: e.fee_category,
        display_name: e.fee_category
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        approved_count: e.approved_count,
        confidence_tier: computeConfidenceTier(e.approved_count),
      }))
      .sort((a, b) => b.approved_count - a.approved_count);
  } catch {
    return [];
  }
}
```
</action>

<acceptance_criteria>
- `src/app/pro/(hamilton)/simulate/actions.ts` exists with `"use server"` directive on line 1
- File exports `getDistributionForCategory`, `saveScenario`, `listScenarios`, `getSimulationCategories`
- `saveScenario` returns `{ error: "..." }` if `canSimulate` returns `{ allowed: false }`
- `listScenarios` filters `WHERE status = 'active'` (soft-deleted excluded)
- `getDistributionForCategory` returns `{ error: "..." }` if median/p25/p75/min/max are null
- All `sql` template literals use parameterized values (no string interpolation of user input)
</acceptance_criteria>

---

## Wave 3: React Components

### Task 3.1 — Create `SimulateWorkspace` (main client shell)

<read_first>
- src/components/hamilton/analyze/AnalyzeWorkspace.tsx
- src/app/pro/(hamilton)/simulate/actions.ts
- src/lib/hamilton/simulation.ts
- src/lib/hamilton/confidence.ts
- src/lib/hamilton/types.ts
- src/app/globals.css (hamilton-shell CSS tokens)
</read_first>

<action>
Create `src/components/hamilton/simulate/SimulateWorkspace.tsx`:

This is the main client component shell. It manages all state and coordinates child components.

State shape:
```typescript
type SimulateState = {
  selectedCategory: string | null;
  distribution: DistributionData | null;
  confidenceTier: ConfidenceTier | null;
  currentFee: number;
  proposedFee: number;
  interpretation: string;
  isStreaming: boolean;
  savedScenarioId: string | null;
  scenarios: ScenarioListItem[];
  loadingCategory: boolean;
  error: string | null;
};
```

Key behaviors:
1. On mount: call `getSimulationCategories()` to populate category selector
2. On category change: call `getDistributionForCategory(cat)` → set distribution + confidenceTier + set currentFee = median_amount (default starting point) + set proposedFee = median_amount
3. Check `canSimulate(confidenceTier)` — if blocked, show `InsufficientConfidenceGate`
4. Slider `onValueChange`: update `proposedFee` in state → triggers recompute of `computeFeePosition` + `computeTradeoffs` (pure client math — no API)
5. Slider `onValueCommit`: POST to `/api/hamilton/simulate` with `fetch` + stream reading → update `interpretation`; set `isStreaming = true/false`
6. Save button: call `saveScenario(...)` → on success, refresh `listScenarios()`
7. Board summary CTA: save if not saved → navigate to `/pro/report?scenario_id={id}`

Layout (two-column):
```tsx
<div className="flex gap-6 p-6 min-h-screen" style={{ background: "var(--hamilton-surface)" }}>
  {/* LEFT: main workspace col-span-8 equivalent */}
  <div className="flex-1 flex flex-col gap-6">
    <ScenarioCategorySelector ... />
    {confidenceTier && !canSimulate(confidenceTier).allowed
      ? <InsufficientConfidenceGate reason={...} />
      : distribution && (
          <>
            <CurrentVsProposed ... />
            <FeeSlider ... />
            <HamiltonInterpretation interpretation={interpretation} isStreaming={isStreaming} />
            <StrategicTradeoffs tradeoffs={tradeoffs} />
            <RecommendedPositionCard ... />
            <GenerateBoardSummaryButton ... />
          </>
        )
    }
  </div>
  {/* RIGHT: archive rail */}
  <div className="w-72 flex-shrink-0">
    <ScenarioArchive scenarios={scenarios} onSelect={handleScenarioSelect} />
  </div>
</div>
```

Streaming implementation (use Vercel AI SDK `useCompletion` or manual fetch+ReadableStream):
```typescript
// Use useCompletion from @ai-sdk/react for streaming interpretation
import { useCompletion } from "@ai-sdk/react";

const { complete, completion, isLoading } = useCompletion({
  api: "/api/hamilton/simulate",
});

// Call on onValueCommit:
async function handleCommit(value: number[]) {
  const proposed = value[0];
  setProposedFee(proposed);
  setSavedScenarioId(null); // reset saved state
  await complete("", {
    body: {
      feeCategory: selectedCategory,
      currentFee,
      proposedFee: proposed,
      distributionData: distribution,
      institutionContext,
    },
  });
}
```
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/SimulateWorkspace.tsx` exists with `"use client"` directive
- Component accepts props: `userId: number`, `institutionId: string | null`, `institutionContext: { name?: string; type?: string; assetTier?: string; fedDistrict?: number | null }`
- Component calls `getSimulationCategories()` on mount (initial category load)
- `useCompletion` from `@ai-sdk/react` used for streaming interpretation
- `canSimulate(confidenceTier)` check gates the simulation UI — `InsufficientConfidenceGate` shown when blocked
- `computeFeePosition` and `computeTradeoffs` from `@/lib/hamilton/simulation` used for live math
- No `console.log` statements
</acceptance_criteria>

---

### Task 3.2 — Create `ScenarioCategorySelector`

<read_first>
- src/components/hamilton/analyze/AnalysisFocusTabs.tsx
- src/app/globals.css (hamilton-shell CSS tokens)
</read_first>

<action>
Create `src/components/hamilton/simulate/ScenarioCategorySelector.tsx`:

```typescript
"use client";

interface Category {
  fee_category: string;
  display_name: string;
  approved_count: number;
  confidence_tier: "strong" | "provisional" | "insufficient";
}

interface Props {
  categories: Category[];
  selected: string | null;
  loading: boolean;
  onSelect: (feeCategory: string) => void;
}

// Render a <select> element styled with hamilton tokens.
// Each option: "{display_name} ({approved_count} approved)"
// Option groups: "Strong Data (20+ approved)" | "Provisional (10-19)" | "Insufficient (<10)"
// Insufficient options are visually dimmed (text-tertiary) but not disabled — selection shows gate.
// Loading state: disabled select with "Loading categories…" placeholder
```

The component groups options by confidence tier and shows the count to help users understand data quality before selecting.
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/ScenarioCategorySelector.tsx` exists with `"use client"` directive
- Accepts props: `categories`, `selected`, `loading`, `onSelect`
- Renders a `<select>` with options grouped by confidence tier using `<optgroup>`
- Each option text includes approved count: e.g., "Overdraft Fee (34 approved)"
- When `loading` is true, select is `disabled` with placeholder "Loading categories..."
- No tailwind classes that conflict with `--hamilton-*` CSS variable tokens
</acceptance_criteria>

---

### Task 3.3 — Create `FeeSlider`

<read_first>
- src/app/globals.css (hamilton-shell CSS tokens, slider radix import)
- src/lib/hamilton/simulation.ts
</read_first>

<action>
Create `src/components/hamilton/simulate/FeeSlider.tsx`:

```typescript
"use client";
// Import: import * as Slider from "@radix-ui/react-slider";
// (radix-ui umbrella package re-exports @radix-ui/react-slider)

interface Props {
  min: number;
  max: number;
  step: number;          // 0.50
  currentFee: number;    // shown as a dashed marker on track, NOT the thumb position
  proposedFee: number;   // thumb position
  median: number;        // shown as a static marker on track
  p75: number;           // shown as hazard zone start
  onValueChange: (value: number[]) => void;
  onValueCommit: (value: number[]) => void;
}
```

Visual design:
- Track background: gradient — emerald from min to median, amber from median to p75, red from p75 to max
- Current fee: dashed vertical line marker on the track at the `currentFee` position
- Median marker: small circle marker labeled "Median"
- Thumb: styled with `--hamilton-accent` background, shows "$XX.XX" as an above-thumb label
- Below slider: three labels (min, median, max) at appropriate positions

Implementation note: Radix Slider is uncontrolled by default. Use `value={[proposedFee]}` for controlled mode. Both `onValueChange` and `onValueCommit` must be passed through from Radix props.

Step value: `0.50` (50 cents per tick)
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/FeeSlider.tsx` exists with `"use client"` directive
- Imports `Slider` from `"radix-ui"` (the umbrella package — not `@radix-ui/react-slider` directly): `import * as Slider from "radix-ui/react-slider"`
- Props include `min`, `max`, `step`, `currentFee`, `proposedFee`, `median`, `p75`, `onValueChange`, `onValueCommit`
- `Slider.Root` rendered with `value={[proposedFee]}` (controlled)
- Both `onValueChange` and `onValueCommit` wired to `Slider.Root`
- Step is `0.5` (numeric, not string)
</acceptance_criteria>

---

### Task 3.4 — Create `CurrentVsProposed`

<read_first>
- src/lib/hamilton/simulation.ts
- src/app/globals.css (hamilton-shell CSS tokens)
</read_first>

<action>
Create `src/components/hamilton/simulate/CurrentVsProposed.tsx`:

```typescript
"use client";
import type { FeePosition } from "@/lib/hamilton/simulation";

interface Props {
  feeCategory: string;
  currentFee: number;
  proposedFee: number;
  currentPosition: FeePosition;
  proposedPosition: FeePosition;
}
```

Layout: two equal-width cards side by side (flex row, gap-4).

**Current card** (slate tones):
- Label: "CURRENT POSITION" (text-xs uppercase tracking-wider, --hamilton-text-tertiary)
- Fee amount: "$XX.XX" (text-3xl bold tabular-nums)
- Percentile: "P{N}" (text-lg semibold, slate-600)
- Median gap: "{+/-}$X.XX vs median" (text-sm)
- Risk badge: low/medium/high with color (emerald/amber/red)

**Proposed card** (terracotta tones — highlight with `--hamilton-accent-subtle` background):
- Same structure but values from proposedPosition
- Border: `1px solid var(--hamilton-accent)` when proposed !== current

**Delta row** (below both cards, centered):
- Arrow direction + Δ percentile + Δ median gap + risk shift label
- Arrow: lucide `ArrowRight` or `TrendingUp`/`TrendingDown` based on direction
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/CurrentVsProposed.tsx` exists with `"use client"` directive
- Accepts props: `feeCategory`, `currentFee`, `proposedFee`, `currentPosition`, `proposedPosition` (typed as `FeePosition`)
- Current card uses slate color scheme; proposed card uses `--hamilton-accent-subtle` background
- Risk profile rendered as a colored badge (emerald for "low", amber for "medium", red for "high")
- Component renders a delta row showing percentile change between current and proposed
- When `proposedFee === currentFee`, proposed card border is not terracotta-accented
</acceptance_criteria>

---

### Task 3.5 — Create `StrategicTradeoffs`

<read_first>
- src/lib/hamilton/simulation.ts (TradeoffDeltas interface)
- src/app/globals.css
</read_first>

<action>
Create `src/components/hamilton/simulate/StrategicTradeoffs.tsx`:

```typescript
"use client";
import type { TradeoffDeltas } from "@/lib/hamilton/simulation";

interface Props {
  tradeoffs: TradeoffDeltas | null;
}
```

Renders a three-row table (or three cards in a row):
- Row 1: Revenue Impact
- Row 2: Peer Risk Exposure
- Row 3: Risk Profile Shift

Each row: label (text-xs uppercase) | value (text-sm font-semibold tabular-nums) | note (text-xs text-secondary)

Loading/null state: three skeleton rows with shimmer animation (use `.skeleton` class from globals.css).
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/StrategicTradeoffs.tsx` exists with `"use client"` directive
- Accepts `tradeoffs: TradeoffDeltas | null`
- When `tradeoffs` is null, renders three skeleton rows with `className="skeleton"` applied
- When tradeoffs present, renders three rows: Revenue Impact, Peer Risk Exposure, Risk Profile Shift
- Each row shows label, value, and note from the TradeoffDeltas shape
</acceptance_criteria>

---

### Task 3.6 — Create `RecommendedPositionCard`

<read_first>
- src/lib/hamilton/confidence.ts
- src/app/globals.css
</read_first>

<action>
Create `src/components/hamilton/simulate/RecommendedPositionCard.tsx`:

```typescript
"use client";
import type { ConfidenceTier } from "@/lib/hamilton/confidence";
import type { FeePosition } from "@/lib/hamilton/simulation";

interface Props {
  confidenceTier: ConfidenceTier;
  proposedFee: number;
  proposedPosition: FeePosition;
  median: number;
  p25: number;
}
```

The recommended position is derived from data, not from Hamilton's LLM for this card — it's a data-driven recommendation:
- **Strong tier**: "Hamilton recommends holding at $XX.XX — P{N}, ${X.XX} below peer median. This positions [institution] in the bottom quartile, minimizing complaint risk while retaining fee revenue."
- **Provisional tier**: Same text + caveat note: "Based on provisional data. Verify against full peer set before board presentation."
- **Insufficient tier**: This card should NOT be rendered (gate handled in SimulateWorkspace).

Confidence tier badge: pill badge in top-right of card.
- Strong: `--hamilton-accent` background, white text, "STRONG DATA"
- Provisional: amber-100 background, amber-800 text, "PROVISIONAL"

Card heading: "Hamilton's Recommendation" in --hamilton-font-serif.
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/RecommendedPositionCard.tsx` exists with `"use client"` directive
- Accepts props: `confidenceTier`, `proposedFee`, `proposedPosition`, `median`, `p25`
- Strong tier: renders card with `--hamilton-accent` badge labeled "STRONG DATA"
- Provisional tier: renders card with amber badge labeled "PROVISIONAL" and caveat note
- Insufficient tier: renders `null` (caller is responsible for not rendering, but component guards too)
- Card heading rendered with `style={{ fontFamily: "var(--hamilton-font-serif)" }}`
</acceptance_criteria>

---

### Task 3.7 — Create `HamiltonInterpretation`

<read_first>
- src/components/hamilton/analyze/HamiltonViewPanel.tsx
- src/app/globals.css
</read_first>

<action>
Create `src/components/hamilton/simulate/HamiltonInterpretation.tsx`:

```typescript
"use client";

interface Props {
  interpretation: string;   // streaming or complete text from /api/hamilton/simulate
  isStreaming: boolean;
}
```

When `isStreaming` is true AND `interpretation` is empty: show three-line skeleton with `.skeleton` shimmer.
When `isStreaming` is true AND `interpretation` is non-empty: render text with blinking cursor appended.
When not streaming: render final prose text.

Typography: `--hamilton-font-serif`, `text-base leading-relaxed`, `--hamilton-text-primary`.

Empty state (no interpretation yet, not streaming): render placeholder text in `--hamilton-text-tertiary`: "Commit a fee change above to receive Hamilton's strategic interpretation."
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/HamiltonInterpretation.tsx` exists with `"use client"` directive
- When `isStreaming && !interpretation`: three skeleton lines with `className="skeleton"`
- When `isStreaming && interpretation`: text + blinking cursor (`animate-pulse` or `after:content-['▋']`)
- When `!isStreaming && interpretation`: plain text in serif font
- When `!isStreaming && !interpretation`: placeholder text "Commit a fee change above to receive Hamilton's strategic interpretation."
- Text rendered with `style={{ fontFamily: "var(--hamilton-font-serif)" }}`
</acceptance_criteria>

---

### Task 3.8 — Create `ScenarioArchive`

<read_first>
- src/components/hamilton/analyze/AnalyzeWorkspace.tsx (left rail pattern)
- src/app/globals.css
</read_first>

<action>
Create `src/components/hamilton/simulate/ScenarioArchive.tsx`:

```typescript
"use client";

interface ScenarioListItem {
  id: string;
  fee_category: string;
  current_value: string;
  proposed_value: string;
  confidence_tier: string;
  created_at: string;
}

interface Props {
  scenarios: ScenarioListItem[];
  onSelect: (scenario: ScenarioListItem) => void;
}
```

Renders:
- Heading: "Saved Scenarios" (text-xs uppercase tracking-wider, --hamilton-text-tertiary)
- List of scenario items, each showing:
  - Fee category name (formatted)
  - "$X → $Y" with arrow
  - Date (relative: "2 days ago" via `timeAgo` from `@/lib/format`)
  - Confidence tier badge (small pill)
- Empty state: "No saved scenarios yet. Run a simulation to create your first."
- Click on item calls `onSelect(scenario)`
- Active/selected item: subtle `--hamilton-accent-subtle` background

Note: soft-deleted scenarios (status='archived') are filtered at the DB query level in actions.ts — this component never sees them.
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/ScenarioArchive.tsx` exists with `"use client"` directive
- Accepts `scenarios: ScenarioListItem[]` and `onSelect: (s: ScenarioListItem) => void`
- When `scenarios.length === 0`: renders "No saved scenarios yet." message
- `timeAgo` from `@/lib/format` used for date formatting
- Each item shows fee_category (formatted), current → proposed values, date, and confidence badge
- Click handler calls `onSelect(scenario)`
</acceptance_criteria>

---

### Task 3.9 — Create `InsufficientConfidenceGate` and `GenerateBoardSummaryButton`

<read_first>
- src/lib/hamilton/confidence.ts
- src/app/globals.css
</read_first>

<action>
**`InsufficientConfidenceGate.tsx`**:
```typescript
"use client";
interface Props { reason: string; }
```
Renders a full-panel message card (no slider shown):
- Heading: "Simulation Blocked" in `--hamilton-font-serif`
- Body: `reason` text (the `canSimulate().reason` string from confidence.ts)
- Sub-copy: "Select a fee category with at least 10 approved observations to run a simulation."
- Style: amber-50 background, amber-800 text, amber-200 border (warning — not red/destructive)

**`GenerateBoardSummaryButton.tsx`**:
```typescript
"use client";
interface Props {
  disabled: boolean;           // true if isStreaming OR no interpretation yet
  savedScenarioId: string | null;
  onGenerate: () => void;      // parent handles save + navigate
}
```
- Primary CTA button with `--hamilton-gradient-cta` background
- Label: "Generate Board Scenario Summary"
- When disabled: reduced opacity, not clickable
- When `savedScenarioId` is set: show small "Saved" indicator next to button
- Full-width on mobile, auto width on desktop
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/InsufficientConfidenceGate.tsx` exists with `"use client"` directive
- Gate renders amber warning card (NOT red/error) with `reason` prop displayed
- `src/components/hamilton/simulate/GenerateBoardSummaryButton.tsx` exists with `"use client"` directive
- Button uses `style={{ background: "var(--hamilton-gradient-cta)" }}`
- Button renders `disabled` attribute when `disabled` prop is true
- When `savedScenarioId` is set, a "Saved" indicator is visible near the button
</acceptance_criteria>

---

### Task 3.10 — Create `src/components/hamilton/simulate/index.ts`

<read_first>
- src/components/hamilton/analyze/index.ts
</read_first>

<action>
Create `src/components/hamilton/simulate/index.ts` exporting all simulate components:

```typescript
export { SimulateWorkspace } from "./SimulateWorkspace";
export { ScenarioCategorySelector } from "./ScenarioCategorySelector";
export { FeeSlider } from "./FeeSlider";
export { CurrentVsProposed } from "./CurrentVsProposed";
export { StrategicTradeoffs } from "./StrategicTradeoffs";
export { RecommendedPositionCard } from "./RecommendedPositionCard";
export { HamiltonInterpretation } from "./HamiltonInterpretation";
export { ScenarioArchive } from "./ScenarioArchive";
export { InsufficientConfidenceGate } from "./InsufficientConfidenceGate";
export { GenerateBoardSummaryButton } from "./GenerateBoardSummaryButton";
```
</action>

<acceptance_criteria>
- `src/components/hamilton/simulate/index.ts` exists
- File contains 10 named export statements
- All imports resolve to files in `./` directory
</acceptance_criteria>

---

## Wave 4: Page Integration

### Task 4.1 — Replace stub `page.tsx` with live SimulatePage

<read_first>
- src/app/pro/(hamilton)/simulate/page.tsx (current stub)
- src/app/pro/(hamilton)/analyze/page.tsx (pattern to follow)
- src/app/pro/(hamilton)/layout.tsx (auth/layout context)
- src/lib/auth.ts
- src/app/pro/(hamilton)/simulate/actions.ts
</read_first>

<action>
Replace `src/app/pro/(hamilton)/simulate/page.tsx` with:

```typescript
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SimulateWorkspace } from "@/components/hamilton/simulate";

export const metadata: Metadata = { title: "Scenario Modeling" };

/**
 * SimulatePage — Server component that gates and hydrates the Simulate workspace.
 * Auth enforced at layout level (canAccessPremium) but also verified here.
 * Passes userId and institutionContext to the client workspace shell.
 */
export default async function SimulatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const institutionId =
    (user.institution_name ?? "").toLowerCase().replace(/\s+/g, "-") || null;

  const institutionContext = {
    name: user.institution_name ?? undefined,
    type: user.institution_type ?? undefined,
    assetTier: user.asset_tier ?? undefined,
    fedDistrict: user.fed_district ?? null,
  };

  return (
    <SimulateWorkspace
      userId={user.id}
      institutionId={institutionId}
      institutionContext={institutionContext}
    />
  );
}
```
</action>

<acceptance_criteria>
- `src/app/pro/(hamilton)/simulate/page.tsx` no longer contains "Phase 44 — coming soon"
- File imports `SimulateWorkspace` from `@/components/hamilton/simulate`
- File exports `metadata` with `title: "Scenario Modeling"`
- Server component (no `"use client"` directive)
- `redirect("/")` called if user is null
- `institutionContext` object with `name`, `type`, `assetTier`, `fedDistrict` passed to `SimulateWorkspace`
</acceptance_criteria>

---

## Verification

### Must-Haves (derived from phase goal)

These conditions MUST all be true for Phase 44 to be considered complete:

1. **Live slider**: Dragging the slider at `/pro/simulate` updates the percentile indicator and peer gap without a page reload or network request (client math only via `computeFeePosition`)
2. **Current vs Proposed**: Side-by-side comparison shows current percentile, proposed percentile, distance from peer median, and risk profile label for both states
3. **Confidence tier badge**: `RecommendedPositionCard` displays "STRONG DATA" or "PROVISIONAL" badge. Insufficient category shows `InsufficientConfidenceGate`.
4. **Scenario saved + retrievable**: `saveScenario()` inserts to `hamilton_scenarios` with `status = 'active'`. `listScenarios()` returns it. Re-loading page shows it in archive.
5. **Board summary CTA**: Clicking "Generate Board Scenario Summary" saves scenario + navigates to `/pro/report?scenario_id={uuid}`

### Verification Commands

```bash
# TypeScript check (must pass with zero errors)
npx tsc --noEmit

# Lint check
npx eslint src/lib/hamilton/simulation.ts src/app/api/hamilton/simulate/route.ts src/app/pro/\(hamilton\)/simulate/actions.ts --max-warnings 0

# Unit test: simulation math
npx vitest run src/lib/hamilton/simulation.test.ts

# File existence checks
test -f src/lib/hamilton/simulation.ts && echo "PASS" || echo "FAIL"
test -f src/app/api/hamilton/simulate/route.ts && echo "PASS" || echo "FAIL"
test -f src/app/pro/\(hamilton\)/simulate/actions.ts && echo "PASS" || echo "FAIL"
test -f src/components/hamilton/simulate/SimulateWorkspace.tsx && echo "PASS" || echo "FAIL"
test -f src/components/hamilton/simulate/FeeSlider.tsx && echo "PASS" || echo "FAIL"
test -f src/components/hamilton/simulate/CurrentVsProposed.tsx && echo "PASS" || echo "FAIL"
test -f src/components/hamilton/simulate/index.ts && echo "PASS" || echo "FAIL"

# Grep checks
grep -q "computeFeePosition" src/lib/hamilton/simulation.ts && echo "PASS" || echo "FAIL"
grep -q "computeTradeoffs" src/lib/hamilton/simulation.ts && echo "PASS" || echo "FAIL"
grep -q '"use server"' src/app/pro/\(hamilton\)/simulate/actions.ts && echo "PASS" || echo "FAIL"
grep -q '"use client"' src/components/hamilton/simulate/SimulateWorkspace.tsx && echo "PASS" || echo "FAIL"
grep -q "useCompletion" src/components/hamilton/simulate/SimulateWorkspace.tsx && echo "PASS" || echo "FAIL"
grep -q "onValueCommit" src/components/hamilton/simulate/FeeSlider.tsx && echo "PASS" || echo "FAIL"
grep -q "canSimulate" src/components/hamilton/simulate/SimulateWorkspace.tsx && echo "PASS" || echo "FAIL"
grep -q "hamilton-gradient-cta" src/components/hamilton/simulate/GenerateBoardSummaryButton.tsx && echo "PASS" || echo "FAIL"
grep -q "hamilton-font-serif" src/components/hamilton/simulate/RecommendedPositionCard.tsx && echo "PASS" || echo "FAIL"
grep -q "status = .active." src/app/pro/\(hamilton\)/simulate/actions.ts && echo "PASS" || echo "FAIL"
```

### Additional: Write unit test for simulation.ts

<read_first>
- src/lib/hamilton/confidence.test.ts (test pattern to follow)
- src/lib/hamilton/simulation.ts
</read_first>

<action>
Create `src/lib/hamilton/simulation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  estimatePercentile,
  classifyRisk,
  computeFeePosition,
  computeTradeoffs,
  type DistributionData,
} from "./simulation";

const MOCK_DIST: DistributionData = {
  fee_category: "overdraft",
  median_amount: 35,
  p25_amount: 25,
  p75_amount: 45,
  min_amount: 5,
  max_amount: 75,
  approved_count: 30,
};

describe("estimatePercentile", () => {
  it("returns 0 for fee at or below min", () => {
    expect(estimatePercentile(5, MOCK_DIST)).toBe(0);
    expect(estimatePercentile(0, MOCK_DIST)).toBe(0);
  });

  it("returns 100 for fee at or above max", () => {
    expect(estimatePercentile(75, MOCK_DIST)).toBe(100);
    expect(estimatePercentile(100, MOCK_DIST)).toBe(100);
  });

  it("returns 50 for fee at median", () => {
    expect(estimatePercentile(35, MOCK_DIST)).toBe(50);
  });

  it("returns 25 for fee at p25", () => {
    expect(estimatePercentile(25, MOCK_DIST)).toBe(25);
  });

  it("returns 75 for fee at p75", () => {
    expect(estimatePercentile(45, MOCK_DIST)).toBe(75);
  });
});

describe("classifyRisk", () => {
  it("returns low for percentile below 50", () => {
    expect(classifyRisk(0)).toBe("low");
    expect(classifyRisk(49)).toBe("low");
  });

  it("returns medium for percentile 50-74", () => {
    expect(classifyRisk(50)).toBe("medium");
    expect(classifyRisk(74)).toBe("medium");
  });

  it("returns high for percentile 75+", () => {
    expect(classifyRisk(75)).toBe("high");
    expect(classifyRisk(100)).toBe("high");
  });
});

describe("computeFeePosition", () => {
  it("computes correct position for below-median fee", () => {
    const pos = computeFeePosition(20, MOCK_DIST);
    expect(pos.medianGap).toBe(-15);
    expect(pos.riskProfile).toBe("low");
    expect(pos.percentile).toBeLessThan(50);
  });

  it("computes correct position for above-p75 fee", () => {
    const pos = computeFeePosition(55, MOCK_DIST);
    expect(pos.riskProfile).toBe("high");
    expect(pos.percentile).toBeGreaterThan(75);
  });
});

describe("computeTradeoffs", () => {
  it("returns three tradeoff dimensions", () => {
    const current = computeFeePosition(35, MOCK_DIST);
    const proposed = computeFeePosition(45, MOCK_DIST);
    const tradeoffs = computeTradeoffs(35, 45, current, proposed);
    expect(tradeoffs).toHaveProperty("revenueImpact");
    expect(tradeoffs).toHaveProperty("riskMitigation");
    expect(tradeoffs).toHaveProperty("operationalImpact");
  });

  it("shows positive fee change direction", () => {
    const current = computeFeePosition(35, MOCK_DIST);
    const proposed = computeFeePosition(45, MOCK_DIST);
    const tradeoffs = computeTradeoffs(35, 45, current, proposed);
    expect(tradeoffs.revenueImpact.value).toContain("+");
  });
});
```
</action>

<acceptance_criteria>
- `src/lib/hamilton/simulation.test.ts` exists
- `npx vitest run src/lib/hamilton/simulation.test.ts` exits with code 0
- All 9 test cases pass (estimatePercentile: 5, classifyRisk: 3, computeFeePosition: 2, computeTradeoffs: 2)
</acceptance_criteria>

---

## must_haves

- `/pro/simulate` renders the SimulateWorkspace (not the "coming soon" stub)
- Slider `onValueChange` triggers live client math without network call
- Slider `onValueCommit` triggers Hamilton interpretation stream via `/api/hamilton/simulate`
- `canSimulate()` gate correctly shows `InsufficientConfidenceGate` when tier is insufficient
- `saveScenario()` persists to `hamilton_scenarios` with `confidence_tier` snapshot
- `listScenarios()` returns only `status = 'active'` rows (archived excluded)
- "Generate Board Scenario Summary" navigates to `/pro/report?scenario_id={uuid}`
- `npx tsc --noEmit` exits 0 after all files created
- `npx vitest run src/lib/hamilton/simulation.test.ts` exits 0
