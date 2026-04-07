# Phase 25: Derived Analytics & Hamilton Tools - Research

**Researched:** 2026-04-07
**Domain:** Cross-source analytics, Hamilton tool consolidation, Python ingestion extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New file `src/lib/crawler-db/derived.ts` for derived analytics
- **D-02:** `getRevenueConcentration(topN = 5)` — configurable N, returns top N fee categories by revenue share + cumulative %
- **D-03:** Extend FDIC/NCUA ingestion to capture overdraft-specific revenue (RIAD4070) as new `overdraft_revenue` column in `institution_financials`
- **D-04:** Fee dependency ratio returns aggregate ratios by charter + tier with distribution stats (median, P25/P75), broken down into overdraft revenue and other fee revenue
- **D-05:** Single `queryNationalData` tool with `section` param (`callReports | fred | beigeBook | health | derived | all`)
- **D-06:** Tool returns full RichIndicator objects with history + trend (acceptable token cost)
- **D-07:** Full consolidation — remove all legacy agent definitions, merge all tools into Hamilton as single universal agent
- **D-08:** Service charge income MUST be broken into: overdraft revenue (RIAD4070), other service charges, and total service charge income
- **D-09:** `* 1000` scaling at SQL level for monetary fields (carry-forward from Phase 23)
- **D-10:** One function per requirement pattern (carry-forward)
- **D-11:** RichIndicator shape for time-series data (carry-forward)
- **D-12:** Accuracy, consistency, value for Hamilton reports (carry-forward)

### Claude's Discretion

- Test file organization (derived.test.ts or combined)
- Exact FDIC field name for overdraft revenue (likely RIAD4070 or similar) — **CRITICAL: needs verification at implementation time (see Assumptions Log)**
- How to handle legacy agent file cleanup (rename, delete, or deprecate)
- Tool Zod schema design details

### Deferred Ideas (OUT OF SCOPE)

- Agent consolidation details (exact legacy agent removal list, skill migration) — may need its own sub-phase if complex
- BLS data integration, additional FRED series, national surveys — Phase 27 (External Intelligence)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DERIVE-01 | Revenue concentration analysis (% of total SC income from top N categories) | SQL window function + ranked aggregation over extracted_fees JOIN institution_financials |
| DERIVE-02 | Fee dependency ratio (SC income / total revenue) by charter, tier — with overdraft granularity | Extend institution_financials with overdraft_revenue column; SQL GROUP BY charter/tier |
| DERIVE-03 | Revenue per institution averages by asset tier and charter | SQL AVG(service_charge_income) GROUP BY asset_size_tier, charter_type with `* 1000` scaling |
| ADMIN-05 | Hamilton can access all summary data via existing tool/query layer | New `queryNationalData` tool added to `buildHamiltonTools()` in hamilton-agent.ts |
</phase_requirements>

---

## Summary

Phase 25 has four deliverables: (1) new `derived.ts` query file with three analytics functions, (2) an `overdraft_revenue` column added to `institution_financials` via migration + ingestion extension, (3) a `queryNationalData` tool wired into Hamilton, and (4) Hamilton agent consolidation replacing the legacy multi-agent setup in `agents.ts`.

The architecture is well-established by Phases 23-24. The `RichIndicator` / `deriveTrend()` pattern from `fed.ts`, the `* 1000` scaling from `call-reports.ts`, and the `tool()` pattern from `ai` SDK are all proven in production code. Phase 25 primarily extends these patterns into new domains — it introduces no new architectural primitives.

The most significant research finding is that **RIAD4070 is not exposed by the FDIC BankFind API as a named field** — it does not appear in the API response even when explicitly requested. The `raw_json` column in `institution_financials` stores FDIC response payloads, but RIAD4070 is a raw FFIEC Call Report mnemonic, not an API surface field. The planner must treat the overdraft field name as LOW confidence and include a verification/fallback step. The NCUA equivalence is similarly unverified.

**Primary recommendation:** Implement derived.ts and queryNationalData first (highest value, no blockers). Treat the overdraft_revenue column as a best-effort extension — use `raw_json` parsing as a fallback if the API field name cannot be confirmed.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` (Vercel AI SDK) | 6.0.116 | `tool()` definition, `streamText` | Already powering all Hamilton tools [VERIFIED: package.json] |
| `zod` | 4.3.6 | Tool inputSchema validation | Already used across tools.ts / tools-internal.ts [VERIFIED: package.json] |
| `postgres` client | 3.4.8 | SQL via `getSql()` / `sql` tag | Established DB layer pattern [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@anthropic-ai/sdk` | 0.80.0 | Hamilton model calls | Underlying model provider |
| `bcryptjs` | 3.0.3 | Auth layer (unchanged) | No new auth needed this phase |

**Installation:** No new packages required for this phase. All dependencies are present. [VERIFIED: package.json]

---

## Architecture Patterns

### Established File Structure (extend, don't diverge)
```
src/lib/crawler-db/
├── derived.ts          # NEW — Phase 25: revenue concentration, fee dependency, revenue-per-inst
├── call-reports.ts     # Phase 23 pattern: getRevenueTrend, * 1000 scaling, priorYearQuarter()
├── health.ts           # Phase 24 pattern: RichIndicator, fetchIndustryMetric(), HealthByCharter
├── fed.ts              # RichIndicator interface, deriveTrend(), getNationalEconomicSummary()
├── fee-revenue.ts      # Fee-to-revenue join pattern (related domain, reference for joins)
└── financial.ts        # InstitutionFinancial interface — add overdraft_revenue field

src/lib/hamilton/
└── hamilton-agent.ts   # buildHamiltonTools() — add queryNationalData, remove legacy imports

src/lib/research/
├── agents.ts           # DEPRECATE/CONSOLIDATE — legacy multi-agent setup targeted by D-07
├── tools.ts            # publicTools — unchanged
└── tools-internal.ts   # internalTools — unchanged, merged into Hamilton

fee_crawler/commands/
└── ingest_fdic.py      # EXTEND — add RIAD4070 (or equivalent) to FDIC_FINANCIAL_FIELDS
```

### Pattern 1: DB Query Function (derived.ts)
**What:** Async function using `getSql()` with try/catch, returns typed interface, uses `sql.unsafe()` for parameterized queries, applies `* 1000` scaling for monetary fields.
**When to use:** All three DERIVE requirements.
```typescript
// Source: src/lib/crawler-db/health.ts (proven pattern)
import { getSql } from "./connection";
import { type RichIndicator, deriveTrend } from "./fed";

export interface RevenueConcentration {
  fee_category: string;
  total_service_charges: number;
  share_pct: number;
  cumulative_pct: number;
  institution_count: number;
}

export async function getRevenueConcentration(topN = 5): Promise<RevenueConcentration[]> {
  const sql = getSql();
  try {
    const rows = await sql.unsafe(
      `WITH category_totals AS (
         SELECT ef.fee_category,
                SUM(ifin.service_charge_income * 1000) AS total_sc,
                COUNT(DISTINCT ifin.crawl_target_id)   AS inst_count
         FROM extracted_fees ef
         JOIN institution_financials ifin ON ifin.crawl_target_id = ef.crawl_target_id
         WHERE ef.fee_category IS NOT NULL
           AND ef.review_status != 'rejected'
           AND ifin.service_charge_income IS NOT NULL
           AND ifin.report_date = (SELECT MAX(r2.report_date) FROM institution_financials r2 WHERE r2.crawl_target_id = ifin.crawl_target_id)
         GROUP BY ef.fee_category
       ),
       national_total AS (SELECT SUM(total_sc) AS grand_total FROM category_totals)
       SELECT ct.fee_category,
              ct.total_sc          AS total_service_charges,
              ROUND(ct.total_sc * 100.0 / nt.grand_total, 2) AS share_pct,
              ct.inst_count        AS institution_count
       FROM category_totals ct, national_total nt
       ORDER BY ct.total_sc DESC
       LIMIT $1`,
      [topN]
    ) as { fee_category: string; total_service_charges: string; share_pct: string; institution_count: string }[];
    // ... add cumulative_pct via reduce, convert types, return
  } catch (err) {
    console.error('[derived] getRevenueConcentration failed:', err);
    return [];
  }
}
```

### Pattern 2: Hamilton Tool (queryNationalData)
**What:** Single tool with `section` enum parameter. Calls Phase 23-24 functions and returns structured object per section. Added to `buildHamiltonTools()` return value.
**When to use:** ADMIN-05 — the only new tool in Hamilton's registry.
```typescript
// Source: src/lib/research/tools-internal.ts + src/lib/hamilton/hamilton-agent.ts patterns
import { tool } from "ai";
import { z } from "zod";
import { getRevenueTrend } from "@/lib/crawler-db/call-reports";
import { getNationalEconomicSummary, getNationalBeigeBookSummary } from "@/lib/crawler-db/fed";
import { getIndustryHealthMetrics } from "@/lib/crawler-db/health";
import { getRevenueConcentration, getFeeDependencyRatio, getRevenuePerInstitution } from "@/lib/crawler-db/derived";

export const queryNationalData = tool({
  description: "Get national summary data for Hamilton analysis. Use section='all' for full picture or target a specific section.",
  inputSchema: z.object({
    section: z.enum(["callReports", "fred", "beigeBook", "health", "derived", "all"])
      .default("all")
      .describe("Which data section to return"),
  }),
  execute: async ({ section }) => {
    const result: Record<string, unknown> = {};
    const fetch = async (key: string, fn: () => Promise<unknown>) => {
      if (section === "all" || section === key) {
        try { result[key] = await fn(); } catch { result[key] = null; }
      }
    };
    await Promise.all([
      fetch("callReports", () => getRevenueTrend(8)),
      fetch("fred", getNationalEconomicSummary),
      fetch("beigeBook", getNationalBeigeBookSummary),
      fetch("health", getIndustryHealthMetrics),
      fetch("derived", async () => ({
        concentration: await getRevenueConcentration(5),
        dependency: await getFeeDependencyRatio(),
        perInstitution: await getRevenuePerInstitution(),
      })),
    ]);
    return result;
  },
});
```

### Pattern 3: Hamilton Consolidation (agents.ts → hamilton-agent.ts)
**What:** The four legacy agents (`ask`, `fee-analyst`, `content-writer`, `custom-query`) in `agents.ts` are replaced by Hamilton as the single universal agent. `buildHamiltonTools()` already imports `publicTools` + `internalTools` — adding `queryNationalData` completes the tool surface.
**What stays:** `src/app/api/hamilton/chat/route.ts` is the current Hamilton endpoint — it calls `buildHamiltonTools()` directly and is unaffected.
**What changes:** `src/app/api/research/[agentId]/route.ts` either routes to Hamilton or the legacy agents are deprecated.

### Anti-Patterns to Avoid
- **Calling `sql` tag literal for parameterized input:** The `sql` template tag does NOT support positional `$1` params — use `sql.unsafe(query, [params])` for any query with variable inputs. [VERIFIED: call-reports.ts, health.ts patterns]
- **Forgetting `* 1000` scaling:** All monetary fields in `institution_financials` are stored in thousands (FDIC convention). Apply at SQL level, not TypeScript. [VERIFIED: ingest_fdic.py line 147-148]
- **Using raw `fee_income_ratio` for dependency ratio:** `fee_income_ratio` in `institution_financials` is the pre-computed stored value from ingestion. For D-04 distribution stats (median, P25/P75), recompute from aggregated data rather than averaging stored ratios.
- **Adding overdraft_revenue to ON CONFLICT DO UPDATE without adding it to the INSERT list first:** Both the INSERT column list and the DO UPDATE SET must include the new column.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Trend classification | Custom slope calculator | `deriveTrend()` from `fed.ts` | Already exported, used by health.ts |
| YoY quarter comparison | Date arithmetic | `priorYearQuarter()` from `call-reports.ts` | Already exported, tested |
| Tool schema validation | Manual type guards | Zod `.object()` via `inputSchema` | Pattern established across all tools |
| Tool registration | Inline lambda in route | `tool()` from `ai` SDK | Provides type inference, streaming integration |
| Percentile computation | JavaScript sort + index | SQL `PERCENTILE_CONT` or app-level sorted array pattern | health.ts uses sorted array approach — consistent |

---

## FDIC Overdraft Revenue Field — Critical Finding

**Decision D-03 requires adding `overdraft_revenue` from RIAD4070. The FDIC BankFind API does NOT expose RIAD4070 as a named field.**

Evidence: Direct API call `https://api.fdic.gov/banks/financials?fields=CERT,SC,RIAD4070` returns only `SC` and `CERT` — RIAD4070 is silently dropped. This was verified via WebFetch on 2026-04-07. [VERIFIED: direct API test]

**What IS available:**
- `SC` = RIAD4080 (total service charges on deposit accounts) — already ingested as `service_charge_income`
- `raw_json` column in `institution_financials` stores the full FDIC API response per institution

**Practical options for the planner:**

| Option | Approach | Confidence | Notes |
|--------|----------|------------|-------|
| A | Query `raw_json->>'RIAD4070'` or similar from stored payloads | LOW — field not in API response | Only works if the API silently maps it under a different key |
| B | Use FFIEC CDR bulk download (separate data source) | MEDIUM | Has overdraft line item; requires new ingestion path not in current stack |
| C | Derive overdraft proxy: `sc_income * estimated_od_share` from published FDIC studies | LOW | Estimate only, not reportable as Call Report data |
| D | Store NULL for now, document as planned | HIGH reliability | Satisfies D-03 schema intent without incorrect data; Hamilton can note "granularity pending" |

**Recommended approach for planner:** Add the `overdraft_revenue BIGINT` column to `institution_financials` via migration. In `ingest_fdic.py`, attempt to extract it from `raw_json` (field could exist under a different name in the stored payload). If absent, insert NULL. This preserves D-03's schema decision without blocking the rest of Phase 25. Flag as needing human verification.

---

## Common Pitfalls

### Pitfall 1: queryNationalData Token Size
**What goes wrong:** `section='all'` with full RichIndicator history arrays returns ~8 quarters of data per metric. With 4 metrics in FRED + 3 in health + trend history, the tool response can be 2-4KB of JSON.
**Why it happens:** D-06 explicitly allows full RichIndicator objects for report quality.
**How to avoid:** Accept the token cost per D-06. Hamilton's `maxOutputTokens` is 3000 and `maxSteps` is 10 — a single tool call consuming 1-2K tokens is fine.
**Warning signs:** If Hamilton's responses become truncated, reduce history depth to 4 quarters.

### Pitfall 2: Legacy Agent Route Conflict
**What goes wrong:** Consolidating to Hamilton in `agents.ts` while `/api/research/[agentId]/route.ts` still resolves agents by ID causes 404 or stale agent responses.
**Why it happens:** The route reads `getAgent(agentId)` — if agents.ts is cleared, all legacy agent IDs return undefined.
**How to avoid:** Either keep legacy agent stubs that delegate to Hamilton, or redirect legacy routes to Hamilton endpoint. Do not delete agents.ts functions until all callers are confirmed updated.
**Warning signs:** 404 errors on `/api/research/fee-analyst`, `/api/research/content-writer`.

### Pitfall 3: Cumulative Percentage Off-By-One
**What goes wrong:** Revenue concentration's `cumulative_pct` is computed in TypeScript as a running sum — if the SQL returns more than `topN` rows (due to ties), the cumulative overshoots 100%.
**Why it happens:** SQL `ORDER BY total_sc DESC LIMIT $1` can return fewer rows if NULLs are present.
**How to avoid:** Filter `WHERE total_sc IS NOT NULL` before LIMIT. Compute cumulative in TypeScript as `reduce` after SQL returns.

### Pitfall 4: Double-Scaling service_charge_income in Joins
**What goes wrong:** `fee-revenue.ts` does NOT apply `* 1000` in its queries — it uses raw `service_charge_income`. `call-reports.ts` queries DO apply `* 1000`. If `derived.ts` joins both and mixes scaling conventions, aggregates are wrong by 1000x.
**Why it happens:** `fee-revenue.ts` was written before the scaling convention was locked in Phase 23.
**How to avoid:** In `derived.ts`, always apply `* 1000` explicitly in the SQL for any monetary field. Do not rely on `fee-revenue.ts` sub-queries for the source value.

### Pitfall 5: Hamilton Tool Loop Exhaustion
**What goes wrong:** `queryNationalData` with `section='all'` followed by multiple `searchFees` and `queryFeeRevenueCorrelation` calls can hit `stepCountIs(10)` for complex reports.
**Why it happens:** Hamilton chat route caps at 10 steps (T-17-03). A single `queryNationalData(all)` counts as one step.
**How to avoid:** No change needed — one `queryNationalData(all)` replaces what would otherwise be 5+ separate tool calls. Net step count should decrease, not increase.

---

## Code Examples

### Verified Pattern: RichIndicator return with deriveTrend
```typescript
// Source: src/lib/crawler-db/health.ts fetchIndustryMetric()
const current = Number(rows[0].value);
const asOf = rows[0].quarter;
const history = rows.slice(1).reverse().map((r) => ({ date: r.quarter, value: Number(r.value) }));
const trend = deriveTrend(current, history);
return { current, history, trend, asOf };
```

### Verified Pattern: sql.unsafe() with positional params
```typescript
// Source: src/lib/crawler-db/health.ts fetchIndustryMetric()
const rows = await sql.unsafe(
  `SELECT ... FROM institution_financials WHERE ${field} IS NOT NULL LIMIT $1`,
  [quarterCount]
) as { quarter: string; value: string | number }[];
```

### Verified Pattern: tool() definition with enum inputSchema
```typescript
// Source: src/lib/research/tools-internal.ts queryFeeRevenueCorrelation
export const queryFeeRevenueCorrelation = tool({
  description: "...",
  inputSchema: z.object({
    view: z.enum(["institutions", "by_tier", "by_charter"]).optional().default("by_tier"),
  }),
  execute: async ({ view }) => { ... },
});
```

### Verified Pattern: internalTools bundle export
```typescript
// Source: src/lib/research/tools-internal.ts (lines 397-409)
export const internalTools = {
  queryDistrictData,
  // ... all tools listed
};
```

### Verified Pattern: buildHamiltonTools() return
```typescript
// Source: src/lib/hamilton/hamilton-agent.ts buildHamiltonTools()
return {
  ...publicTools,
  ...internalTools,
  triggerReport,
  // ADD: queryNationalData
};
```

### Verified Pattern: FDIC ingestion upsert (ingest_fdic.py)
```python
# Source: fee_crawler/commands/ingest_fdic.py lines 163-196
db.execute(
    """INSERT INTO institution_financials
       (crawl_target_id, report_date, source, ..., overdraft_revenue)
       VALUES (?, ?, 'fdic', ..., ?)
       ON CONFLICT(crawl_target_id, report_date, source) DO UPDATE SET
        ...,
        overdraft_revenue = excluded.overdraft_revenue""",
    (..., od_value)
)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multi-agent (ask, fee-analyst, content-writer, custom-query) | Single Hamilton agent with all tools | Phase 25 (D-07) | Simpler route, unified system prompt, no dead ends |
| No national data tool | `queryNationalData(section)` | Phase 25 | Hamilton can make trend-aware claims in one tool call |
| service_charge_income as monolith | Broken into overdraft + other | Phase 25 (D-08) | Enables "63% of SC income is overdraft" type claims |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RIAD4070 is the correct FDIC Call Report mnemonic for overdraft-specific service charge income | FDIC Critical Finding | Column added but always NULL; planner must include fallback path |
| A2 | `raw_json` stored in `institution_financials` contains the full FDIC API response including any overdraft sub-field | FDIC Critical Finding | No path to overdraft granularity from existing data; NCUA alternative needed |
| A3 | NCUA equivalent of overdraft revenue is mappable from NCUA 5300 report fields | FDIC Critical Finding | Credit union overdraft data absent from derived analytics |
| A4 | Legacy `/api/research/[agentId]` routes are only used by admin UI and not by external clients or Stripe webhooks | Architecture Patterns (consolidation) | Breaking legacy routes harms production functionality |

---

## Open Questions (RESOLVED)

1. **What is the actual overdraft revenue field in the FDIC BankFind API response?**
   - **RESOLVED:** RIAD4070 is NOT exposed by FDIC BankFind API. Plan adds `overdraft_revenue` column to schema (NULL initially). Implementation inspects `raw_json` at runtime -- if an overdraft sub-field exists, use it; otherwise column stays NULL until FFIEC CDR bulk download path is established.

2. **Are there active external callers of `/api/research/[agentId]`?**
   - **RESOLVED:** Plan 25-02 Task 2 searches for legacy agent ID strings before removal. All legacy IDs (`ask`, `fee-analyst`, `content-writer`, `custom-query`) route to Hamilton instead of being deleted, preserving backward compatibility.

3. **Where does `queryNationalData` live -- tools-internal.ts or hamilton-agent.ts?**
   - **RESOLVED:** Per D-07 (full Hamilton consolidation), placed in `hamilton-agent.ts` alongside `triggerReport`. Hamilton-exclusive, keeps the tool set clean.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL / Supabase | derived.ts queries | Assumed available (Phases 23-24 work) | — | — |
| FDIC BankFind API | overdraft_revenue ingestion | Available (already used) | — | NULL column if field absent |
| Node.js | TypeScript compilation | Available | 20+ | — |
| Python 3.12 | ingest_fdic.py extension | Available | 3.12 | — |

**Missing dependencies with no fallback:** None blocking Phase 25 core work.

**Missing dependencies with fallback:** RIAD4070 overdraft field — fallback is NULL column with schema ready.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest — NOT YET INSTALLED (see Wave 0 Gaps) |
| Config file | No vitest.config.ts found in project root |
| Quick run command | `npx vitest run src/lib/crawler-db/derived.test.ts` |
| Full suite command | `npx vitest run src/lib/crawler-db/` |

Note: Existing test files (`call-reports.test.ts`, `health.test.ts`, `fed.test.ts`) import from `vitest` but `vitest` is not in `package.json` or `node_modules`. [VERIFIED: package.json devDependencies, node_modules/.bin/vitest absent] This is a pre-existing gap — Wave 0 must install vitest before any test can run.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DERIVE-01 | `getRevenueConcentration(5)` returns top 5 categories with share_pct summing to ≤ 100% and cumulative_pct increasing | unit | `npx vitest run src/lib/crawler-db/derived.test.ts` | ❌ Wave 0 |
| DERIVE-02 | `getFeeDependencyRatio()` returns rows with median, p25, p75 per charter+tier; overdraft_revenue and other_sc_income sum to service_charge_income | unit | `npx vitest run src/lib/crawler-db/derived.test.ts` | ❌ Wave 0 |
| DERIVE-03 | `getRevenuePerInstitution()` returns rows keyed by asset_size_tier and charter_type with avg_sc_income in dollar amounts (not thousands) | unit | `npx vitest run src/lib/crawler-db/derived.test.ts` | ❌ Wave 0 |
| ADMIN-05 | `queryNationalData({ section: 'all' })` returns non-null data for at least callReports, fred, and health keys | unit | `npx vitest run src/lib/hamilton/hamilton-agent.test.ts` | ❌ Wave 0 |
| ADMIN-05 | `queryNationalData({ section: 'derived' })` returns concentration, dependency, perInstitution sub-keys | unit | `npx vitest run src/lib/hamilton/hamilton-agent.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/crawler-db/derived.test.ts`
- **Per wave merge:** `npx vitest run src/lib/crawler-db/`
- **Phase gate:** All derived.test.ts and hamilton-agent.test.ts tests green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/crawler-db/derived.test.ts` — covers DERIVE-01, DERIVE-02, DERIVE-03
- [ ] `src/lib/hamilton/hamilton-agent.test.ts` — covers ADMIN-05 (queryNationalData sections)
- [ ] Install vitest: `npm install --save-dev vitest vite-tsconfig-paths` — required before any test can run (existing test files already import from vitest but binary absent)
- [ ] Verify vitest.config.ts exists or create with `vite-tsconfig-paths` for `@/` alias resolution (existing test files reference the alias)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Hamilton chat auth unchanged (analyst/admin role check) |
| V3 Session Management | No | No new session handling |
| V4 Access Control | Yes | `queryNationalData` added to Hamilton tools — Hamilton requires analyst/admin (T-17-02 enforced in route.ts) |
| V5 Input Validation | Yes | `section` enum validated by Zod — no free-text SQL injection surface |
| V6 Cryptography | No | No new crypto |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via tool inputs | Tampering | Zod enum validation for `section`; `sql.unsafe(query, [params])` parameterized for all SQL |
| Token exhaustion via `queryNationalData(all)` | Denial of Service | `stepCountIs(10)` cap in route.ts; daily cost circuit breaker at $50 |
| Legacy agent impersonation via agent ID | Elevation of Privilege | D-07 consolidation removes legacy IDs; route returns 404 for unknown agentId |

---

## Sources

### Primary (HIGH confidence)
- `src/lib/crawler-db/call-reports.ts` — Revenue query patterns, `* 1000` scaling, `priorYearQuarter()`, test file confirming function signatures
- `src/lib/crawler-db/health.ts` — `fetchIndustryMetric()` pattern, `RichIndicator` + `deriveTrend()` usage
- `src/lib/crawler-db/fed.ts` — `RichIndicator` interface, `deriveTrend()` source, `getNationalEconomicSummary()`
- `src/lib/research/tools-internal.ts` — `tool()` pattern, `internalTools` export bundle
- `src/lib/hamilton/hamilton-agent.ts` — `buildHamiltonTools()`, consolidation target
- `src/app/api/hamilton/chat/route.ts` — Hamilton route, tool wiring, auth pattern
- `fee_crawler/commands/ingest_fdic.py` — FDIC ingestion pattern, SC field mapping, upsert structure
- `scripts/migrate-schema.sql` — `institution_financials` table definition (no overdraft_revenue column today)
- `package.json` — confirms vitest NOT installed; confirms dependency versions

### Secondary (MEDIUM confidence)
- FDIC BankFind API direct test `https://api.fdic.gov/banks/financials?fields=CERT,SC,RIAD4070` — confirms RIAD4070 not returned by API [VERIFIED via WebFetch 2026-04-07]

### Tertiary (LOW confidence)
- RIAD4070 as the canonical FFIEC mnemonic for overdraft income — standard Call Report nomenclature per training data, not verified against current FFIEC instructions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from direct code inspection
- Architecture patterns: HIGH — derived from working Phase 23-24 code
- FDIC overdraft field: LOW — API verification shows field absent; raw_json path unconfirmed
- Pitfalls: HIGH — derived from code patterns in existing files
- Hamilton consolidation: HIGH — agents.ts and hamilton-agent.ts both read and analyzed

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable API patterns; FDIC API field availability may change)
