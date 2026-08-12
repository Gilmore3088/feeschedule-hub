# Data Hygiene Pipeline

## Overview

The public website displays "52 states" — an impossible number that undermines data credibility. Investigation reveals the count comes from `getStatesWithFeeData()` in `geographic.ts`, which returns all distinct `state_code` values with non-rejected fees. The 52 includes 50 US states + DC + VI (US Virgin Islands). While DC and VI are valid US jurisdictions, the display text "52 states" is misleading. Additionally, the database contains institutions from FM (Federated States of Micronesia) and other non-state territories that need classification.

Beyond the state count, there are systemic data quality issues: inconsistent review status filtering across queries, null amount handling gaps, and no centralized data validation layer.

## Problem Statement

1. **"52 states" display** — confusing to users, undermines credibility
2. **No data hygiene skill** — no repeatable way to audit and clean data
3. **Inconsistent query filters** — some queries use `!= 'rejected'`, others use no filter, others use `= 'approved'`
4. **Territory classification missing** — DC, PR, VI, GU, AS, FM all treated as "states"
5. **Stale hardcoded stats** — landing page has hardcoded numbers (8,751 institutions, 4,000+ schedules) that drift from reality

## Phase 1: Fix State Count Display (Immediate)

### 1a. Classify states vs territories in `us-states.ts`

Add a `US_STATES` set (50 states only) and a `US_TERRITORIES` set (DC, PR, VI, GU, AS) to distinguish them in queries and display.

**File**: `src/lib/us-states.ts`

```typescript
export const US_STATES_ONLY = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
]); // 50

export const US_TERRITORIES = new Set(['DC', 'PR', 'VI', 'GU', 'AS']); // 5

export const VALID_US_CODES = new Set([...US_STATES_ONLY, ...US_TERRITORIES]); // 55

// FM, MH, PW (Freely Associated States) are NOT US jurisdictions
export const EXCLUDED_CODES = new Set(['FM', 'MH', 'PW']);
```

### 1b. Update `getStatesWithFeeData()` to filter valid codes

**File**: `src/lib/crawler-db/geographic.ts` (line 93-107)

Add a WHERE clause filtering to `VALID_US_CODES` only, or at minimum exclude `FM`:

```typescript
export function getStatesWithFeeData() {
  const db = getDb();
  const validCodes = [...VALID_US_CODES].map(c => `'${c}'`).join(',');
  return db.prepare(`
    SELECT ct.state_code,
           COUNT(DISTINCT ct.id) as institution_count,
           COUNT(ef.id) as fee_count
    FROM crawl_targets ct
    JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    WHERE ct.state_code IN (${validCodes})
      AND ef.review_status != 'rejected'
    GROUP BY ct.state_code
    ORDER BY COUNT(DISTINCT ct.id) DESC
  `).all();
}
```

### 1c. Update display text on public research page

**File**: `src/app/(public)/research/page.tsx`

Change from:
```
{statesData.length} states
```
To computed display:
```typescript
const stateCount = statesData.filter(s => US_STATES_ONLY.has(s.state_code)).length;
const territoryCount = statesData.filter(s => US_TERRITORIES.has(s.state_code)).length;
// Display: "50 states" or "50 states + DC & territories"
```

### 1d. Audit all public pages for state count references

**Files to check:**
- `src/app/(public)/research/page.tsx` — lines 38, 111, 304, 519
- `src/app/(public)/fees/page.tsx` — line 441 (hardcoded "50 states", already correct)
- `src/app/page.tsx` — landing page stats (hardcoded)

## Phase 2: Create Data Hygiene Skill

### 2a. Create `/audit-data` skill

**File**: `.claude/skills/audit-data/SKILL.md`

The skill should:
1. Query the database for data quality metrics
2. Report on: invalid state codes, uncategorized fees, null amounts, stale crawl data, review status distribution
3. Output a structured report with counts and actionable items
4. Be runnable on-demand to check data health before publishing

### 2b. Data quality checks to implement

| Check | Query | Expected |
|-------|-------|----------|
| Invalid state codes | `SELECT DISTINCT state_code FROM crawl_targets WHERE state_code NOT IN (valid_codes)` | 0 rows |
| Uncategorized fees | `SELECT COUNT(*) FROM extracted_fees WHERE fee_category IS NULL AND review_status != 'rejected'` | Track trend |
| Null amounts (non-free) | `SELECT COUNT(*) FROM extracted_fees WHERE amount IS NULL AND fee_name NOT LIKE '%free%' AND review_status != 'rejected'` | Track trend |
| Stale institutions | `SELECT COUNT(*) FROM crawl_targets WHERE last_crawl_at < date('now', '-90 days')` | < 10% |
| Status distribution | `SELECT review_status, COUNT(*) FROM extracted_fees GROUP BY review_status` | Report |
| Duplicate fee names | Per institution, normalized fee name collisions | 0 |
| Missing financials | `SELECT COUNT(*) FROM crawl_targets ct LEFT JOIN institution_financials if ON ct.id = if.crawl_target_id WHERE if.id IS NULL` | Track |
| FM/invalid territory institutions | Count of institutions with excluded state codes | 0 after cleanup |

### 2c. Create `src/lib/crawler-db/hygiene.ts`

New query file with functions:
- `getDataQualityReport()` — runs all checks, returns structured report
- `getInvalidStateCodes()` — institutions with non-US state codes
- `getUncategorizedFees()` — fees missing category assignment
- `getStaleInstitutions()` — institutions not crawled in 90+ days
- `getStatusDistribution()` — count by review_status
- `getDuplicateFees()` — duplicate fee names per institution

## Phase 3: Clean the Data

### 3a. Handle FM (Federated States of Micronesia) institutions

Options (recommend Option A):
- **Option A**: Set `review_status = 'rejected'` on all FM institution fees, mark institution as inactive
- **Option B**: Delete FM institutions entirely from crawl_targets
- **Option C**: Keep FM but exclude from US aggregations via the VALID_US_CODES filter

### 3b. Standardize review status filtering

Create a shared SQL fragment or helper:

```typescript
// src/lib/crawler-db/filters.ts
export const NON_REJECTED = `ef.review_status != 'rejected'`;
export const APPROVED_ONLY = `ef.review_status = 'approved'`;
export const BENCHMARK_QUALITY = `ef.review_status IN ('approved', 'staged')`;
```

Apply consistently across all query files:
- `core.ts` — `getStats()` should use `NON_REJECTED`
- `fee-index.ts` — already uses `!= 'rejected'`, standardize
- `geographic.ts` — needs filter added
- `fees.ts` — `getFeeCategorySummaries()` needs filter
- `market.ts` — verify consistency

### 3c. Fix hardcoded stats on landing page

**File**: `src/app/page.tsx`

Replace hardcoded numbers with dynamic queries or at minimum update to accurate values. Best approach: create a `getPublicStats()` function that returns all hero stats.

```typescript
export function getPublicStats() {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT ef.id) as total_fees,
      COUNT(DISTINCT ct.id) as total_institutions,
      COUNT(DISTINCT ct.state_code) as total_states,
      COUNT(DISTINCT ef.fee_category) as total_categories
    FROM crawl_targets ct
    JOIN extracted_fees ef ON ct.id = ef.crawl_target_id
    WHERE ct.state_code IN (${validCodes})
      AND ef.review_status != 'rejected'
  `).get();
  return stats;
}
```

## Phase 4: Update Website with Accurate Data

### 4a. Public research page (`/research`)

- [x] Replace `statesData.length` with proper "50 states + DC" display
- [x] Add "and territories" qualifier where appropriate
- [x] Ensure state cards only show valid US jurisdictions (filtered at query level)

### 4b. State reports section

- [x] Filter state cards to show 50 states + DC only (filtered at DB query level via VALID_US_CODES)
- [x] Add separate "Territories" section for PR, VI if they have data (included with label)
- [x] Remove any FM entries from state listings (filtered at query level)

### 4c. Landing page (`/`)

- [x] Replace hardcoded stats with dynamic `getPublicStats()`

### 4d. Fee index pages

- [x] Verify national index excludes FM data (query filters to VALID_US_CODES)
- [ ] Ensure peer filters don't include invalid territories (deferred — peer filters use fed_district, not state)

## Acceptance Criteria

- [x] Public website shows "50 states" (or "50 states + DC & territories" if territories have data)
- [x] No FM, MH, PW institutions appear in public aggregations
- [x] `/audit-data` skill exists and produces clean report
- [ ] All query files use consistent review status filtering (deferred — separate PR)
- [x] Landing page stats are accurate (dynamic or recently updated)
- [x] State report cards show only valid US jurisdictions
- [x] `us-states.ts` has clear classification of states vs territories vs excluded codes

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/us-states.ts` | Add US_STATES_ONLY, US_TERRITORIES, VALID_US_CODES, EXCLUDED_CODES |
| `src/lib/crawler-db/geographic.ts` | Filter getStatesWithFeeData() to valid codes |
| `src/lib/crawler-db/hygiene.ts` | **NEW** — data quality query functions |
| `src/lib/crawler-db/filters.ts` | **NEW** — shared SQL filter constants |
| `src/app/(public)/research/page.tsx` | Fix state count display |
| `src/app/page.tsx` | Fix hardcoded stats |
| `.claude/skills/audit-data/SKILL.md` | **NEW** — data hygiene skill |

## References

- `src/lib/us-states.ts` — current state name mappings
- `src/lib/crawler-db/geographic.ts:93-107` — getStatesWithFeeData() query
- `src/app/(public)/research/page.tsx:38,111,304,519` — state count display
- `src/lib/fed-districts.ts` — STATE_TO_DISTRICT mapping (no FM)
- `src/lib/us-map-paths.ts` — SVG paths (50 states + DC only)
