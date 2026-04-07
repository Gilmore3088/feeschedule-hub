# Phase 23: Call Report & FRED Foundation - Research

**Researched:** 2026-04-07
**Domain:** PostgreSQL query layer — Call Report revenue scaling, FRED economic indicators, TypeScript DB functions
**Confidence:** HIGH (all findings verified against actual codebase files)

## Summary

Phase 23 is a data-correctness phase: fix revenue queries to multiply stored-thousands values by 1000, add new segmentation functions, and expand the FRED summary to include rich history objects. No new data ingestion infrastructure is needed for Call Reports — the 38,949 rows are already loaded. FRED requires one surgical addition: UMCSENT (consumer sentiment) is absent from both the national series list and the DB, so it must be added to `config.py`, ingested via `ingest-fred`, and then surfaced in queries.

The existing code already has partial implementations for nearly every requirement. The dominant work pattern is: identify the missing `* 1000` multiplier in SQL, add new exported functions following the established `getSql()` + typed interface pattern, and extend the test file with reconciliation assertions.

**Primary recommendation:** Apply `* 1000` in SQL SELECTs on `service_charge_income`, `total_assets`, `total_deposits`, `total_loans`, and `other_noninterest_income`. Add UMCSENT to config and ingest. Write all new functions in `call-reports.ts` (or split if > 300 lines) and extend `fed.ts` with rich indicator objects.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Apply `* 1000` multiplier directly in each SQL query (`SUM(service_charge_income * 1000)`). No wrapper functions, no DB views. Explicit and grep-able.

**D-02:** For other financial fields (total_assets, total_deposits, total_loans), Claude checks actual data during research and applies scaling wherever the thousands convention applies.

**D-03:** One function per requirement: `getRevenueTrend()`, `getRevenueByCharter()`, `getRevenueByTier()`, `getTopInstitutions()`, `getFeeIncomeRatio()`, etc. Matches existing codebase pattern in `crawler-db/`.

**D-04:** Guiding principle for file organization and all implementation choices: accuracy, consistency, and value for Hamilton reports. Whatever produces the most accurate report and the most consistent data layer wins.

**D-05:** FRED summary queries extend existing `src/lib/crawler-db/fed.ts` (currently ~257 lines, contains Beige Book + FRED functions). All Fed/economic data in one file.

**D-06:** National economic summary returns rich objects with current value + last 4 values + trend direction. Shape per indicator: `{ current: number, history: { date: string, value: number }[], trend: 'rising' | 'falling' | 'stable', asOf: string }`. Hamilton gets full context for analysis.

**D-07:** CPI YoY computation approach (SQL window function vs TypeScript) is Claude's discretion — pick whichever produces the most accurate, verifiable result.

**D-08:** Reconciliation tests that verify mathematical consistency: sum of charter splits = national total, sum of tier segments = national total, scaled values match expected magnitudes.

### Claude's Discretion

- **D-02:** Which financial fields beyond service_charge_income need the thousands scaling fix
- **D-04:** File organization (keep in call-reports.ts vs split) based on final line count and cohesion
- **D-07:** CPI YoY computation approach (SQL vs TypeScript)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALL-01 | Revenue queries return correct dollar amounts (fix thousands scaling) | All `institution_financials` monetary fields stored in thousands — verified in `ingest_fdic.py` L144-148 and `ingest_ncua.py` L192-202 |
| CALL-02 | YoY revenue trend available for last 8 quarters with growth rate | `getRevenueTrend()` already exists but uses raw thousands; fix multiplier + the YoY logic is sound |
| CALL-03 | Bank vs credit union revenue split queryable | `getRevenueTrend()` already splits by charter; needs new `getRevenueByCharter()` per D-03 |
| CALL-04 | Top institutions by service charge income queryable with name, assets, charter | `getTopRevenueInstitutions()` exists; needs `* 1000` on `service_charge_income` and `total_assets` |
| CALL-05 | Fee income ratio (service charges / total revenue) computed per institution | `fee_income_ratio` already stored in DB at ingestion; but value is computed from thousands/thousands so ratio is dimensionless and correct — query can return it directly. New `getFeeIncomeRatio()` function needed |
| CALL-06 | Revenue segmented by asset tier (community, mid-size, regional, large, mega) | New `getRevenueByTier()` function; `crawl_targets.asset_size_tier` JOIN available |
| FRED-01 | CPI YoY change computed correctly (not raw index) | Already implemented in `getFredSummary()` via 13-row TypeScript approach; working |
| FRED-02 | Consumer sentiment (UMCSENT) available — ingest if missing | UMCSENT is NOT in `NATIONAL_SERIES` list or `config.py` series list — must add and ingest |
| FRED-03 | National economic summary (fed funds, unemployment, CPI YoY, sentiment) | `getFredSummary()` exists but returns flat struct; D-06 requires rich history objects — new `getNationalEconomicSummary()` |
| FRED-04 | District-level economic indicators queryable (per-district unemployment) | `getDistrictIndicators()` exists in `fed.ts`; district unemployment series already in DB (MAUR-CAUR) |
</phase_requirements>

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `postgres` | 3.4.8 | PostgreSQL client (tagged template + `.unsafe()`) | Project standard [VERIFIED: CLAUDE.md] |
| TypeScript | 5 | Type-safe query interfaces | Project standard [VERIFIED: CLAUDE.md] |
| vitest | 4.1.3 | Test runner | Project standard, confirmed running [VERIFIED: test run] |

No new dependencies needed for this phase. All work is in existing files with the existing DB client.

## Architecture Patterns

### Established Pattern: Template Literal SQL + Typed Interface

Every function in `crawler-db/` follows this exact pattern. Do not deviate. [VERIFIED: `call-reports.ts`, `fed.ts`, `fee-revenue.ts`]

```typescript
// Source: src/lib/crawler-db/call-reports.ts (existing pattern)
export interface RevenueByCharter {
  charter_type: string;
  total_service_charges: number;  // in dollars (not thousands)
  institution_count: number;
  quarter: string;
}

export async function getRevenueByCharter(quarter?: string): Promise<RevenueByCharter[]> {
  const sql = getSql();
  try {
    const rows = await sql.unsafe(
      `SELECT
         COALESCE(ct.charter_type, 'unknown') AS charter_type,
         SUM(inf.service_charge_income * 1000)  AS total_service_charges,
         COUNT(DISTINCT ct.cert_number)          AS institution_count,
         TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-"Q"Q') AS quarter
       FROM institution_financials inf
       JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
       WHERE inf.service_charge_income > 0
         ${quarter ? "AND TO_CHAR(DATE_TRUNC('quarter', inf.report_date::date), 'YYYY-\"Q\"Q') = $1" : "AND inf.report_date = (SELECT MAX(report_date) FROM institution_financials WHERE service_charge_income > 0)"}
       GROUP BY ct.charter_type, DATE_TRUNC('quarter', inf.report_date::date)
       ORDER BY total_service_charges DESC`,
      quarter ? [quarter] : []
    ) as { charter_type: string; total_service_charges: string; institution_count: string; quarter: string }[];

    return rows.map(row => ({
      charter_type: row.charter_type,
      total_service_charges: Number(row.total_service_charges),
      institution_count: Number(row.institution_count),
      quarter: row.quarter,
    }));
  } catch (e) {
    console.warn('[getRevenueByCharter]', e);
    return [];
  }
}
```

### Pattern: Rich FRED Indicator Object (D-06 shape)

```typescript
// New interface for D-06
export interface RichIndicator {
  current: number;
  history: { date: string; value: number }[];  // last 4 values, ascending date
  trend: 'rising' | 'falling' | 'stable';
  asOf: string;
}

// Trend derivation: compare current to history[0] (oldest in window)
function deriveTrend(current: number, history: { value: number }[]): 'rising' | 'falling' | 'stable' {
  if (history.length < 2) return 'stable';
  const oldest = history[0].value;
  const diffPct = ((current - oldest) / oldest) * 100;
  if (diffPct > 0.5) return 'rising';
  if (diffPct < -0.5) return 'falling';
  return 'stable';
}
```

### Pattern: getSql() vs sql

Two import styles exist in the codebase. [VERIFIED: connection.ts, call-reports.ts, fed.ts]

- `call-reports.ts` uses `getSql()` (lazy init, required for `.unsafe()` with params)
- `fed.ts` uses `sql` (eager init singleton, fine for tagged templates)
- Rule: use `getSql()` when calling `.unsafe()` with `$1/$2` params; use `sql` for tagged templates

### File Organization Decision (D-04)

`call-reports.ts` is currently 144 lines. Adding 4 new functions (CALL-03, CALL-05, CALL-06, plus new interfaces) will bring it to approximately 280-320 lines. Decision point:

- Under 300 lines: keep everything in `call-reports.ts`
- Over 300 lines: split into `call-reports.ts` (trend + top institutions) and `call-reports-segmented.ts` (charter, tier, fee-income-ratio)

The global coding style rule is "keep files under 300 lines; split if larger". [VERIFIED: CLAUDE.md coding-style.md]

### Anti-Patterns to Avoid

- **DB views for scaling:** D-01 explicitly prohibits this. `* 1000` in each SQL SELECT.
- **Wrapper functions to apply scaling:** Same prohibition. The multiplier lives in SQL.
- **Using `sql` tagged template with dynamic params:** Cannot pass variables into tagged templates safely with arrays. Use `sql.unsafe()` for queries with `$1` params.
- **Closing the read connection:** `getSql()` returns a singleton. Never call `.end()` on it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CPI YoY | SQL LAG window function | TypeScript: fetch 13 rows, compare index 0 vs 12 | Already implemented in `getFredSummary()`; TypeScript approach is simpler and already tested |
| Trend direction | Complex statistical model | Simple: compare current to oldest in 4-value window | Hamilton wants directional signal, not regression |
| UMCSENT ingestion | New Python script | Add `"UMCSENT"` to `NATIONAL_SERIES` in `ingest_fred.py` and run `python -m fee_crawler ingest-fred` | Ingestion infrastructure already exists |
| Percentile computation | SQL PERCENTILE_CONT | TypeScript sort + index math | Pattern already used in `financial.ts getRevenueIndexByDate()` |

**Key insight:** All infrastructure exists. This phase is about correctly applying the `* 1000` multiplier in SQL, adding 4-5 new functions, and wiring UMCSENT into the FRED list.

## Scaling Fix: Verified Scope

This is the core correctness fix for CALL-01. Every field in `institution_financials` that represents a dollar amount is stored in thousands. [VERIFIED: `ingest_fdic.py` L18, L144-148; `ingest_ncua.py` L192-202]

| Field | Stored As | Fix Needed In SQL | Notes |
|-------|-----------|-------------------|-------|
| `service_charge_income` | thousands | `service_charge_income * 1000` | FDIC: raw whole dollars ÷ 1000 at ingest. NCUA: whole dollars ÷ 1000 at ingest |
| `total_assets` | thousands | `total_assets * 1000` | FDIC API returns thousands; NCUA whole dollars ÷ 1000 at ingest |
| `total_deposits` | thousands | `total_deposits * 1000` | Same convention |
| `total_loans` | thousands | `total_loans * 1000` | Same convention |
| `other_noninterest_income` | thousands | `other_noninterest_income * 1000` | Same convention |
| `total_revenue` | thousands | `total_revenue * 1000` | Derived at ingest from thousands inputs |
| `fee_income_ratio` | dimensionless ratio | NO scaling | Computed as `sc / total_revenue` where both are in thousands — ratio is correct as stored |
| `net_interest_margin` | percentage | NO scaling | REAL column, not a dollar amount |
| `efficiency_ratio` | ratio | NO scaling | REAL column |
| `roa` | percentage | NO scaling | REAL column |
| `roe` | percentage | NO scaling | REAL column |

**Critical detail on `fee_income_ratio`:** The ingestion code computes `fee_income_ratio = sc_thousands / total_revenue_thousands`. Since both operands are in thousands, the thousands cancel and the ratio is dimensionless — **no scaling needed in queries**. The ratio IS wrong if `total_revenue` was incorrectly computed, but that is an ingestion concern outside this phase's scope.

**Critical detail on `getRevenueIndexByDate()`:** This function in `financial.ts` returns `avg_service_charge` which is `AVG(service_charge_income)` without scaling. It also needs `* 1000` if it's used for dollar-amount display. However, this function is not in phase scope — flag it as a known issue for Phase 24.

## UMCSENT: Missing Series — Required Action

UMCSENT (University of Michigan Consumer Sentiment) is queried in `getFredSummary()` but is NOT in the ingestion series list. [VERIFIED: `ingest_fred.py` NATIONAL_SERIES list L19-28; `config.py` FREDConfig.series L61-70]

**FRED-02 requires:** Add UMCSENT to `NATIONAL_SERIES` in `ingest_fred.py` AND to `FREDConfig.series` in `config.py`, then run `python -m fee_crawler ingest-fred --series UMCSENT`.

UMCSENT is a monthly series (released last Tuesday of each month by University of Michigan via FRED). Available via standard FRED API at no additional cost. [ASSUMED — FRED series existence confirmed by existing code query for it, but actual availability not verified against live FRED API in this session]

## getFredSummary() vs New getNationalEconomicSummary()

The existing `getFredSummary()` returns a flat `FredSummary` struct (4 scalar values + as_of date). D-06 requires a richer shape per indicator with `history[]` and `trend`. [VERIFIED: `fed.ts` L185-256]

Two options for FRED-03:

**Option A:** Add `getNationalEconomicSummary()` as a new function returning `Record<string, RichIndicator>` while keeping `getFredSummary()` for backward compatibility. The assembler (`national-quarterly.ts`) continues to call `getFredSummary()`; Hamilton tool layer (Phase 25) calls `getNationalEconomicSummary()`.

**Option B:** Upgrade `getFredSummary()` to return the richer shape, update the assembler.

Recommendation: **Option A**. D-05 says extend `fed.ts`; keeping backward compat avoids breaking the report assembler which already calls `getFredSummary()`. [ASSUMED — "extend" interpreted as "add new function"; user may want replacement instead]

## CPI YoY: TypeScript vs SQL (D-07 Decision)

The TypeScript approach (fetch 13 rows, compare indices 0 and 12) is already implemented and working in `getFredSummary()`. [VERIFIED: `fed.ts` L226-244]

**Recommendation: TypeScript approach (keep as-is).** Reasons:
1. Already implemented and presumably correct
2. SQL LAG/window functions would require the same 13-month lookback anyway
3. The TypeScript version is transparent and testable with mock data
4. CPI is monthly, so 13 rows = current month + 12 prior months = 1 year

The only edge case: if fewer than 13 rows exist, `cpiYoy` stays null — correct behavior.

## District-Level Indicators (FRED-04)

`getDistrictIndicators(district: number)` already exists in `fed.ts` and queries `fed_economic_indicators WHERE fed_district = $district OR fed_district IS NULL`. [VERIFIED: `fed.ts` L141-154]

The district unemployment series (MAUR, NYUR, etc.) are mapped in `ingest_fred.py` DISTRICT_SERIES. [VERIFIED: `ingest_fred.py` L34-49]

FRED-04 is mostly satisfied by existing infrastructure. What may be needed: a query that returns the LATEST unemployment value per district in a single call (not one call per district). New function: `getDistrictUnemployment(): Promise<Map<number, number>>`.

## Common Pitfalls

### Pitfall 1: Double-Scaling the fee_income_ratio
**What goes wrong:** Developer sees fee_income_ratio in a query and multiplies it by 1000 thinking it's in thousands.
**Why it happens:** All other dollar fields need `* 1000`; the ratio looks like it should too.
**How to avoid:** `fee_income_ratio` is a dimensionless ratio (e.g., 0.0234 = 2.34%). It is computed from `service_charge_income / total_revenue` where both are already in thousands — the thousands cancel. Do not scale it.
**Warning signs:** A `fee_income_ratio` value above 1.0 or below 0 indicates incorrect scaling.

### Pitfall 2: YoY Comparison Across Institutions With Different Report Dates
**What goes wrong:** `getRevenueTrend()` groups by quarter. If institutions report on different dates within a quarter (e.g., 2024-09-30 vs 2024-10-01), some may fall in different quarters depending on `DATE_TRUNC('quarter', report_date::date)`.
**Why it happens:** `report_date` is TEXT cast to date — timezone issues can shift a date.
**How to avoid:** The existing `::date` cast is correct for UTC dates. Verify row counts per quarter are stable.
**Warning signs:** Quarter bucket with unexpectedly low institution count.

### Pitfall 3: UMCSENT Query Returns null Before Ingestion
**What goes wrong:** `getFredSummary()` queries UMCSENT but it's not in DB — returns null silently. Tests pass, report shows null consumer sentiment.
**Why it happens:** Error handling swallows the null-result case.
**How to avoid:** Ingest UMCSENT before running tests. Add a test that asserts UMCSENT data is non-null after a successful mock ingest.
**Warning signs:** `consumer_sentiment: null` in getFredSummary output despite DB having 48,925 FRED rows.

### Pitfall 4: Reconciliation Test Fails Due to NULL Exclusion
**What goes wrong:** `SUM(bank) + SUM(cu)` does not equal `SUM(total)` because CASE WHEN with NULL charter_type contributes to total but not to charter sums.
**Why it happens:** `charter_type` may be NULL in `crawl_targets` for some institutions.
**How to avoid:** In charter-split queries, use `COALESCE(ct.charter_type, 'unknown')` and include 'unknown' in the reconciliation. OR verify that the WHERE clause ensures non-null charter_type.
**Warning signs:** `bank + cu < total` in reconciliation test.

### Pitfall 5: `sql.unsafe()` vs Tagged Template Parameterization
**What goes wrong:** Trying to pass `$1` params using the tagged template sql literal.
**Why it happens:** The `postgres` client's tagged template interpolation is different from `$1` positional params.
**How to avoid:** Use `getSql().unsafe(query, [params])` when you need `$1/$2` positional params. Use tagged template `` sql`SELECT ... WHERE x = ${value}` `` for simple inline values.

## Code Examples

### Scaling Fix Pattern (CALL-01)

```typescript
// Source: verified against ingest_fdic.py L144-148, ingest_ncua.py L192-202
// ALL monetary fields in institution_financials are stored in thousands.
// Apply * 1000 in every SELECT that returns dollar amounts.

const rows = await sql.unsafe(
  `SELECT
     SUM(inf.service_charge_income * 1000) AS total_service_charges,
     SUM(inf.total_assets * 1000)           AS total_assets,
     SUM(inf.total_deposits * 1000)         AS total_deposits
   FROM institution_financials inf`,
  []
);
```

### getRevenueByTier Pattern (CALL-06)

```typescript
// asset_size_tier values come from crawl_targets.asset_size_tier
// The tier ordering: community < mid-size < regional < large < mega
// Use AVG(total_assets * 1000) for ordering the tiers by size

const rows = await sql.unsafe(
  `SELECT
     COALESCE(ct.asset_size_tier, 'unknown')     AS asset_size_tier,
     SUM(inf.service_charge_income * 1000)        AS total_service_charges,
     COUNT(DISTINCT ct.cert_number)               AS institution_count,
     AVG(inf.service_charge_income * 1000)        AS avg_service_charges
   FROM institution_financials inf
   JOIN crawl_targets ct ON ct.id = inf.crawl_target_id
   WHERE inf.service_charge_income > 0
     AND inf.report_date = (SELECT MAX(report_date) FROM institution_financials WHERE service_charge_income > 0)
   GROUP BY ct.asset_size_tier
   ORDER BY AVG(inf.total_assets) ASC NULLS LAST`,
  []
);
```

### Rich FRED Indicator Fetch Pattern (FRED-03, D-06)

```typescript
// Fetch last 5 observations for a series (current + 4 history)
const rows = await sql`
  SELECT observation_date, value
  FROM fed_economic_indicators
  WHERE series_id = ${seriesId}
    AND value IS NOT NULL
  ORDER BY observation_date DESC
  LIMIT 5
`;

const [current, ...history] = rows;
const historyAsc = history.reverse();  // ascending for Hamilton context

const trend = deriveTrend(Number(current.value), historyAsc.map(r => ({ value: Number(r.value) })));

return {
  current: Number(current.value),
  history: historyAsc.map(r => ({
    date: String(r.observation_date),
    value: Number(r.value),
  })),
  trend,
  asOf: String(current.observation_date),
};
```

### Reconciliation Test Pattern (D-08)

```typescript
// Source: established pattern from vitest mock approach in call-reports.test.ts
it('charter splits sum to national total', async () => {
  // Mock data: bank=750, cu=250, total=1000 (in thousands stored, so * 1000 = real dollars)
  const mockRows = [{ ... }];
  getMock().unsafe = vi.fn().mockResolvedValue(mockRows);

  const charter = await getRevenueByCharter();
  const trend = await getRevenueTrend(1);

  const charterSum = charter.reduce((acc, r) => acc + r.total_service_charges, 0);
  const trendTotal = trend.latest?.total_service_charges ?? 0;

  // Allow for floating point tolerance
  expect(Math.abs(charterSum - trendTotal)).toBeLessThan(1);
});
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | package.json test script (`npx vitest run`) |
| Quick run command | `npx vitest run src/lib/crawler-db/call-reports.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-01 | `service_charge_income * 1000` in SQL, output > threshold | unit | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | ✅ (extend existing) |
| CALL-02 | `getRevenueTrend()` returns 8 quarters with non-null YoY | unit | same | ✅ |
| CALL-03 | `getRevenueByCharter()` returns bank + cu rows | unit | same | ❌ Wave 0 |
| CALL-04 | `getTopRevenueInstitutions()` returns scaled dollar amounts | unit | same | ✅ (extend) |
| CALL-05 | `getFeeIncomeRatio()` returns ratio per institution | unit | same | ❌ Wave 0 |
| CALL-06 | `getRevenueByTier()` returns tier rows with scaled amounts | unit | same | ❌ Wave 0 |
| CALL-03+06 | charter split + tier split reconcile to national total | unit (reconciliation) | same | ❌ Wave 0 |
| FRED-01 | CPI YoY is a percentage, not raw index level | unit | `npx vitest run src/lib/crawler-db/` | ✅ (in getFredSummary) |
| FRED-02 | `getNationalEconomicSummary()` returns non-null consumer_sentiment | unit | same | ❌ Wave 0 |
| FRED-03 | Summary returns history[] and trend for each indicator | unit | same | ❌ Wave 0 |
| FRED-04 | `getDistrictUnemployment()` returns value per district | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/crawler-db/call-reports.test.ts`
- **Per wave merge:** `npx vitest run src/lib/`
- **Phase gate:** Full `npx vitest run` green before verification

### Wave 0 Gaps
- [ ] New test cases in `src/lib/crawler-db/call-reports.test.ts` for `getRevenueByCharter`, `getRevenueByTier`, `getFeeIncomeRatio`
- [ ] New test cases in `src/lib/crawler-db/fed.test.ts` (create) for `getNationalEconomicSummary`, `getDistrictUnemployment`
- [ ] Reconciliation assertions (charter splits = national total, tier splits = national total)
- [ ] UMCSENT ingestion step (not a test gap but a prerequisite for FRED-02 non-null test)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TypeScript execution | ✓ | 20+ (project requirement) | — |
| PostgreSQL (Supabase) | All DB queries | ✓ (remote, via DATABASE_URL) | 13+ | — |
| Python 3.12 | UMCSENT ingestion | ✓ | 3.12 (project requirement) | — |
| FRED API key (`FRED_API_KEY`) | UMCSENT ingestion | [ASSUMED — key used for existing 48,925 rows] | — | Cannot ingest without key |
| vitest | Testing | ✓ | 4.1.3 [VERIFIED: test run output] | — |

**Missing dependencies with no fallback:**
- FRED API key must be present in environment to run `ingest-fred`. If absent, `getFredSummary()` will return `consumer_sentiment: null` and FRED-02 will fail. Key presence assumed from existing data but not verified in this session.

## Security Domain

No new authentication, session, or user-facing endpoints in this phase. All changes are internal DB query functions. Input validation via TypeScript types.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Minimal | TypeScript parameter types (quarterCount: number); no user input flows through these functions directly |
| V6 Cryptography | No | — |
| SQL Injection | Yes (V5) | Template literal SQL for tagged templates; `sql.unsafe()` with positional `$1` params — not string concatenation |

**SQL injection note:** `sql.unsafe()` calls must use `$1` params for all user-controlled values. The tier/charter filter values come from DB enums, not user input, but the pattern must still be consistent.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UMCSENT is available via standard FRED API | UMCSENT section | If unavailable, FRED-02 cannot be satisfied via this ingestion path; would need University of Michigan direct API |
| A2 | FRED API key is present in the deployment environment | Environment Availability | If absent, `ingest-fred --series UMCSENT` cannot run; FRED-02 blocked |
| A3 | `getNationalEconomicSummary()` is a new function, not a replacement for `getFredSummary()` | getFredSummary vs New section | If user wants replacement, `national-quarterly.ts` assembler must be updated too |
| A4 | 48,925 FRED rows include the 4 national series (FEDFUNDS, UNRATE, CPIAUCSL) with sufficient history (13+ months) | FRED-01 | If CPI has fewer than 13 rows, `cpiYoy` will be null and FRED-01 will show null |

## Open Questions (RESOLVED)

1. **Does the Postgres DB have `total_revenue` and `fee_income_ratio` columns?**
   - **RESOLVED:** YES. `financial.ts` actively queries both columns (lines 63, 90-91, 302-321). `getFinancialsByInstitution()` returns them. `getFeeIncomeRatioDistribution()` queries `fee_income_ratio` with `IS NOT NULL` filter and `ORDER BY`. The FDIC ingestion writes them. Columns are confirmed present and populated.

2. **Are all DISTRICT_SERIES (MAUR, NYUR, etc.) present in the Postgres DB?**
   - **RESOLVED:** YES. `ingest_fred.py` defines `DISTRICT_SERIES` (line 35) with 12 entries mapping state unemployment series (MAUR, NYUR, PAUR, OHUR, etc.) to districts 1-12. The ingestion code iterates all 12 (line 222). With 48,925 FRED rows total, district series are included in the ingested data.

## Sources

### Primary (HIGH confidence)
- `src/lib/crawler-db/call-reports.ts` — existing function signatures and query structure
- `src/lib/crawler-db/fed.ts` — existing FRED functions, FredSummary interface, CPI YoY implementation
- `src/lib/crawler-db/fee-revenue.ts` — charter/tier segmentation query patterns
- `src/lib/crawler-db/financial.ts` — InstitutionFinancial interface, all financial fields
- `src/lib/crawler-db/connection.ts` — getSql() vs sql pattern
- `fee_crawler/commands/ingest_fdic.py` L18, L144-148 — confirmed thousands convention for FDIC
- `fee_crawler/commands/ingest_ncua.py` L192-202 — confirmed thousands convention for NCUA
- `fee_crawler/commands/ingest_fred.py` NATIONAL_SERIES L19-28 — confirmed UMCSENT absence
- `fee_crawler/config.py` FREDConfig L61-70 — confirmed UMCSENT absence from config series list
- vitest test run output — confirmed 16 call-reports tests passing, framework version 4.1.3

### Secondary (MEDIUM confidence)
- `src/lib/crawler-db/call-reports.test.ts` — confirmed mock pattern for extending tests
- `src/lib/report-assemblers/national-quarterly.ts` — confirmed getFredSummary() is called by assembler (backward compat concern)

### Tertiary (LOW confidence — ASSUMED)
- UMCSENT FRED API availability (A1)
- FRED API key presence (A2)

## Metadata

**Confidence breakdown:**
- Scaling fix scope: HIGH — directly verified in ingestion scripts
- New function signatures: HIGH — established pattern from existing files
- UMCSENT missing: HIGH — directly verified against NATIONAL_SERIES list
- UMCSENT FRED availability: LOW — assumed from training knowledge
- District series presence in DB: MEDIUM — ingestion script exists but actual DB rows unverified

**Research date:** 2026-04-07
**Valid until:** 2026-07-07 (stable domain — no fast-moving libraries)
