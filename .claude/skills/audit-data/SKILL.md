---
name: audit-data
description: Run data quality checks on the crawler database and report hygiene issues
user_invocable: true
---

# Data Hygiene Audit

Run a comprehensive data quality audit on the Bank Fee Index database.

## What This Skill Does

Queries the SQLite database to identify data quality issues and produce a structured report.

## Steps

1. Import and call `getDataQualityReport()` from `src/lib/crawler-db/hygiene.ts`
2. Run the report by executing: `npx tsx -e "const { getDataQualityReport } = require('./src/lib/crawler-db/hygiene'); console.log(JSON.stringify(getDataQualityReport(), null, 2));"` or read the database directly
3. Present findings in a structured table format

## Checks Performed

| Check | Source Function | Healthy Target |
|-------|----------------|----------------|
| Invalid state codes (FM, MH, PW, etc.) | `getInvalidStateCodes()` | 0 institutions |
| Uncategorized fees | `getUncategorizedFeeCount()` | Trending down |
| Null amounts (non-free fees) | `getNullAmountCount()` | Trending down |
| Stale institutions (>90 days) | `getStaleInstitutionCount()` | < 10% of total |
| Review status distribution | `getStatusDistribution()` | Report only |
| Duplicate fee names per institution | `getDuplicateFees()` | 0 duplicates |
| Missing financial data | `getMissingFinancialsCount()` | Trending down |

## How to Run Manually

```bash
# From project root
npx tsx scripts/audit-data.ts
```

Or query the database directly:

```sql
-- Invalid state codes
SELECT state_code, COUNT(*) as cnt
FROM crawl_targets
WHERE state_code NOT IN ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU','AS')
AND state_code IS NOT NULL
GROUP BY state_code;

-- Status distribution
SELECT review_status, COUNT(*) FROM extracted_fees GROUP BY review_status;
```

## Output Format

Present the audit as a markdown table with pass/fail indicators:

```
| Check                  | Result | Status |
|------------------------|--------|--------|
| Invalid state codes    | 0      | PASS   |
| Uncategorized fees     | 234    | WARN   |
| Stale institutions     | 12%    | FAIL   |
```

## Key Files

- `src/lib/crawler-db/hygiene.ts` - All data quality query functions
- `src/lib/us-states.ts` - Valid US state/territory code definitions
- `src/lib/crawler-db/geographic.ts` - Geographic aggregation queries
