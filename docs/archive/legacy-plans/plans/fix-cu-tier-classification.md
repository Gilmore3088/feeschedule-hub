# Fix: Credit Union Tier Classification & Data Quality

## Overview

Three related issues discovered:

### Issue 1: All 4,419 Credit Unions Classified as `community_small`

NCUA reports assets in **thousands of dollars**. FDIC reports in **whole dollars**. The tier assignment logic uses FDIC thresholds (whole dollars) for both, so:

- Navy Federal CU: asset_size = 194,179 (meaning $194B) -> classified as community_small (<$300M)
- The threshold for community_small is <300,000 in the DB
- 194,179 < 300,000 -> community_small (WRONG — Navy Federal is the largest CU in the US)

**Fix:** Multiply CU asset_size by 1,000 during ingestion, OR adjust tier thresholds for CUs.

### Issue 2: Two Overdraft Fees at $0.15 Are Misclassified

- Eclipse Bank "Paid Items" ($0.15, business accounts) — this is a per-item paid item fee, not an overdraft fee
- ConnectOne Bank "Paid Items (Checks & ACH Debits)" ($0.15 per item) — same issue

These should be categorized as something else (perhaps `check_image` or a new `paid_item` category), or rejected. At $0.15 they're pulling down the overdraft min and distorting the range display.

### Issue 3: Agent Tool Output Needs Better Structured Queries

The Fee Analyst makes 6+ tool calls to answer "top 10 institutions with most fees above P75" because no single tool returns ranked institution-level analysis. Need a `rankInstitutionsByOutliers` tool.

## Phase 1: Fix CU Asset Classification

### 1a. Determine the unit conversion

Check NCUA ingestion code to confirm units:

**File:** `fee_crawler/commands/ingest_ncua.py`

If NCUA `ACCT_010` (Total Assets) is in thousands, multiply by 1,000 before storing.

### 1b. Fix existing data

```sql
UPDATE crawl_targets
SET asset_size = asset_size * 1000
WHERE charter_type = 'credit_union' AND asset_size IS NOT NULL;
```

### 1c. Re-run tier assignment

After fixing asset_size, re-run the tier assignment logic to properly classify CUs:

```python
python -m fee_crawler enrich
```

### 1d. Verify distribution

After fix, CU tier distribution should look like:
- super_regional: Navy Federal, BECU, Pentagon, etc.
- large_regional: State Employees, SchoolsFirst, etc.
- regional: 20+ CUs
- community_large: ~200 CUs
- community_mid: ~800 CUs
- community_small: ~3000 CUs

## Phase 2: Fix $0.15 Overdraft Misclassification

Reclassify Eclipse Bank and ConnectOne "Paid Items" fees — these are per-item processing charges, not overdraft fees.

```sql
UPDATE extracted_fees
SET fee_category = 'check_image', fee_family = 'Check Services'
WHERE fee_category = 'overdraft' AND amount = 0.15;
```

Also add "paid items" to the fee_analysis.py aliases to prevent future misclassification.

## Phase 3: Add Ranking Tool for Agents

Add a `rankInstitutions` tool that returns pre-computed rankings:

```typescript
const rankInstitutions = tool({
  description: "Rank institutions by fee positioning against national benchmarks",
  inputSchema: z.object({
    metric: z.enum(["above_p75_count", "below_p25_count", "total_fee_count", "outlier_count"]),
    limit: z.number().default(10),
    charter: z.enum(["bank", "credit_union"]).optional(),
  }),
  execute: async ({ metric, limit, charter }) => {
    // Single query that returns ranked institutions with counts
  },
});
```

## Acceptance Criteria

- [ ] CU asset_size in correct units (whole dollars, matching FDIC)
- [ ] CU tier distribution spans all 6 tiers, not just community_small
- [ ] Navy Federal classified as super_regional (not community_small)
- [ ] $0.15 "Paid Items" fees reclassified out of overdraft
- [ ] Peer comparisons show meaningful CU tier breakdowns
- [ ] Agent can answer "top 10 by outliers" in 1-2 tool calls

## Files to Modify

| File | Change |
|------|--------|
| `fee_crawler/commands/ingest_ncua.py` | Fix asset_size unit conversion |
| `fee_crawler/commands/seed_institutions.py` | Verify tier assignment for CUs |
| `fee_crawler/fee_analysis.py` | Add "paid items" alias |
| `src/lib/research/tools-internal.ts` | Add rankInstitutions tool |
