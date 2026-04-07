---
phase: 25-derived-analytics-hamilton-tools
reviewed: 2026-04-07T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/lib/crawler-db/derived.ts
  - src/lib/crawler-db/derived.test.ts
  - src/lib/hamilton/hamilton-agent.ts
  - src/lib/research/agents.ts
  - src/lib/crawler-db/financial.ts
  - fee_crawler/commands/ingest_fdic.py
  - scripts/migrate-schema.sql
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-04-07
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 25 delivers the derived analytics data layer (`derived.ts`), the `queryNationalData` tool wired into Hamilton, and Hamilton agent consolidation in `agents.ts`. The TypeScript side is well-structured: `derived.ts` is clear, the `* 1000` scaling convention is consistently applied and well-documented, and the test file provides meaningful coverage of cumulative percentage computation, scaling, and null handling.

Two critical gaps were found. First, `overdraft_revenue` — a column explicitly required by `getFeeDependencyRatio()` — is absent from both `scripts/migrate-schema.sql` and `fee_crawler/commands/ingest_fdic.py`. The query in `derived.ts` will silently return `null` for overdraft fields for all institutions, making the overdraft breakdown section of `FeeDependencyRow` non-functional. Second, `hamilton-agent.ts` sends the `BFI_REVALIDATE_TOKEN` as a plain HTTP header to an internal endpoint — while the fetch is server-side only, the empty-string fallback (`?? ""`) means a missing secret is silently accepted.

Three warnings address a percentile algorithm bug in `derived.ts`, unsafe dynamic SQL in `financial.ts`, and the `classifyQuery` export being dead code (defined but never imported outside its own file).

---

## Critical Issues

### CR-01: `overdraft_revenue` column missing from schema migration and FDIC ingestion

**File:** `scripts/migrate-schema.sql:137-160` and `fee_crawler/commands/ingest_fdic.py:163-217`

**Issue:** `getFeeDependencyRatio()` in `derived.ts` queries `latest.overdraft_revenue` from `institution_financials` (line 170), and the TypeScript mapping (lines 196-213) computes `overdraft_share` and `other_sc_income` from this column. However, the `institution_financials` CREATE TABLE statement in `migrate-schema.sql` does not include an `overdraft_revenue BIGINT` column (it ends at `fee_income_ratio FLOAT` on line 159). The FDIC ingestion in `ingest_fdic.py` likewise does not INSERT or ON CONFLICT update `overdraft_revenue`. The column was planned (per CONTEXT.md and PLAN-01) but was never added.

At runtime against a Postgres DB provisioned from this migration, `latest.overdraft_revenue` will always be `NULL`, so every row returned by `getFeeDependencyRatio()` will have `overdraft_revenue: null`, `other_sc_income: null`, and `overdraft_share: null`. The feature is silently non-functional.

**Fix — schema migration:** Add the column after `service_charge_income` in the CREATE TABLE block and add an ALTER for existing databases:

```sql
-- In institution_financials CREATE TABLE, after service_charge_income BIGINT:
overdraft_revenue           BIGINT,

-- Additive ALTER for existing databases (append to end of migrate-schema.sql):
ALTER TABLE institution_financials
  ADD COLUMN IF NOT EXISTS overdraft_revenue BIGINT;
```

**Fix — FDIC ingestion (`ingest_fdic.py`):** Add `overdraft_revenue` to the INSERT column list and the ON CONFLICT DO UPDATE clause. The FDIC BankFind API does not expose RIAD4070 directly; insert NULL for now (preserving the schema) and source from `raw_json` or FFIEC CDR later:

```python
# In the INSERT statement, add to column list after service_charge_income:
#   ..., service_charge_income, overdraft_revenue, other_noninterest_income, ...
# Value: None (NULL) until RIAD4070 source is confirmed

# In ON CONFLICT DO UPDATE SET, add:
#   overdraft_revenue = excluded.overdraft_revenue,
```

---

### CR-02: Missing `BFI_REVALIDATE_TOKEN` guard allows unauthenticated internal report triggers

**File:** `src/lib/hamilton/hamilton-agent.ts:197-199`

**Issue:** The `triggerReport` tool sends `BFI_REVALIDATE_TOKEN` as the `X-Cron-Secret` header to `/api/reports/generate`. If the environment variable is not set, `process.env.BFI_REVALIDATE_TOKEN ?? ""` silently falls back to an empty string, and the request is sent with `X-Cron-Secret: ""`. If the report route accepts an empty secret (e.g., `if (secret === process.env.BFI_REVALIDATE_TOKEN)` where the env var is also undefined), the trigger succeeds without authentication — any Hamilton invocation could trigger report generation.

```typescript
// Current (line 198):
"X-Cron-Secret": process.env.BFI_REVALIDATE_TOKEN ?? "",
```

**Fix:** Fail fast if the token is absent rather than sending an empty credential:

```typescript
const cronSecret = process.env.BFI_REVALIDATE_TOKEN;
if (!cronSecret) {
  return { error: "Report generation is not configured (missing BFI_REVALIDATE_TOKEN)." };
}

const response = await fetch(`${baseUrl}/api/reports/generate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Cron-Secret": cronSecret,
  },
  body: JSON.stringify({ report_type, params: params ?? {} }),
});
```

---

## Warnings

### WR-01: `computePercentile` has an off-by-one error for the median of even-length arrays

**File:** `src/lib/crawler-db/derived.ts:36-45`

**Issue:** `computePercentile(sorted, 0.5)` computes `idx = Math.floor(n * 0.5)`. For a sorted array `[3000, 5000, 7000]` (n=3), this yields `idx=1` and returns `5000` — correct. For an even-length array like `[3000, 5000]` (n=2), `idx = Math.floor(2 * 0.5) = 1`, returning the upper value `5000` rather than the conventional median `4000`. This is not standard percentile interpolation. In the test at line 347-349, the fixture `[3000, 5000, 7000]` happens to produce the right answer by coincidence (odd length, exact midpoint). With real data containing an even number of institutions per charter+tier group, median values will be consistently biased toward the upper value.

The same algorithm is used for p25 and p75. For n=4, `Math.floor(4 * 0.25) = 1`, returning the second element rather than interpolating between the first and second. This is the "lower" percentile convention and it is consistent — but it means the implementation does not match standard statistical conventions (nearest-rank or linear interpolation). This should be explicitly documented or corrected.

**Fix:** For the median, interpolate the midpoint for even-length arrays:

```typescript
function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length / 2;
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[Math.floor(mid)];
}
```

If the lower-rank convention is intentional for percentiles, add a comment documenting this choice so future maintainers understand the divergence from standard library behavior.

---

### WR-02: Dynamic `ORDER BY` via string interpolation in `getMarketConcentration` is unsafe if `opts.sort` is ever exposed externally

**File:** `src/lib/crawler-db/financial.ts:131-144`

**Issue:** `getMarketConcentration` builds an `ORDER BY` clause by interpolating `orderBy` (derived from `opts?.sort`) directly into a `sql.unsafe()` call:

```typescript
const rows = await sql.unsafe(
  `SELECT ... ORDER BY ${orderBy} LIMIT $3`,
  [year, minInst, limit]
);
```

`orderBy` is set to one of three hardcoded strings via a ternary chain, so the immediate risk is low. However, if `opts.sort` is ever directly forwarded from an API query parameter (e.g., `?sort=hhi_asc` passed from a URL), and if a caller inadvertently passes an unsanitized value, this becomes a SQL injection vector. The current callers are all internal server code, but the pattern is fragile.

**Fix:** Keep the allowlist ternary as-is but add a type-level exhaustion check or an explicit guard:

```typescript
const SORT_MAP = {
  hhi_desc: "hhi DESC",
  hhi_asc: "hhi ASC",
  deposits_desc: "total_deposits DESC",
} as const;

const orderBy = SORT_MAP[opts?.sort ?? "hhi_desc"] ?? "hhi DESC";
```

This makes the allowlist explicit, eliminates the nested ternary, and ensures an unknown `sort` value always falls through to a safe default.

---

### WR-03: `classifyQuery` is exported but never used outside `hamilton-agent.ts`

**File:** `src/lib/hamilton/hamilton-agent.ts:65-90`

**Issue:** `classifyQuery` is exported as a public function but no other module imports it. It is not called inside `hamilton-agent.ts` itself either — the streaming vs. report routing decision does not use it. The function exists and is well-written, but it is dead code in the current implementation. If routing logic was removed and `classifyQuery` kept as an export, the discrepancy suggests the routing feature may have been partially removed or was never wired up.

Dead exported functions add cognitive overhead ("where is this used?") and can mask incomplete feature work.

**Fix:** Either remove `classifyQuery` if the streaming/report routing decision is not implemented, or wire it into the tool execution path if it was intended to guide behavior. If it is kept for future use, mark it clearly:

```typescript
/** @internal Routing heuristic — not yet wired into the tool execution path. */
export function classifyQuery(text: string): "streaming" | "report" {
```

---

## Info

### IN-01: `getFeeDependencyRatio` SQL query double-sorts `ratios` array unnecessarily

**File:** `src/lib/crawler-db/derived.ts:161` and `193`

**Issue:** The SQL query uses `array_agg(latest.fee_income_ratio ORDER BY latest.fee_income_ratio)` to return a sorted array from Postgres (line 161). The TypeScript mapping then sorts again with `.map(Number).sort((a, b) => a - b)` (line 193). The second sort is redundant. It is harmless but adds unnecessary work for large arrays.

**Fix:** Remove the TypeScript sort; trust the SQL-level ordering. If the ordering guarantee from `array_agg(...ORDER BY...)` is considered unreliable (e.g., when mocked in tests), document why the double-sort is kept.

---

### IN-02: `ingest_fdic.py` silently skips individual row errors without incrementing a failure counter

**File:** `fee_crawler/commands/ingest_fdic.py:219-221`

**Issue:** Individual DB errors for a CERT are caught and `total_skipped` is incremented, but the error is only printed, not logged with sufficient context (which date, which offset, which exception type). In a batch run of thousands of records, a systematic schema mismatch (e.g., column count after adding `overdraft_revenue`) would print hundreds of error lines mixed with progress output and the final count would understate the problem.

**Fix:** Add the `report_date_fmt` to the error line for context:

```python
print(f"  Error for CERT {cert} (date={report_date_fmt}): {type(e).__name__}: {e}")
```

---

### IN-03: `financial.ts` uses unsafe cast `[...rows] as unknown as MarketConcentration[]` without field mapping

**File:** `src/lib/crawler-db/financial.ts:145`

**Issue:** `getMarketConcentration` casts the raw postgres row array directly to `MarketConcentration[]` via double-casting through `unknown`. Unlike `getFinancialsByInstitution` which performs explicit field mapping (lines 73-95) with `Number()` coercions, `getMarketConcentration` skips the mapping entirely. The postgres client returns numeric columns as strings in some configurations. If `hhi`, `top3_share`, or `total_deposits` come back as strings, downstream arithmetic (e.g., HHI thresholds) will silently coerce incorrectly.

**Fix:** Apply explicit field mapping consistent with the rest of this file:

```typescript
return [...rows].map((r: Record<string, unknown>) => ({
  msa_code: Number(r.msa_code),
  msa_name: String(r.msa_name),
  total_deposits: Number(r.total_deposits),
  institution_count: Number(r.institution_count),
  hhi: Number(r.hhi),
  top3_share: Number(r.top3_share),
  year: Number(r.year),
}));
```

---

_Reviewed: 2026-04-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
