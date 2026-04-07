# Phase 26: National Data Admin Portal - Research

**Researched:** 2026-04-07
**Domain:** Next.js admin UI with Recharts charts, tabbed panels, server components
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Single `/admin/national` page with tabbed panels: Overview | Call Reports | Economic | Health. Matches existing Market page pattern (sticky tabs, content switches). No sub-routes.
- **D-02:** Recharts line charts for 8-quarter trends (revenue, deposits, loans, health metrics). Stat cards with current value + sparkline for indicators (ROA, unemployment, CPI YoY). Recharts 3.7.0 already in project.
- **D-03:** Follow existing design system: `.admin-card` class, Geist font, `tabular-nums`, emerald/amber status badges, `text-[11px] font-semibold text-gray-400 uppercase tracking-wider` for labels.
- **D-04:** Each data source card shows "Last updated: X days ago" with badge. Green = <7 days, Amber = 7-30 days, Red = >30 days or missing data. Badge uses existing emerald/amber/red pattern.
- **D-05:** Overview tab: summary cards for each data source with key numbers and freshness badges. At-a-glance view of all national data health.
- **D-06:** Call Reports tab: 8-quarter revenue trend chart, top 10 institutions by SC income table, bank vs CU charter split comparison. Uses `getRevenueTrend()`, `getTopRevenueInstitutions()`, `getRevenueByCharter()`.
- **D-07:** Economic tab: FRED indicators as stat cards with sparklines. Beige Book district summaries as a 12-district grid or list. Uses `getNationalEconomicSummary()`, `getDistrictBeigeBookSummaries()`.
- **D-08:** Health tab: ROA, ROE, efficiency ratio stat cards with trend. Deposit/loan growth charts. Charter segmentation comparison. Uses `getIndustryHealthMetrics()`, `getDepositGrowthTrend()`, `getLoanGrowthTrend()`, `getHealthMetricsByCharter()`.
- **D-09:** Server components for the page and tab panels. Client component only for tab switching (URL search params or lightweight state). Matches existing admin pattern.
- **D-10:** Use Suspense boundaries with SkeletonCards for loading states per tab. Existing `SkeletonCards`, `SkeletonTable` components from `src/components/skeleton.tsx`.
- **D-11:** All data queries are built and tested (Phases 23-25).
- **D-12:** Design system conventions from MEMORY.md.

### Claude's Discretion

- Chart colors and exact Recharts configuration
- Card grid layout (2-col, 3-col, responsive)
- District summary presentation (grid vs list vs accordion)
- Whether to add the page to AdminNav immediately or keep it as a hidden route initially

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | National data summary page at `/admin/national` showing all data sources | D-01/D-05: Single page with Overview tab; all data queries confirmed to exist |
| ADMIN-02 | Call Report revenue dashboard (trends, top institutions, charter split) | D-06: `getRevenueTrend()` and `getTopRevenueInstitutions()` verified in codebase; charter split embedded in `RevenueSnapshot.bank_service_charges`/`cu_service_charges` |
| ADMIN-03 | Economic conditions panel (FRED + Beige Book summaries) | D-07: `getNationalEconomicSummary()` returns `RichIndicator` with history for sparklines; `getDistrictBeigeBookSummaries()` returns 12-district array |
| ADMIN-04 | Industry health panel (ROA, efficiency, deposits, loans) | D-08: All four queries confirmed in `src/lib/crawler-db/health.ts`; `GrowthTrend` interface has `history` array for Recharts |
</phase_requirements>

---

## Summary

Phase 26 builds a single tabbed admin page at `/admin/national` that lets admins verify all national data sources (Call Reports, FRED, Beige Book, Industry Health) before Hamilton consumes them. All data queries were built in Phases 23-25 and are verified in the codebase. The implementation is purely additive UI work with no new data layer required.

The pattern is identical to existing admin pages: server component fetches data, passes typed props to child components, client component handles tab switching via URL search params. Recharts is already installed (3.7.0) and used in 7+ places in the codebase. The `Sparkline`, `SkeletonCards`, and `SkeletonTable` components are ready to use without modification.

**Primary recommendation:** Build the page as a server component with URL-param-driven tab selection and four lazy-loaded Suspense sections, following the `market/page.tsx` and `districts/page.tsx` structural patterns exactly.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Next.js App Router | 16.1.6 | Server components, `searchParams`, Suspense | [VERIFIED: package.json] |
| Recharts | 3.7.0 | LineChart for 8-quarter trends, BarChart for charter split | [VERIFIED: package.json] |
| React | 19.2.3 | Client tab switching component | [VERIFIED: package.json] |
| Tailwind CSS | 4.x | Styling via existing design system classes | [VERIFIED: package.json] |

### Data Query Modules (built in Phases 23-25)
| Module | File | Functions Available |
|--------|------|---------------------|
| Call Reports | `src/lib/crawler-db/call-reports.ts` | `getRevenueTrend()`, `getTopRevenueInstitutions()` |
| Fed / FRED | `src/lib/crawler-db/fed.ts` | `getNationalEconomicSummary()`, `getDistrictBeigeBookSummaries()`, `getNationalBeigeBookSummary()`, `getFredSummary()` |
| Health | `src/lib/crawler-db/health.ts` | `getIndustryHealthMetrics()`, `getDepositGrowthTrend()`, `getLoanGrowthTrend()`, `getInstitutionCountTrend()`, `getHealthMetricsByCharter()` |
| Derived | `src/lib/crawler-db/derived.ts` | `getRevenueConcentration()`, `getFeeDependencyRatio()`, `getRevenuePerInstitution()` |

### Reusable UI Components (already in codebase)
| Component | File | Interface |
|-----------|------|-----------|
| `Sparkline` | `src/components/sparkline.tsx` | `{ data: number[], width?, height?, color?, className? }` |
| `SkeletonCards` | `src/components/skeleton.tsx` | `{ count?: number }` |
| `SkeletonTable` | `src/components/skeleton.tsx` | `{ rows?, cols? }` |
| `Breadcrumbs` | `src/components/breadcrumbs.tsx` | `{ items: [{label, href?}] }` |

**No new packages required.**

---

## Architecture Patterns

### Recommended File Structure
```
src/app/admin/national/
├── page.tsx                   # Server component, auth, data fetching per active tab
├── tab-nav.tsx                # "use client" — tab buttons reading/writing ?tab= param
├── overview-panel.tsx         # Server component — data source summary cards
├── call-reports-panel.tsx     # Server component — revenue trend + institutions table
├── economic-panel.tsx         # Server component — FRED cards + Beige Book district grid
└── health-panel.tsx           # Server component — ROA/ROE cards + deposit/loan charts
```

Keeping panels in separate files prevents any single file from exceeding the 300-line limit from coding-style rules.

### Pattern 1: URL-Param Tab Switching (Established Pattern)

This is how ALL existing admin pages handle filter state. The tab nav pushes `?tab=call-reports` to the URL; the server page reads `searchParams` and renders the matching panel.

```typescript
// tab-nav.tsx — "use client"
"use client";
import { useRouter, useSearchParams } from "next/navigation";

const TABS = ["overview", "call-reports", "economic", "health"] as const;
type Tab = typeof TABS[number];

export function TabNav({ active }: { active: Tab }) {
  const router = useRouter();
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => router.push(`?tab=${tab}`)}
          className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
            active === tab
              ? "border-b-2 border-gray-900 text-gray-900"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {tab.replace("-", " ")}
        </button>
      ))}
    </div>
  );
}

// page.tsx — server component
export const dynamic = "force-dynamic";

export default async function NationalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAuth("view");
  const { tab = "overview" } = await searchParams;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "National Data" }]} />
      <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        National Data Portal
      </h1>
      <TabNav active={tab as Tab} />
      <Suspense fallback={<SkeletonCards count={4} />}>
        {tab === "overview" && <OverviewPanel />}
        {tab === "call-reports" && <CallReportsPanel />}
        {tab === "economic" && <EconomicPanel />}
        {tab === "health" && <HealthPanel />}
      </Suspense>
    </div>
  );
}
```

### Pattern 2: Recharts LineChart for 8-Quarter Trends

The existing codebase uses `BarChart` everywhere, but D-02 specifies `LineChart` for trend data. The LineChart pattern is:

```typescript
// Source: [ASSUMED: Recharts 3.7 docs — LineChart API is stable since v2]
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function RevenueTrendChart({ data }: { data: { quarter: string; total_service_charges: number }[] }) {
  const reversed = [...data].reverse(); // DB returns newest-first; chart wants oldest-first
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={reversed} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => `$${(v / 1_000_000_000).toFixed(1)}B`}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip formatter={(v: number) => [`$${(v / 1_000_000_000).toFixed(2)}B`, "Revenue"]} />
        <Line type="monotone" dataKey="total_service_charges" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="bank_service_charges" stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="cu_service_charges" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**All Recharts chart components require `"use client"` since they use canvas/DOM.** Server components pass pre-fetched data as props.

### Pattern 3: Freshness Badge

Derived from current value of `generated_at` / `asOf` timestamps in the data interfaces.

```typescript
// Pure function — can live in a server component (no client needed)
function FreshnessBadge({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) {
    return <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-600">No data</span>;
  }
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  const cls = days < 7
    ? "bg-emerald-50 text-emerald-700"
    : days < 30
    ? "bg-amber-50 text-amber-700"
    : "bg-red-50 text-red-700";
  const label = days < 7 ? `${days}d ago` : days < 30 ? `${days}d ago` : `${days}d — stale`;
  return <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}
```

### Pattern 4: Stat Card with Sparkline

The pattern for stat cards with sparklines follows existing dashboard cards:

```typescript
// Server component (no "use client" needed — Sparkline is pure SVG)
function IndicatorCard({
  label, value, unit, history, asOf,
}: {
  label: string;
  value: number | null;
  unit: string;
  history: number[];
  asOf: string | null;
}) {
  return (
    <div className="admin-card p-4 space-y-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {value !== null ? `${value.toFixed(2)}${unit}` : "—"}
        </p>
        {history.length >= 2 && <Sparkline data={history} width={64} height={24} color="#3b82f6" />}
      </div>
      {asOf && <p className="text-[11px] text-gray-400">As of {asOf}</p>}
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Putting Recharts inside server components.** All Recharts components (`LineChart`, `BarChart`, `ResponsiveContainer`) require `"use client"`. Pass pre-fetched data as serializable props (numbers, strings — no `Date` objects or `Map`s).
- **Rendering all 4 tabs on server simultaneously.** Only fetch data for the active tab. Other tabs get skeleton on first visit. This avoids 15+ parallel DB calls on every page load.
- **Using `Date` objects across the server/client boundary.** All date fields from DB queries return ISO strings (already handled in the query functions). Pass ISO strings, not `Date` instances, to client components.
- **Forgetting `export const dynamic = "force-dynamic"`.** This page reads live DB data — ISR caching must be disabled.
- **Calling `router.push()` for tab switching without `useTransition`.** In React 19, wrap navigation in `startTransition` to keep the UI interactive during navigation.

---

## Critical Finding: `getRevenueByCharter()` Does Not Exist

CONTEXT.md D-06 references `getRevenueByCharter()` and `getRevenueByTier()` as planned queries for the Call Reports tab. **These functions do not exist in `src/lib/crawler-db/call-reports.ts`.**

[VERIFIED: grep for `getRevenueByCharter` and `getRevenueByTier` in src/ returned zero matches]

**However, the bank vs CU split is already embedded in `RevenueSnapshot`:** each quarter in `getRevenueTrend()` already returns `bank_service_charges` and `cu_service_charges`. The charter split chart can be built directly from `RevenueTrend.quarters` — no new query function is needed for the basic bank/CU comparison.

For the Call Reports panel, the planner should use:
- `getRevenueTrend(8)` — provides 8 quarters with bank/CU split built in
- `getTopRevenueInstitutions(10)` — top 10 by latest quarter SC income
- Revenue per tier breakdown: available via `getRevenuePerInstitution()` from `derived.ts`

The planner should NOT create tasks to implement `getRevenueByCharter()` or `getRevenueByTier()` as standalone functions — the data is already surfaced by existing queries.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trend sparklines | Custom SVG polyline | `Sparkline` component (`src/components/sparkline.tsx`) | Already handles min/max normalization, gradient fill, trending dot |
| Loading states | Custom skeleton shimmer | `SkeletonCards`, `SkeletonTable` from `skeleton.tsx` | Animation class `.skeleton` defined in globals.css |
| Line charts | Custom SVG chart | Recharts `LineChart` + `ResponsiveContainer` | Already in project, used in 7 other components |
| Number formatting | Custom formatter | `formatAmount()`, `formatAssets()`, `formatPct()`, `timeAgo()` from `src/lib/format.ts` | Edge cases already handled |
| Auth check | Manual cookie reading | `requireAuth("view")` from `src/lib/auth.ts` | Session-based auth with role check |
| Tab URL state | Local state with useState | URL `searchParams` + `router.push()` | Matches all other admin pages; enables deep linking |

**Key insight:** The entire data layer, design system, and utility components are pre-built. This phase is exclusively UI assembly work.

---

## Common Pitfalls

### Pitfall 1: Recharts Server Component Boundary

**What goes wrong:** Adding `import { LineChart } from "recharts"` to a server component throws at build time — Recharts uses `window`, `canvas`, and React context that require the browser.

**Why it happens:** Recharts is a client-side charting library. Server components have no DOM.

**How to avoid:** All Recharts wrappers must have `"use client"` at the top. Split the file: server panel component fetches data and calls a client chart component with serializable props.

**Warning signs:** TypeScript error mentioning `useId`, `useState`, or `createContext` in a server context.

### Pitfall 2: Data Returned Newest-First

**What goes wrong:** Charts display flat or backwards trends when `getRevenueTrend()` data is passed directly to Recharts.

**Why it happens:** All query functions return rows `ORDER BY ... DESC` (newest first). Recharts plots data left-to-right in array order.

**How to avoid:** In every chart client component: `const chartData = [...props.data].reverse()` before passing to Recharts.

**Warning signs:** Chart shows data going right-to-left, or Q4 appears on the left before Q1.

### Pitfall 3: `formatPct` Applies 100x Multiplier

**What goes wrong:** Displaying ROA of `0.012` as `"1%"` via `formatPct(0.012)` gives wrong value for already-percentage fields.

**Why it happens:** `formatPct` in `format.ts` multiplies by 100: `${(value * 100).toFixed(0)}%`. But `GrowthTrend.current_yoy_pct` is already a percentage (e.g., `3.5` means 3.5%).

**How to avoid:** For fields already in percentage units (`yoy_change_pct`, `current_yoy_pct`, `roa` returned as ratio): check the data type before formatting. ROA from `getIndustryHealthMetrics()` returns `RichIndicator.current` as a ratio (0.012 = 1.2%); use `formatPct(roa)`. Growth trend YoY is already a percentage; use `value.toFixed(1) + "%"` directly.

**Warning signs:** ROA showing `1200%` instead of `1.2%`, or deposit growth showing `350%` instead of `3.5%`.

### Pitfall 4: Suspense Boundary Placement

**What goes wrong:** The Suspense fallback covers the entire page including the tab nav, so the tab bar disappears during loading.

**Why it happens:** Wrapping too high in the tree — the `<Suspense>` catches all async children including nav.

**How to avoid:** Wrap only the panel content, not the `<TabNav>` component. The tab nav is a client component with no async work.

### Pitfall 5: `getDistrictBeigeBookSummaries()` May Return Empty Array

**What goes wrong:** The Economic tab shows a blank 12-district grid with no summaries.

**Why it happens:** `beige_book_summaries` table is populated by a summarization job (Phase 24). If summaries were never generated, the table is empty even though raw Beige Book text exists in `fed_beige_book`.

**How to avoid:** Add an empty-state message: "Beige Book summaries not yet generated — run the summarization job." Use `getBeigeBookHeadlines()` (from `fed.ts`) as a fallback — it extracts first sentences from raw Beige Book text without requiring the summary table.

---

## Code Examples

### Admin Page Shell (Verified Pattern)

```typescript
// Source: src/app/admin/districts/page.tsx + market/page.tsx — established pattern
export const dynamic = "force-dynamic";

import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Suspense } from "react";
import { SkeletonCards } from "@/components/skeleton";

export default async function NationalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAuth("view");
  const { tab = "overview" } = await searchParams;
  // ... render tab nav + active panel
}
```

### Sparkline Usage for Indicators

```typescript
// Source: src/components/sparkline.tsx — Sparkline accepts data: number[]
// RichIndicator.history is { date: string; value: number }[] — extract values:
const sparkData = indicator.history.map((h) => h.value);
<Sparkline data={sparkData} width={64} height={24} color="#3b82f6" />
```

### Charter Split from RevenueTrend

```typescript
// Source: src/lib/crawler-db/call-reports.ts — bank/CU split is in RevenueSnapshot
const { quarters } = await getRevenueTrend(8);
const latest = quarters[0];
const bankPct = latest
  ? (latest.bank_service_charges / latest.total_service_charges) * 100
  : null;
const cuPct = latest
  ? (latest.cu_service_charges / latest.total_service_charges) * 100
  : null;
```

### Freshness Date Calculation

```typescript
// Pattern for all "last updated" timestamps across tabs
// RichIndicator.asOf is a YYYY-MM-DD string
// NationalBeigeBookSummaryRow.generated_at is an ISO datetime string
function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Separate sub-routes per data source | Single page, URL-param tabs | Matches admin pattern; no new layouts needed |
| No `LineChart` in codebase (only BarChart) | Add `LineChart` import from Recharts | Recharts 3.7 supports LineChart; no new package needed |
| Mock `getRevenueByCharter()` function | Use `bank_service_charges`/`cu_service_charges` from `RevenueSnapshot` | Saves one task; data already available |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `LineChart` from Recharts 3.7 accepts `type="monotone"` and `dot={false}` props as documented | Architecture Patterns — Pattern 2 | Low risk — Recharts API is stable; worst case: `dot` prop name differs, easily fixed |
| A2 | The `beige_book_summaries` table has data (populated by Phase 24 summarization job) | Pitfall 5 | Medium risk — if job never ran, Economic tab shows empty state |
| A3 | `NationalEconomicSummary.cpi_yoy_pct` is already a YoY percentage (not raw index) | Architecture Patterns | Low risk — confirmed by reading `fetchCpiYoy()` in fed.ts which computes YoY inline |

---

## Open Questions (RESOLVED)

1. **Add to AdminNav immediately or keep as hidden route?**
   - **RESOLVED:** Add to AdminNav under "Benchmarks" group as "Data Hub". The page is a verification tool that gains utility immediately. Plan 26-01 Task 1 adds the nav entry.

2. **`getRevenueByCharter()` referenced in D-06 but does not exist**
   - **RESOLVED:** Use existing `RevenueSnapshot.bank_service_charges` / `cu_service_charges` from `getRevenueTrend()`. No new DB query needed. Plan 26-02 Task 1 uses this approach.

3. **ROA data units: ratio or percentage?**
   - **RESOLVED:** ROA is stored as a ratio (e.g., 0.012 = 1.2%) per standard Call Report conventions. Phase 24's `health.ts` queries `AVG(roa)` directly from `institution_financials` without conversion. Display should multiply by 100 and format as percentage. Plan includes defensive check: if value > 1.0, treat as already-percentage.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| Node.js | Next.js build | Yes | v22.20.0 | — |
| Recharts `LineChart` | Revenue trend chart | Yes (recharts@3.7.0) | 3.7.0 | [VERIFIED: package.json] |
| Vitest | Unit tests | Yes (vitest@4.1.3) | 4.1.3 | — |

Note: 7 pre-existing test failures exist in the test suite (fees.test.ts winsorization and hamilton voice tests). These are NOT introduced by Phase 26 and should be documented as known failures, not fixed in this phase.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | No vitest.config.ts found — config embedded in package.json or uses vitest defaults with vite-tsconfig-paths |
| Quick run command | `npx vitest run src/app/admin/national` |
| Full suite command | `npx vitest run` |

Note: The vitest config is not at a standard path. The project runs `npx vitest run` from the package.json `scripts` section (no `test` script present — run directly). Vitest auto-discovers `*.test.ts` files.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | `/admin/national` page renders without error | smoke | manual (no test renderer configured) | No — Wave 0 gap |
| ADMIN-02 | Charter split derived from `RevenueSnapshot` bank/cu fields correctly | unit | `npx vitest run src/app/admin/national` | No — Wave 0 gap |
| ADMIN-03 | Freshness badge shows correct color tier (<7 days=green, 7-30=amber, >30=red) | unit | `npx vitest run src/app/admin/national` | No — Wave 0 gap |
| ADMIN-04 | Health metrics display ROA/ROE with correct unit handling | unit | `npx vitest run src/app/admin/national` | No — Wave 0 gap |

### Sampling Rate

- **Per task commit:** `npx vitest run src/app/admin/national`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (excluding pre-existing 7 failures) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/admin/national/national.test.ts` — pure function tests for `FreshnessBadge` logic, charter split computation, data reversal for charts
- [ ] No framework install needed — vitest already present

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | `requireAuth("view")` — already used on all admin pages |
| V3 Session Management | No | Handled by admin layout cookie check |
| V4 Access Control | Yes | Admin layout redirects non-admin to `/account` |
| V5 Input Validation | Yes (low risk) | `tab` URL param is validated against known strings; unknown values default to "overview" |
| V6 Cryptography | No | Read-only display page |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized data access | Elevation of Privilege | `requireAuth("view")` on page entry; admin layout role check |
| XSS via Beige Book text | Tampering | Beige Book `district_summary` text displayed as text content via JSX, not `dangerouslySetInnerHTML` |
| Tab param injection | Tampering | Validate tab value against known TABS array; default to "overview" |

---

## Sources

### Primary (HIGH confidence)
- `src/lib/crawler-db/call-reports.ts` — confirmed function signatures, `RevenueSnapshot` interface, bank/CU fields
- `src/lib/crawler-db/fed.ts` — confirmed `NationalEconomicSummary`, `RichIndicator`, `DistrictBeigeBookSummary` interfaces
- `src/lib/crawler-db/health.ts` — confirmed `GrowthTrend`, `IndustryHealthMetrics`, `HealthByCharter` interfaces
- `src/lib/crawler-db/derived.ts` — confirmed `RevenueConcentration`, `FeeDependencyRow` interfaces
- `src/app/admin/market/page.tsx` — server component + filter pattern to follow
- `src/app/admin/districts/page.tsx` — grid layout pattern for district data
- `src/components/sparkline.tsx` — confirmed `data: number[]` API
- `src/components/skeleton.tsx` — confirmed `SkeletonCards`, `SkeletonTable`, `SkeletonPage`
- `src/app/admin/admin-nav.tsx` — confirmed nav group structure for adding "National" entry
- `package.json` — confirmed Recharts 3.7.0 installed

### Secondary (MEDIUM confidence)
- `src/components/breakdown-chart.tsx` — Recharts BarChart pattern to adapt for LineChart

### Tertiary (LOW confidence — verify before using)
- LineChart API details: `type="monotone"`, `dot={false}` — [ASSUMED] standard Recharts API

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json; all query functions read from source
- Architecture: HIGH — follows existing admin page patterns exactly (market/, districts/)
- Pitfalls: HIGH — data-direction issue (newest-first) verified by reading query ORDER BY clauses; missing function verified by grep

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable stack; Recharts API changes slowly)
