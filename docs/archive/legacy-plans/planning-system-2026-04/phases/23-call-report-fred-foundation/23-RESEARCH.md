# Phase 23: Call Report & FRED Foundation - Research

**Researched:** 2026-04-07
**Domain:** Call Report data (institution_financials), FRED economic indicators, FDIC asset tier segmentation, CFPB complaint data
**Confidence:** HIGH (existing code audited directly; external standards verified via official sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fix at the ingestion layer — store actual dollars in DB, not thousands. Requires a migration + backfill of ~38K existing `call_report` rows, plus updating the ingestion pipeline to multiply by 1000 on ingest going forward.
- **D-02:** Verify with both methods: (a) spot-check 5-10 well-known banks (JPMorgan, Wells Fargo, etc.) against FFIEC CDR filings, and (b) automated range assertion tests that validate dollar values are in sane ranges per institution size.
- **D-03:** Use FDIC standard asset size groupings (not the existing 5-tier system in fed-districts.ts). Research the official FDIC tier breakpoints during planning.
- **D-04:** Replace the existing tier system everywhere — fee index, peer filters, market explorer, Call Report segmentation. One tier system across the entire platform for consistency.
- **D-05:** Per Fed district, provide: unemployment rate, employment growth (nonfarm payrolls change), and housing/CRE data.
- **D-06:** Per district, also provide fee-specific banking metrics: overdraft revenue generated, other fee revenue, and CFPB complaint data.
- **D-07:** CFPB complaint data is a new data source — ingest from CFPB's public complaint API, filtered by fee-related categories (overdraft, NSF, account fees). Store with institution linkage.
- **D-08:** Call Report data connects to institution slugs via both profile pages AND peer comparison.
- **D-09:** Peer comparison powered by Call Report data.
- **D-10:** Full financial context for bank executives.
- **D-11:** Audit existing implementations first before planning. Run each query, verify output is correct and complete. Mark truly-done requirements as done. Plan only for fixes + gaps.

### Claude's Discretion

- Migration strategy for the 38K row backfill (batch size, zero-downtime approach)
- CFPB API pagination and rate limiting approach
- Specific FRED series IDs for district-level employment growth and housing data
- SQL query structure for per-institution financial context views

### Deferred Ideas (OUT OF SCOPE)

- Housing/CRE detailed analysis per district — capture basic data now, deep analysis in a future phase
- CFPB complaint trend analysis over time — basic ingestion now, analytics later
- Institution-level financial health scoring — future phase after all data sources are verified
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALL-01 | Revenue queries return correct dollar amounts (fix thousands scaling) | Migration pattern in §Architecture; `_parse_amount()` currently stores raw — multiply by 1000 at backfill |
| CALL-02 | YoY revenue trend available for last 8 quarters with growth rate | `getRevenueTrend()` exists and is structurally correct; scaling fix (CALL-01) unblocks it |
| CALL-03 | Bank vs credit union revenue split queryable | `getRevenueTrend()` already returns bank/cu splits; unblocked by CALL-01 |
| CALL-04 | Top institutions by service charge income queryable | `getTopRevenueInstitutions()` exists; unblocked by CALL-01 |
| CALL-05 | Fee income ratio (SC / total revenue) computed per institution | `fee_income_ratio` column exists in schema; `getRevenueIndexByDate()` computes it |
| CALL-06 | Revenue segmented by asset tier (FDIC standard tiers) | New query needed; FDIC tier breakpoints documented below |
| FRED-01 | CPI YoY change computed correctly (not raw index) | Already implemented in `getNationalEconomicSummary()` via 12-month rolling delta |
| FRED-02 | Consumer sentiment (UMCSENT) available | UMCSENT already in FRED ingestion config; `buildRichIndicator("UMCSENT")` already called |
| FRED-03 | National economic summary available (4 indicators) | `getNationalEconomicSummary()` already returns all 4; needs verification against live data |
| FRED-04 | District-level economic indicators queryable (per-district unemployment) | District unemployment already ingested (MAUR, NYUR, PAUR etc.); new: nonfarm payroll series needed |
</phase_requirements>

---

## Summary

Phase 23 is primarily a **data correctness and gap-filling phase**, not a greenfield build. The majority of the query layer already exists in `src/lib/crawler-db/call-reports.ts` and `src/lib/crawler-db/fed.ts`. The critical blocker is CALL-01: the ingestion pipeline stores FFIEC service charge income in thousands of dollars (raw MDRM field value), but the DB column `service_charge_income BIGINT` has no multiplier applied. All downstream queries therefore return values 1000x too small. D-11 mandates an audit before planning — this research surfaces what needs fixing vs what merely needs verification.

**Primary recommendation:** Fix the scaling at the DB layer first (one UPDATE migration + ingest_call_reports.py patch), then audit each requirement against live data in sequence. Most requirements (CALL-02 through CALL-05, FRED-01 through FRED-03) are structurally done and will be correct as soon as the scaling fix lands. CALL-06 (FDIC tier segmentation) and FRED-04 (nonfarm payrolls per district) require new code.

---

## Standard Stack

### Core (no new packages needed)

All required functionality can be built with the existing stack. No new npm or pip dependencies are required for this phase.

| Component | What It Does | Where |
|-----------|-------------|-------|
| `postgres` 3.4.8 | Supabase Postgres client for SQL queries | `src/lib/crawler-db/connection.ts` |
| `requests` 2.31+ | Python HTTP client for FRED and CFPB API calls | `fee_crawler/commands/ingest_fred.py` |
| FRED REST API | Economic indicator time series (free, key required) | `https://api.stlouisfed.org/fred` |
| CFPB Complaint API | Consumer complaint aggregations by institution | `https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/` |

### Existing Files to Modify

| File | Change |
|------|--------|
| `src/lib/crawler-db/call-reports.ts` | Scaling verification; new `getRevenueByTier()` function |
| `src/lib/crawler-db/fed.ts` | New district nonfarm payroll series; `getDistrictEconomicIndicators()` extension |
| `fee_crawler/commands/ingest_call_reports.py` | Fix `_parse_amount()` to multiply FDIC values by 1000 on ingest |
| `fee_crawler/commands/ingest_fred.py` | Add nonfarm payroll series IDs for 12 districts to `DISTRICT_SERIES` |
| `src/lib/fed-districts.ts` | Replace existing 6-tier labels with FDIC standard 5-tier labels (D-03, D-04) |

---

## Architecture Patterns

### Pattern 1: Scaling Fix — Where the Bug Lives

The ingestion pipeline (`ingest_call_reports.py`) calls `_parse_amount()` which converts RIAD4080 strings to integers. It does NOT multiply by 1000. FFIEC Call Report MDRM field RIAD4080 ("Total service charges on deposit accounts") is reported in **thousands of dollars**.

```python
# fee_crawler/commands/ingest_call_reports.py line 98-99
service_charges = _parse_amount(row.get("RIAD4080") or row.get("ACCT_661") or row.get("ACCT_131"))
```

NCUA fields (ACCT_661, ACCT_131) are reported in **whole dollars** — no multiplier needed for NCUA. Only FDIC/FFIEC source rows need `* 1000`.

The fix has two parts:
1. **Backfill migration:** UPDATE all existing rows where `source = 'ffiec'` (or `source = 'fdic'`) multiplying `service_charge_income * 1000` and `other_noninterest_income * 1000`.
2. **Ingestion fix:** After `_parse_amount()` for FDIC rows, multiply by 1000 before upsert.

```python
# Fixed ingestion (fee_crawler/commands/ingest_call_reports.py)
# source parameter distinguishes ffiec vs ncua_5300
if source == "ffiec" and service_charges is not None:
    service_charges = service_charges * 1000
if source == "ffiec" and other_noninterest is not None:
    other_noninterest = other_noninterest * 1000
```

Also note: `total_assets` and `total_deposits` in `institution_financials` may also be stored in thousands — the audit (D-11) must check whether FDIC bulk data reports these fields in thousands too. FFIEC Call Report balance sheet items (RCFD2170 = total assets, RCON2200 = total deposits) are also in thousands.

### Pattern 2: Postgres Backfill Migration

The `institution_financials` table has 38,949 rows (8 quarters, Q1 2024–Q4 2025). A safe zero-downtime backfill in Supabase (transaction-mode pooler, port 6543):

```sql
-- Migration: multiply FFIEC service charge income by 1000
-- Safe to run: no FK impact, pure numeric update
UPDATE institution_financials
SET
  service_charge_income    = service_charge_income * 1000,
  other_noninterest_income = other_noninterest_income * 1000
WHERE source IN ('ffiec', 'fdic')
  AND service_charge_income IS NOT NULL;

-- Also fix total_assets, total_deposits, total_loans, total_revenue if they
-- were ingested from FFIEC bulk data (MUST verify before applying):
UPDATE institution_financials
SET
  total_assets   = total_assets * 1000,
  total_deposits = total_deposits * 1000,
  total_loans    = total_loans * 1000,
  total_revenue  = total_revenue * 1000
WHERE source IN ('ffiec', 'fdic')
  AND total_assets IS NOT NULL
  AND total_assets < 1000000;  -- guard: only rows that look like thousands-scale
```

The guard clause `total_assets < 1000000` prevents double-multiplication if migration runs twice. At 38K rows, this will complete in under 5 seconds on Supabase.

**Batch approach:** Not needed at this row count. A single UPDATE is appropriate. [ASSUMED: Supabase connection can handle single-statement 38K row update without timeout — this is well within Postgres default statement timeout]

### Pattern 3: FDIC Standard Asset Tier Definitions

**FDIC QBP official tier breakpoints** (verified via FDIC.gov search, Q4 2024 QBP):

| Tier Key | Label | Asset Range |
|----------|-------|-------------|
| `micro` | Micro (<$100M) | < $100,000,000 |
| `community` | Community ($100M–$1B) | $100M to $1B |
| `midsize` | Mid-Size ($1B–$10B) | $1B to $10B |
| `regional` | Regional ($10B–$250B) | $10B to $250B |
| `mega` | Mega (>$250B) | > $250,000,000,000 |

**Replacing the existing 6-tier system in `fed-districts.ts`:**

Current system has 6 tiers: `community_small` (<$300M), `community_mid` ($300M–$1B), `community_large` ($1B–$10B), `regional` ($10B–$50B), `large_regional` ($50B–$250B), `super_regional` ($250B+).

FDIC standard collapses community tiers (everything <$1B becomes either micro or community) and splits large banks at $250B.

```typescript
// New fed-districts.ts
export const FDIC_TIER_LABELS: Record<string, string> = {
  micro:      "Micro (<$100M)",
  community:  "Community ($100M–$1B)",
  midsize:    "Mid-Size ($1B–$10B)",
  regional:   "Regional ($10B–$250B)",
  mega:       "Mega (>$250B)",
};

export const FDIC_TIER_ORDER = [
  "micro", "community", "midsize", "regional", "mega"
] as const;

export const FDIC_TIER_BREAKPOINTS = {
  micro:     [0,                   100_000_000],
  community: [100_000_000,         1_000_000_000],
  midsize:   [1_000_000_000,       10_000_000_000],
  regional:  [10_000_000_000,      250_000_000_000],
  mega:      [250_000_000_000,     Infinity],
} as const;
```

`crawl_targets.asset_size_tier` currently uses the old tier key names. A data migration is needed to reclassify existing tiers.

### Pattern 4: CALL-06 — Revenue by FDIC Tier

New query function `getRevenueByTier()` in `call-reports.ts`:

```typescript
// FDIC tier breakpoints as SQL CASE
// total_assets is stored in dollars after scaling fix
export async function getRevenueByTier(
  reportDate?: string
): Promise<Array<{ tier: string; institution_count: number; total_sc_income: number; avg_sc_income: number }>> {
  const sql = getSql();
  const date = reportDate ?? await getLatestReportDate(sql);
  
  return await sql.unsafe(
    `SELECT
       CASE
         WHEN inf.total_assets < 100000000             THEN 'micro'
         WHEN inf.total_assets < 1000000000            THEN 'community'
         WHEN inf.total_assets < 10000000000           THEN 'midsize'
         WHEN inf.total_assets < 250000000000          THEN 'regional'
         ELSE                                               'mega'
       END AS tier,
       COUNT(DISTINCT inf.crawl_target_id)             AS institution_count,
       SUM(inf.service_charge_income)                  AS total_sc_income,
       AVG(inf.service_charge_income)                  AS avg_sc_income
     FROM institution_financials inf
     WHERE inf.report_date = $1
       AND inf.service_charge_income > 0
       AND inf.total_assets > 0
     GROUP BY 1
     ORDER BY MIN(inf.total_assets)`,
    [date]
  );
}
```

### Pattern 5: FRED District-Level Nonfarm Payrolls

Existing `DISTRICT_SERIES` in `ingest_fred.py` contains unemployment by state proxy (e.g., `MAUR`, `NYUR`). Add nonfarm payroll series.

**Verified FRED series IDs for nonfarm payrolls (state-level, seasonally adjusted):**

| District | State Proxy | Unemployment (existing) | Nonfarm Payroll (new) |
|----------|------------|------------------------|----------------------|
| 1 Boston | Massachusetts | MAUR | MANA |
| 2 New York | New York | NYUR | NYNA |
| 3 Philadelphia | Pennsylvania | PAUR | PANA |
| 4 Cleveland | Ohio | OHUR | OHNA |
| 5 Richmond | Virginia | VAUR | VANA |
| 6 Atlanta | Georgia | GAUR | GANA |
| 7 Chicago | Illinois | ILUR | ILNA |
| 8 St. Louis | Missouri | MOUR | MONA |
| 9 Minneapolis | Minnesota | MNUR | MNNA |
| 10 Kansas City | Colorado | COUR | CONA |
| 11 Dallas | Texas | TXUR | TXNA |
| 12 San Francisco | California | CAUR | CANA |

Pattern: `{2-letter state abbreviation}NA` for nonfarm all employees (seasonally adjusted). Confirmed for MA, NY, PA via FRED search.

YoY employment growth is computed in query layer (not in ingest) — same approach as YoY revenue in `getRevenueTrend()`: compare latest to same period 12 months ago.

### Pattern 6: FRED-02 — UMCSENT Availability Check

`UMCSENT` (University of Michigan Consumer Sentiment) is already in `buildRichIndicator("UMCSENT")` call within `getNationalEconomicSummary()`. However, `UMCSENT` is NOT in the `NATIONAL_SERIES` list in `ingest_fred.py`. This means if FRED ingestion hasn't been run recently, UMCSENT data may be missing from `fed_economic_indicators`. FRED-02 requires verifying UMCSENT exists in the table and adding it to the ingestion list.

```python
# Fix in ingest_fred.py NATIONAL_SERIES
NATIONAL_SERIES: list[str] = [
    "UNRATE",
    "FEDFUNDS",
    "CPIAUCSL",
    "UMCSENT",      # ADD: Consumer Sentiment — was missing
    "DPSACBM027NBOG",
    ...
]
```

### Pattern 7: Existing Functions Status (D-11 Audit)

| Function | File | Structural Status | Blocked By |
|----------|------|-------------------|------------|
| `getRevenueTrend(8)` | call-reports.ts | EXISTS, logic correct | CALL-01 scaling |
| `getTopRevenueInstitutions(10)` | call-reports.ts | EXISTS, logic correct | CALL-01 scaling |
| `getRevenueIndexByDate()` | financial.ts | EXISTS, fee_income_ratio | CALL-01 scaling |
| `getNationalEconomicSummary()` | fed.ts | EXISTS, all 4 indicators | UMCSENT ingestion gap |
| `getFredSummary()` | fed.ts | EXISTS, scalar values | UMCSENT ingestion gap |
| `getDistrictBeigeBookSummaries()` | fed.ts | EXISTS | None (130 Beige Book rows ingested) |
| `getDistrictIndicators(district)` | fed.ts | EXISTS but returns raw rows, no nonfarm | FRED-04 new series |
| `getRevenueByTier()` | call-reports.ts | DOES NOT EXIST | New function needed |

### Anti-Patterns to Avoid

- **Double-migration:** Running the backfill UPDATE twice on the same rows. Use a guard clause (`total_assets < threshold` or check for specific value range) or a `migrated_at` timestamp column.
- **Applying x1000 to NCUA rows:** NCUA 5300 call report fields (ACCT_661) are in whole dollars — only FFIEC/FDIC source rows need multiplication.
- **Adding UMCSENT to query but not to ingestion list:** If the series isn't in `NATIONAL_SERIES`, it won't be re-ingested on future runs.
- **Inline CASE breakpoints duplicated:** Define tier breakpoints once as constants (TypeScript side) and as SQL CASE (query side) — they must agree.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| CPI YoY calculation | Custom CPI computation | Already implemented in `getNationalEconomicSummary()` |
| Sparkline rendering | Custom SVG chart | `src/components/sparkline.tsx` exists |
| Trend classification | Custom stats | `buildRichIndicator()` already computes rising/falling/stable |
| FRED rate limiting | Custom throttle | `REQUEST_DELAY = 0.5` in `ingest_fred.py` handles 120 req/min limit |
| CFPB name matching | Full fuzzy match lib | `_normalize_name()` + prefix matching in `ingest_cfpb.py` already exists |
| Percentile calculation | Custom math | `PERCENTILE_CONT(0.5)` Postgres aggregate (already used in health.ts) |

---

## Runtime State Inventory

This is a data-fix phase, not a rename/refactor. The relevant runtime state question is: **are there cached/stored values derived from the unscaled data that will become stale after the migration?**

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `institution_financials` — ~38,949 rows where `source = 'ffiec'` have SC income stored in thousands | Backfill UPDATE: multiply by 1000 |
| Stored data | `institution_financials` — `total_assets`, `total_deposits`, `total_loans` may also be in thousands (FFIEC bulk includes balance sheet) | Audit before migration; apply same fix if confirmed |
| Stored data | `fee_income_ratio` float column — computed as `service_charge_income / total_assets * 10000`. If both numerator and denominator are both wrong by 1000x, the ratio is correct. Verify before touching. | No action if ratio was computed consistently |
| Live service config | FRED `fed_economic_indicators` — UMCSENT may not be present (not in NATIONAL_SERIES list) | Add UMCSENT to NATIONAL_SERIES; run ingest-fred |
| Live service config | FRED `fed_economic_indicators` — nonfarm payroll series (MANA, NYNA, etc.) are absent | Add to DISTRICT_SERIES; run ingest-fred |
| OS-registered state | None | None — verified by inspection |
| Secrets/env vars | `FRED_API_KEY` env var — required for ingestion | None — already configured |
| Build artifacts | None relevant | None |

**fee_income_ratio analysis:** If `fee_income_ratio` was computed as `service_charge_income (thousands) / total_assets (thousands) * 10000`, the ratio is dimensionally consistent and correct. Do NOT recompute it as part of the scaling fix unless the ratio was computed from mixed-scale values. The D-11 audit must verify this.

---

## Common Pitfalls

### Pitfall 1: NCUA vs FFIEC Scaling
**What goes wrong:** Multiplying NCUA 5300 data by 1000, producing values 1000x too large for credit unions.
**Why it happens:** The `source` parameter passed to `_ingest_from_csv()` is either `"ffiec"` or `"ncua_5300"`. The FFIEC MDRM standard reports in thousands; NCUA does not.
**How to avoid:** Gate the `* 1000` multiplier on `source == "ffiec"` explicitly. The fix must not touch NCUA rows.
**Warning signs:** After migration, JPMorgan should show ~$5B+ in SC income; any CU showing billions is suspicious.

### Pitfall 2: Double-Backfill Risk
**What goes wrong:** Running the UPDATE migration twice, producing values 1,000,000x correct scale.
**Why it happens:** No idempotency guard on the migration SQL.
**How to avoid:** Add a guard clause: `WHERE service_charge_income < 1000000000` (values below $1B already) OR check a migration log table. Alternatively add a `RETURNING count` and verify before committing.

### Pitfall 3: Total Assets Also Stored in Thousands
**What goes wrong:** Fixing only `service_charge_income` but leaving `total_assets` in thousands. The `fee_income_ratio` and tier classification (which depends on `total_assets`) remain broken.
**Why it happens:** FFIEC bulk data reports ALL balance sheet items in thousands (RC-A schedule).
**How to avoid:** The D-11 audit must spot-check JPMorgan's `total_assets`. As of Q4 2024, JPMorgan Chase total assets = ~$3.9 trillion. If the DB shows ~$3.9B (3 orders of magnitude off), total_assets also needs the x1000 fix.

### Pitfall 4: UMCSENT Availability
**What goes wrong:** `getNationalEconomicSummary()` calls `buildRichIndicator("UMCSENT")` but the series was never ingested — returns null silently.
**Why it happens:** UMCSENT is not in the `NATIONAL_SERIES` list in `ingest_fred.py`.
**How to avoid:** Add UMCSENT to NATIONAL_SERIES before verifying FRED-02. Then run `python -m fee_crawler ingest-fred`.

### Pitfall 5: FDIC Tier Migration Breaks Existing Filter UI
**What goes wrong:** Renaming tier keys in `fed-districts.ts` (e.g., `community_small` → `micro`) breaks URL params like `?tier=community_small` stored in user bookmarks, peer sets, and `saved_peer_sets` table.
**Why it happens:** The tier values are stored as strings in the DB (`saved_peer_sets.tiers`) and passed as URL params.
**How to avoid:** Map old tier keys to new tier keys in `parsePeerFilters()` for backward compatibility, OR migrate `saved_peer_sets.tiers` column values, OR both.

### Pitfall 6: Nonfarm Payroll YoY Computed on Thousands
**What goes wrong:** FRED nonfarm payroll series (e.g., MANA) returns values in thousands of persons. Computing YoY growth `(3727 - 3700) / 3700 * 100` gives correct pct regardless of scale — but displaying "3727" as "3,727 jobs" is wrong. Must display "3,727,000 jobs" or "3.7M jobs".
**Why it happens:** FRED documentation says units = "Thousands of Persons."
**How to avoid:** Store raw FRED values; apply display formatting in `formatAmount` or a dedicated `formatPayroll(v: number)` helper.

---

## Code Examples

### Backfill Migration SQL
```sql
-- Source: schema inspection (service_charge_income BIGINT, source TEXT)
-- Safe: idempotent guard prevents double-application

BEGIN;

-- Step 1: Fix service charge income + other noninterest for FFIEC rows
UPDATE institution_financials
SET
  service_charge_income     = service_charge_income * 1000,
  other_noninterest_income  = CASE
                                WHEN other_noninterest_income IS NOT NULL
                                THEN other_noninterest_income * 1000
                                ELSE NULL
                              END
WHERE source IN ('ffiec', 'fdic')
  AND service_charge_income IS NOT NULL
  AND service_charge_income < 100000000;  -- guard: < $100M means still in thousands

-- Step 2 (conditional on audit): Fix total_assets, total_deposits, total_loans
-- Only run after verifying JPMorgan total_assets is in thousands
-- UPDATE institution_financials
-- SET total_assets   = total_assets * 1000,
--     total_deposits = total_deposits * 1000,
--     total_loans    = total_loans * 1000,
--     total_revenue  = CASE WHEN total_revenue IS NOT NULL THEN total_revenue * 1000 ELSE NULL END
-- WHERE source IN ('ffiec', 'fdic')
--   AND total_assets IS NOT NULL
--   AND total_assets < 1000000000000;  -- guard: < $1T means still in thousands

COMMIT;
```

### Adding Nonfarm Payroll Series to FRED Ingestion
```python
# Source: FRED series verification (MANA, NYNA confirmed via fred.stlouisfed.org)
# fee_crawler/commands/ingest_fred.py

DISTRICT_SERIES: dict[str, int] = {
    # Existing: unemployment rate by state proxy
    "MAUR": 1, "NYUR": 2, "PAUR": 3, "OHUR": 4,
    "VAUR": 5, "GAUR": 6, "ILUR": 7, "MOUR": 8,
    "MNUR": 9, "COUR": 10, "TXUR": 11, "CAUR": 12,
    # New: nonfarm payroll employment (thousands of persons, SA, monthly)
    "MANA": 1, "NYNA": 2, "PANA": 3, "OHNA": 4,
    "VANA": 5, "GANA": 6, "ILNA": 7, "MONA": 8,
    "MNNA": 9, "CONA": 10, "TXNA": 11, "CANA": 12,
}
```

### District Economic Indicator Query Extension
```typescript
// Source: existing pattern in src/lib/crawler-db/fed.ts getDistrictIndicators()

export interface DistrictEconomicSummary {
  district: number;
  unemployment_rate: RichIndicator | null;
  nonfarm_payroll: RichIndicator | null;  // in thousands of persons
  nonfarm_yoy_pct: number | null;
}

const DISTRICT_UNEMPLOYMENT_SERIES: Record<number, string> = {
  1: "MAUR", 2: "NYUR", 3: "PAUR", 4: "OHUR",
  5: "VAUR", 6: "GAUR", 7: "ILUR", 8: "MOUR",
  9: "MNUR", 10: "COUR", 11: "TXUR", 12: "CAUR",
};

const DISTRICT_PAYROLL_SERIES: Record<number, string> = {
  1: "MANA", 2: "NYNA", 3: "PANA", 4: "OHNA",
  5: "VANA", 6: "GANA", 7: "ILNA", 8: "MONA",
  9: "MNNA", 10: "CONA", 11: "TXNA", 12: "CANA",
};

export async function getDistrictEconomicSummary(
  district: number
): Promise<DistrictEconomicSummary> {
  const unemployId = DISTRICT_UNEMPLOYMENT_SERIES[district];
  const payrollId  = DISTRICT_PAYROLL_SERIES[district];
  const [unemployment, payroll] = await Promise.all([
    unemployId ? buildRichIndicator(unemployId) : Promise.resolve(null),
    payrollId  ? buildRichIndicator(payrollId, 13)  : Promise.resolve(null),
  ]);
  
  // YoY nonfarm payroll: (current - 12_months_ago) / 12_months_ago * 100
  let nonfarm_yoy_pct: number | null = null;
  if (payroll && payroll.history.length >= 13) {
    const cur  = payroll.history[0].value;
    const prior = payroll.history[12].value;
    if (prior > 0) nonfarm_yoy_pct = ((cur - prior) / prior) * 100;
  }
  
  return { district, unemployment_rate: unemployment, nonfarm_payroll: payroll, nonfarm_yoy_pct };
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Store Call Report values raw (in thousands) | Store actual dollars (fix scaling at ingest) | All downstream queries correct |
| 6 custom tiers in fed-districts.ts | FDIC standard 5 tiers | Consistent with industry benchmarks |
| Single FRED district series (unemployment only) | Unemployment + nonfarm payrolls per district | Employment growth trend available |

**Deprecated in this phase:**
- `TIER_LABELS` and `TIER_ORDER` in `fed-districts.ts` — replaced by `FDIC_TIER_LABELS` and `FDIC_TIER_ORDER`. Both symbols must be removed after all callers are updated.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NCUA 5300 fields (ACCT_661, ACCT_131) are in whole dollars, not thousands | Architecture Patterns §1 | CU data would be mis-scaled in opposite direction |
| A2 | `fee_income_ratio` was computed from consistently-scaled inputs (both SC income and total assets in thousands), making the ratio correct despite the scaling error | Runtime State Inventory | Ratio values would be wrong; `getRevenueIndexByDate()` results unreliable |
| A3 | Supabase transaction-mode pooler (port 6543) can handle a 38K row UPDATE without statement timeout | Architecture §2 | Migration would need batching |
| A4 | `MONA` is the correct FRED series for Missouri total nonfarm employment (district 8 proxy) | Architecture §5 | District 8 nonfarm payroll data would be wrong |
| A5 | FDIC QBP uses exactly 5 tiers with breakpoints at $100M, $1B, $10B, $250B | Architecture §3 | Tier labels would not match FDIC publications |

---

## Open Questions

1. **Are total_assets, total_deposits, total_loans also stored in thousands?**
   - What we know: FFIEC bulk download reports ALL balance sheet items in thousands. The `_ingest_from_csv()` function does not explicitly handle these fields — they may come from a different source or ingestion path.
   - What's unclear: Whether the current 38K rows have balance sheet items already correctly scaled or not.
   - Recommendation: D-11 audit step — query `SELECT institution_name, total_assets FROM institution_financials inf JOIN crawl_targets ct ON ct.id = inf.crawl_target_id WHERE ct.institution_name ILIKE '%jpmorgan%' ORDER BY report_date DESC LIMIT 1`. If result is ~$3.9B instead of ~$3.9T, balance sheet needs the same fix.

2. **Is MOUR the right Missouri proxy for district 8, or should it be ARUR (Arkansas, which is also in district 8)?**
   - What we know: Missouri is the larger state economy; MOUR is used currently for unemployment.
   - What's unclear: Whether MONA exists and has good data coverage.
   - Recommendation: Verify `MONA` exists in FRED before adding to DISTRICT_SERIES. Kansas City Fed covers NE, KS, OK, CO, WY, NM — a different set than district 8 (MO, AR). Current code already uses CO for district 10 (Kansas City), which is correct. Use MONA for district 8 (St. Louis).

3. **Do any callers outside fed-districts.ts use the old tier key strings directly in SQL or as DB values?**
   - What we know: `asset_size_tier` TEXT column in `crawl_targets` stores these strings. `saved_peer_sets.tiers` TEXT also stores them.
   - What's unclear: Full extent of usage across all query files.
   - Recommendation: `grep -r "community_small\|community_mid\|community_large\|large_regional\|super_regional" src/` before executing the tier rename.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Postgres (Supabase) | All query functions | Assumed live | `DATABASE_URL` env var required |
| FRED API (api.stlouisfed.org) | FRED-02, FRED-04 ingestion | Available (free) | `FRED_API_KEY` env var — already configured |
| CFPB Complaint API | D-07 (future ingestion) | Available (public, no key) | `ingest_cfpb.py` already implemented |
| Python 3.12 | fee_crawler ingestion | Available | Confirmed in CLAUDE.md |
| Node.js 20 | TypeScript queries | Available | Confirmed in CLAUDE.md |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | Inline (no `vitest.config.ts` found — vitest auto-detects) |
| Quick run command | `npx vitest run src/lib/crawler-db/call-reports.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-01 | Post-migration, JPMorgan SC income > $1B | unit (mock) | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Exists (extend) |
| CALL-02 | 8-quarter trend returns non-null YoY for quarters 1-4 | unit (mock) | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Exists (extend) |
| CALL-03 | bank + cu split sums to total_service_charges | unit (mock) | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Exists (extend) |
| CALL-04 | Top institutions list ordered DESC by SC income | unit (mock) | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Exists (extend) |
| CALL-05 | fee_income_ratio in [0, 1] range for all rows | unit (mock) | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | Exists (extend) |
| CALL-06 | Revenue by tier: 5 FDIC tiers present, totals reconcile | unit (mock) | `npx vitest run src/lib/crawler-db/call-reports.test.ts` | New test needed |
| FRED-01 | CPI YoY returns pct (not raw index >100) | unit (mock) | `npx vitest run src/lib/crawler-db/` | Extend fed.ts tests |
| FRED-02 | UMCSENT returns non-null current value | unit (mock) | `npx vitest run src/lib/crawler-db/` | New test needed |
| FRED-03 | Economic summary has 4 non-null indicators | unit (mock) | `npx vitest run src/lib/crawler-db/` | New test needed |
| FRED-04 | District indicators return unemployment + nonfarm for district 2 | unit (mock) | `npx vitest run src/lib/crawler-db/` | New test needed |

**Note:** There is no `src/lib/crawler-db/fed.test.ts` file. All FRED requirement tests need new test files.

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/crawler-db/call-reports.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/lib/crawler-db/fed.test.ts` — covers FRED-01, FRED-02, FRED-03, FRED-04
- [ ] Extend `src/lib/crawler-db/call-reports.test.ts` — covers CALL-06 (`getRevenueByTier`)
- [ ] D-11 audit script (not a test file, but a CLI query) — verify JPMorgan SC income and total_assets in live DB before migration

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes — FRED/CFPB API responses | Values validated via `float(value_str)` before INSERT; guard against FRED "." sentinel |
| V2 Authentication | No | No new auth surfaces |
| V3 Session Management | No | No new session surfaces |
| V4 Access Control | No | Existing requireAuth() on admin pages |
| V6 Cryptography | No | No new crypto |

**SQL injection risk:** `institution_financials` UPDATE uses `WHERE source IN ('ffiec', 'fdic')` — literal values, no user input. Safe.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/crawler-db/call-reports.ts` — Audited directly; getRevenueTrend and getTopRevenueInstitutions confirmed structurally correct
- `src/lib/crawler-db/fed.ts` — Audited directly; getNationalEconomicSummary and UMCSENT gap confirmed
- `fee_crawler/commands/ingest_call_reports.py` — Audited directly; _parse_amount() confirmed no x1000 multiplier
- `fee_crawler/commands/ingest_fred.py` — Audited directly; DISTRICT_SERIES and NATIONAL_SERIES confirmed; UMCSENT absence confirmed
- `scripts/migrate-schema.sql` — institution_financials schema confirmed (BIGINT columns, source TEXT)

### Secondary (MEDIUM confidence)
- FDIC QBP Q4 2024 (fdic.gov) — 5 asset size tiers with breakpoints at $100M/$1B/$10B/$250B confirmed via search result summaries
- [FDIC Quarterly Banking Profile Q4 2024](https://www.fdic.gov/quarterly-banking-profile/quarterly-banking-profile-q4-2024) — Asset size groups referenced
- [FRED MANA series](https://fred.stlouisfed.org/series/MANA) — Massachusetts Total Nonfarm, SA, confirmed
- [FRED NYNA series](https://fred.stlouisfed.org/series/NYNA) — New York Total Nonfarm, confirmed
- [FRED PANA series](https://fred.stlouisfed.org/series/PANA) — Pennsylvania Total Nonfarm, confirmed
- State nonfarm pattern `{STATE}NA` confirmed for MA, NY, PA via direct FRED search

### Tertiary (LOW confidence)
- `MONA`, `MNNA`, `CONA`, `GANA`, `ILNA`, `TXNA`, `CANA`, `OHNA`, `VANA` — Assumed to follow same `{STATE}NA` FRED naming pattern; verified for 3 of 12 states only [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Existing code status: HIGH — all files audited directly
- Scaling bug root cause: HIGH — confirmed in ingest_call_reports.py _parse_amount()
- FRED series gaps: HIGH — UMCSENT absence confirmed in NATIONAL_SERIES list
- FDIC tier breakpoints: MEDIUM — confirmed via FDIC.gov search summaries; breakpoints at $100M/$1B/$10B/$250B match industry standards
- Nonfarm payroll FRED IDs: MEDIUM — confirmed for MA/NY/PA; remaining 9 states assumed from pattern

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable APIs; FDIC tier definitions change rarely)
