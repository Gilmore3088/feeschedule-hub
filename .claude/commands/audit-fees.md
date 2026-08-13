# Fee Taxonomy Audit And Repair

You are auditing Fee Insight fee categorization and publication quality. Your job is to find miscategorized fees, missing aliases, outliers, and review pressure, then route fixes through the current agentic pipeline.

## Current Model

- Product/report reads use `published_fee_observations`.
- Pipeline diagnostics may inspect `fees_raw`, `fees_verified`, `fees_published`, `agent_runs`, `agent_run_steps`, and `agent_run_events`.
- Taxonomy logic lives in TypeScript under `src/lib/fee-taxonomy.ts` and agent modules under `src/lib/agents/*`.
- Repair work should be implemented in TypeScript modules or review decisions, then surfaced through visible agent runs.

## Audit Steps

### 1. Published Distribution Outliers

For major categories, find likely bad published amounts.

```sql
SELECT canonical_fee_key, fee_name, amount, crawl_target_id, source_url
FROM published_fee_observations
WHERE canonical_fee_key = '{category}' AND amount > 0
ORDER BY amount DESC
LIMIT 25;
```

Red flags:

- overdraft or NSF amounts above expected per-item ranges.
- maintenance fees that look like commercial account pricing.
- wire amounts that look international but are classified domestic.
- caps, limits, or policy text published as per-item fees.

### 2. Cap And Policy Leakage

```sql
SELECT canonical_fee_key, fee_name, amount, crawl_target_id
FROM published_fee_observations
WHERE canonical_fee_key IN ('overdraft', 'nsf', 'continuous_od')
  AND (
    LOWER(fee_name) LIKE '%cap%'
    OR LOWER(fee_name) LIKE '%maximum%'
    OR LOWER(fee_name) LIKE '%daily limit%'
    OR LOWER(fee_name) LIKE '%per day%'
  )
  AND LOWER(fee_name) NOT LIKE '%capture%'
ORDER BY amount DESC;
```

Any results should be routed to Knox/Darwin review logic or direct admin review, not silently patched.

### 3. Pipeline Coverage

```sql
SELECT
  (SELECT COUNT(*) FROM crawl_targets) AS institutions,
  (SELECT COUNT(DISTINCT crawl_target_id) FROM published_fee_observations) AS institutions_with_published_fees,
  (SELECT COUNT(*) FROM fees_raw) AS raw_rows,
  (SELECT COUNT(*) FROM fees_verified) AS verified_rows,
  (SELECT COUNT(*) FROM published_fee_observations) AS published_rows;
```

### 4. Review Pressure

```sql
SELECT status, COUNT(*) AS count
FROM agent_runs
GROUP BY status
ORDER BY count DESC;
```

Use run/step/event evidence to determine whether the right fix is Magellan source discovery, Rosetta text/OCR, Knox extraction, Darwin verification, or Hamilton publishing.

### 5. Remaining Unmatched Or Low-Confidence Rows

Inspect raw/verified pipeline rows only when diagnosing the pipeline, then fix the responsible agent rule.

```sql
SELECT canonical_fee_key, fee_name, amount, crawl_target_id, confidence
FROM fees_raw
WHERE canonical_fee_key IS NULL OR confidence < 0.7
ORDER BY created_at DESC
LIMIT 50;
```

## Repair Rules

- For taxonomy improvements, update TypeScript taxonomy/agent code and tests.
- For suspicious individual rows, route through Knox/Darwin review surfaces.
- For repeated source failures, fix Magellan selection/backoff so batches rotate.
- For unreadable source documents, fix Rosetta/OCR handling.
- For publish misses, fix Hamilton publish eligibility and lineage checks.

## Verification

Run:

```bash
npm run guard:legacy
npm run test:agentic
npm run build
```

Then report:

```md
## Fee Audit Report

### Issues Found
- [count] outlier published observations
- [count] taxonomy gaps
- [count] source/document gaps
- [count] agent runs blocked or failed

### Recommended Agent Fixes
| Owner | Fix | Expected Impact |
|-------|-----|-----------------|

### Coverage
- Institutions: X
- Institutions with published fees: Y
- Published observations: Z
```
