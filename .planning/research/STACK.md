# Technology Stack — Hamilton Pro Platform (v8.0)

**Project:** Bank Fee Index — Hamilton Pro Platform
**Researched:** 2026-04-08
**Confidence:** HIGH — new dependencies verified via npm and official docs; integration patterns verified against existing codebase and tracked GitHub issues.
**Scope:** NEW additions only. Existing stack (Next.js 16, React 19, Tailwind v4, `postgres` client, Anthropic SDK, Vercel AI SDK, Stripe, `radix-ui` umbrella, Recharts) is validated and not reconsidered.

---

## Decision Summary

| Capability | Decision | Rationale |
|---|---|---|
| PDF export | `@react-pdf/renderer` v4.4 via API route | Declarative React PDF, React 19 support confirmed, no headless browser |
| Simulation state | Zustand v5 (new dep) | 6 components share slider state; prop-drill / Context thrash is worse |
| Simulation math | Inline functions in `src/lib/simulation.ts` | 3 functions, zero library needed |
| Slider UX | Radix Slider already in `radix-ui` + `onValueCommit` | Zero new dependency; commit event is the natural debounce boundary |
| Debounce library | None | `onValueCommit` fires on pointer release / keyboard commit — already debounced at interaction end |
| Signal persistence | PostgreSQL JSONB (`postgres` client, existing) | Matches data model spec; batch-written by crawler pipeline, polled on read |
| Floating chat overlay | React Portal into `#hamilton-chat-root` | Already available via `@radix-ui/react-portal` in `radix-ui` |
| Screen-specific agents | Separate system prompts per route (existing Anthropic SDK) | Proven in v7.0 reasoning engine; four routes, four prompt templates |

---

## New Dependencies Required

Two new production packages. Everything else is already installed or zero-dependency.

| Library | Version | Purpose | Why |
|---|---|---|---|
| `@react-pdf/renderer` | `^4.4.0` | PDF generation for Report Builder export | React 19 support confirmed (since v4.1.0). No headless browser. Vercel-compatible. |
| `zustand` | `^5.0.12` | Client-side simulation state (slider values, computed deltas, ephemeral scenario) | 6 Simulate-screen components consume shared slider state. 1KB, React 19 confirmed. |

```bash
npm install @react-pdf/renderer zustand
```

---

## Already Present — No New Install Needed

| Library | In package.json? | Hamilton v8 Usage |
|---|---|---|
| `@radix-ui/react-slider` | Yes (via `radix-ui` umbrella) | `FeeSliderInput`, `ComparativeModelingCard` |
| `@radix-ui/react-portal` | Yes (via `radix-ui` umbrella) | Floating chat overlay mount on Monitor screen |
| `@radix-ui/react-dialog` | Yes (via `radix-ui` umbrella) | Floating chat overlay container |
| `recharts` | Yes (`^3.7.0`) | Evidence charts in Analyze, distribution curves in Simulate |
| `ai` + `@ai-sdk/anthropic` | Yes | Streaming agent responses, all four screen-specific routes |
| `@anthropic-ai/sdk` | Yes | Direct Hamilton agent calls |
| `zod` | Yes | Validate screen-specific API response shapes |
| `postgres` | Yes | All 6 new DB tables (JSONB columns via existing template-literal pattern) |
| `stripe` | Yes | Pro paywall gate (`$500/mo` subscription check in Hamilton shell layout) |

---

## Explicitly NOT Adding

| Rejected Library | Reason |
|---|---|
| `use-debounce` / `react-debounce-input` | Radix `onValueCommit` fires once on interaction end (pointer release or keyboard commit). That is already the debounce. Adding a debounce hook for slider state adds ~4KB and complexity for zero benefit. |
| `simple-statistics` | The simulation engine needs exactly three functions: percentile rank, median gap, risk profile classification. Implementing them inline in `src/lib/simulation.ts` is 15 lines. Importing a 50KB stats library for three trivial operations is wasteful. |
| `puppeteer` / `@sparticuz/chromium` | Requires a Chrome process. Incompatible with Vercel serverless (250MB bundle limit, 10s timeout on Hobby). Memory-intensive, slow cold starts. `@react-pdf/renderer` generates without a browser. |
| `html2canvas` + `jsPDF` | Produces raster image PDFs. Text is not searchable or selectable — unsuitable for executive reports that get printed and emailed. |
| `@floating-ui/react` | The Hamilton floating chat is a fixed-position bottom-right panel. It does not need position calculation. React Portal into a known DOM node is sufficient. Floating UI is for tooltips and popovers with anchor-relative positioning. |
| Drizzle ORM / Prisma | The codebase has 20+ existing query files using the `postgres` template-literal pattern. Introducing an ORM mid-project creates inconsistency and a migration burden with zero benefit for this milestone. |
| Supabase Realtime / WebSockets | Monitor signals are written by the crawler batch pipeline (Modal workers), not in real time. The Monitor screen reads on mount and on manual refresh. No real-time subscription infrastructure is justified. |
| `react-query` / `swr` | The app uses Server Components for data fetching with React 19's native async/await. Adding a client data-fetching cache layer would conflict with the RSC model and duplicate what already works. |

---

## Integration Details

### 1. PDF Generation — `@react-pdf/renderer` v4.4

**Route:** `GET /api/hamilton/reports/[id]/pdf`

API route using `renderToBuffer`. The client's "Export PDF" button in `ReportExportBar` hits this endpoint, which fetches the saved report JSON from `hamilton_reports`, renders the `ReportDocument` component, and streams the buffer back as `application/pdf`.

**Required `next.config.ts` change:**

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@react-pdf/renderer'],  // ADD THIS LINE
  // ... existing headers config
};
```

The `serverExternalPackages` key tells Next.js to treat `@react-pdf/renderer` as an external Node.js module rather than bundling it through the RSC transform pipeline. Without this, the App Router bundler produces a `PDFDocument is not a constructor` runtime error. This issue is tracked in diegomura/react-pdf#3074 (confirmed affecting Next.js 15 and 16) and the fix is confirmed.

**Report component pattern:**

`@react-pdf/renderer` uses its own primitive system (`Document`, `Page`, `View`, `Text`, `Image`) — not Tailwind utilities. Report layout components live in `src/components/hamilton/report/` and are styled with the library's `StyleSheet.create()` API. They receive plain data objects (not React state) — the report JSON from `hamilton_reports` is the input.

Recharts SVG charts cannot render inside `@react-pdf/renderer` directly. Any chart in the Report screen must either be omitted from the PDF or pre-rendered to a PNG data URL via a canvas snapshot (using `html2canvas` on the client) before being passed to the route as a base64 string. For v8.0, omit charts from PDF and use stat callout boxes instead — consistent with the Salesforce Connected FINS report aesthetic.

**Confidence:** MEDIUM-HIGH. `renderToBuffer` in an App Router API route works with the `serverExternalPackages` fix. Issue #3074 is open as of early 2025 but the workaround is confirmed by multiple community sources. Test this route in Phase 1.

---

### 2. Simulation Engine — Pure Functions, No Library

File: `src/lib/simulation.ts`

The `SimulationResponse` contract from `06-api-and-agent-contracts.md` requires three computed values per state (current and proposed):

```typescript
// src/lib/simulation.ts

export function computePercentileRank(value: number, distribution: number[]): number {
  if (distribution.length === 0) return 50;
  const below = distribution.filter(v => v < value).length;
  return Math.round((below / distribution.length) * 100);
}

export function computeMedianGap(value: number, median: number): number {
  if (median === 0) return 0;
  return Math.round(((value - median) / median) * 100);
}

export type RiskProfile = 'low' | 'moderate' | 'elevated' | 'high';

export function classifyRiskProfile(percentile: number): RiskProfile {
  if (percentile <= 25) return 'low';
  if (percentile <= 50) return 'moderate';
  if (percentile <= 75) return 'elevated';
  return 'high';
}
```

**Data load pattern:** When the Simulate screen mounts, one server action fetches `distribution: number[]` for the selected fee category and peer set from the fee index. This array drops into the Zustand store. All slider interactions compute synchronously in the browser — no server round-trip per tick.

---

### 3. Slider UX — Radix Slider + `onValueCommit`

`@radix-ui/react-slider` (v1.3.6) is already installed via the `radix-ui` umbrella package. The canonical pattern for "instant visual feedback, deferred server write" uses two separate event handlers:

```typescript
// FeeSliderInput.tsx  ("use client")
import * as Slider from '@radix-ui/react-slider';

<Slider.Root
  value={[proposedFee]}
  min={feeMin}
  max={feeMax}
  step={0.50}
  onValueChange={([v]) => setProposedFee(v)}        // instant: updates Zustand, re-renders delta badges
  onValueCommit={([v]) => persistScenarioDraft(v)}  // deferred: server action on pointer release
>
```

`onValueCommit` fires exactly once when the user finishes dragging (pointer up) or finishes a keyboard interaction. It is already the natural debounce boundary — no additional debounce hook is required.

The `FeeSliderInput` also accepts a number input alongside the slider for keyboard entry. The number input uses a local `onChange` → `onBlur` to commit, bypassing the slider entirely for direct input.

**Confidence:** HIGH — documented Radix Slider API, confirmed in radix-ui/primitives discussion #2169.

---

### 4. Simulation State — Zustand v5

Store scope: client-only, scoped to `/pro/hamilton/simulate`. Not a global app store.

```typescript
// src/stores/simulation-store.ts
import { create } from 'zustand';
import { computePercentileRank, computeMedianGap, classifyRiskProfile } from '@/lib/simulation';

interface SimulationStore {
  feeCategory: string | null;
  distribution: number[];
  median: number;
  currentFee: number;
  proposedFee: number;
  // Derived — recomputed on setProposedFee
  currentState: { percentile: number; medianGap: number; riskProfile: string };
  proposedState: { percentile: number; medianGap: number; riskProfile: string };
  deltas: { percentileChange: number; medianGapChange: number; riskShift: string };
  // Actions
  loadScenario: (category: string, dist: number[], currentFee: number) => void;
  setProposedFee: (v: number) => void;
}
```

The store is created with `create<SimulationStore>()` in the `SimulateScreen` component's module scope. It is not wrapped in Context for SSR reasons — Zustand v5 recommends the context-provider pattern only when multiple independent instances are needed on the same page. A single simulation screen has one instance.

The six Simulate-screen components that subscribe: `FeeSliderInput`, `ComparativeModelingCard`, `StateComparisonCard`, `ScenarioDeltaBadge`, `HamiltonInterpretationCard`, `StrategicTradeoffsCard`, `RecommendedPositionCard`. Each subscribes to only the slice it renders using selector functions — no component re-renders when an unrelated slice changes.

**Confidence:** HIGH — Zustand 5.0.12 confirmed on npm, React 19 compatibility confirmed, Next.js App Router compatibility confirmed via multiple community sources.

---

### 5. Signal Persistence — PostgreSQL JSONB, Existing Client

The six new tables defined in `05-data-model-and-persistence.md` use `jsonb` columns for flexible payloads. All queries use the existing `postgres` template-literal pattern in `src/lib/crawler-db/`.

Create new query file: `src/lib/crawler-db/hamilton.ts`

Key query pattern for the Monitor screen (signals filtered by watchlist):

```sql
SELECT s.*
FROM hamilton_signals s
WHERE s.institution_id = ANY(
  SELECT (jsonb_array_elements_text(w.institution_ids))::int
  FROM hamilton_watchlists w
  WHERE w.user_id = $1
)
ORDER BY s.created_at DESC
LIMIT 50;
```

For alert acknowledgement (status update from Monitor screen):

```sql
UPDATE hamilton_priority_alerts
SET status = 'acknowledged', acknowledged_at = NOW()
WHERE id = $1 AND user_id = $2;
```

No new infrastructure. Signals are written by the Python/Modal crawler workers. The Monitor screen polls on mount — not real-time. A `useEffect` with a 60-second interval is sufficient for the v8.0 release.

---

### 6. Floating Chat Overlay — React Portal

The Monitor screen has a floating Hamilton chat panel that stays visible while the user scrolls the signal feed. Implementation uses `@radix-ui/react-portal` (already in `radix-ui`).

Add the portal mount point to the Hamilton shell layout:

```tsx
// src/app/pro/hamilton/layout.tsx
export default function HamiltonLayout({ children }) {
  return (
    <>
      <HamiltonShell>{children}</HamiltonShell>
      <div id="hamilton-chat-root" />   {/* portal mount */}
    </>
  );
}
```

Render the overlay via portal:

```tsx
// src/components/hamilton/HamiltonFloatingChat.tsx  ("use client")
import { Portal } from '@radix-ui/react-portal';

export function HamiltonFloatingChat({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <Portal container={document.getElementById('hamilton-chat-root')}>
      <div className="fixed bottom-6 right-6 w-96 z-50 shadow-xl rounded-xl bg-white border border-stone-200">
        {/* chat panel */}
      </div>
    </Portal>
  );
}
```

**Confidence:** HIGH — standard React Portal pattern, `@radix-ui/react-portal` confirmed present in `radix-ui` umbrella.

---

### 7. Screen-Specific Agent Behavior — Existing SDK, New Prompts

No new AI packages. The four Hamilton screens each get a separate API route and system prompt:

```
POST /api/hamilton/analyze
POST /api/hamilton/simulate
POST /api/hamilton/report
POST /api/hamilton/monitor
```

Each route follows the existing streaming pattern from `src/lib/hamilton/hamilton-agent.ts`:

1. Build a screen-specific `systemPrompt` from a template in `src/lib/hamilton/prompts/`
2. Call `streamText` from the `ai` SDK with the appropriate response schema
3. Parse the response against the TypeScript interface via Zod (the four interfaces defined in `06-api-and-agent-contracts.md`)

The existing daily cost circuit breaker in `src/lib/api-usage.ts` already gates all Hamilton routes. No new spend controls needed.

---

## Required Configuration Changes

### `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@react-pdf/renderer'],  // NEW — required for PDF API route
  poweredByHeader: false,
  // ... existing headers() config unchanged
};
```

### Database Migrations (SQL, no library changes)

Six new tables in Supabase PostgreSQL. Add as a migration file in `supabase/migrations/` or run directly:

- `hamilton_saved_analyses` — `response_json jsonb`
- `hamilton_scenarios` — `result_json jsonb`
- `hamilton_reports` — `report_json jsonb`, `scenario_id uuid nullable`
- `hamilton_watchlists` — `institution_ids jsonb`, `fee_categories jsonb`, `regions jsonb`, `peer_set_ids jsonb`
- `hamilton_signals` — `source_json jsonb`
- `hamilton_priority_alerts` — `status text`, `acknowledged_at timestamptz nullable`

### Hamilton Shell Layout Addition

Add `<div id="hamilton-chat-root" />` portal mount to `src/app/pro/hamilton/layout.tsx`.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| PDF generation | `@react-pdf/renderer` | Puppeteer | Vercel serverless 250MB bundle limit, 10s timeout on Hobby plan, memory-intensive cold starts |
| PDF generation | `@react-pdf/renderer` | `jsPDF` + `html2canvas` | Raster image output — text not searchable, unsuitable for executive reports |
| Simulation state | Zustand v5 | React Context | Context re-renders entire subtree on every slider tick. 6+ components consume simulation state — prop-drill or context wrapping is a worse pattern. |
| Simulation state | Zustand v5 | `useState` in parent | Triggers prop drilling through 3+ levels across 6 components |
| Simulation math | Inline `src/lib/simulation.ts` | `simple-statistics` npm | 50KB for 3 trivial functions. Quantile rank and median gap are 5 lines each. |
| Slider | Radix Slider (already installed) | `rc-slider` | Radix already installed via `radix-ui` umbrella. Adding `rc-slider` is redundant. |
| Floating chat | React Portal (Radix, already installed) | `@floating-ui/react` | Floating UI provides anchor-relative positioning for tooltips/popovers. A fixed bottom-right panel needs no position engine. |
| Signal storage | PostgreSQL JSONB (existing client) | Redis / message queue | Signals are batch-written by crawler pipeline, polled on read. No real-time requirement exists. |
| Debounce | `onValueCommit` (built-in) | `use-debounce` npm | `onValueCommit` is already the natural debounce for slider interactions. The npm package adds 4KB for a problem Radix already solves. |

---

## Sources

- `@react-pdf/renderer` npm: https://www.npmjs.com/package/@react-pdf/renderer — v4.4.0 current, React 19 support confirmed since v4.1.0 (HIGH)
- Next.js 16 `renderToBuffer` issue: https://github.com/diegomura/react-pdf/issues/3074 — confirmed broken without `serverExternalPackages` (HIGH)
- `serverExternalPackages` API docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages (HIGH)
- Radix Slider `onValueCommit` discussion: https://github.com/radix-ui/primitives/discussions/2169 (HIGH)
- `@radix-ui/react-slider` v1.3.6: https://www.npmjs.com/package/@radix-ui/react-slider (HIGH)
- Zustand v5.0.12 npm: https://www.npmjs.com/package/zustand (HIGH)
- Zustand + Next.js App Router pattern: https://www.dimasroger.com/blog/how-to-use-zustand-with-next-js-15 (MEDIUM — community source consistent with official Zustand docs)
- React 19 + Zustand compatibility: https://react.wiki/state-management/zustand-tutorial/ (MEDIUM)
- PostgreSQL JSONB docs: https://www.postgresql.org/docs/current/datatype-json.html (HIGH)
- Radix Portal: https://www.radix-ui.com/primitives/docs/utilities/portal (HIGH)

---

*Stack research for: Bank Fee Index v8.0 Hamilton Pro Platform*
*Researched: 2026-04-08*
