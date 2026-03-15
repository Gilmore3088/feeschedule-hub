---
title: "Data Hygiene Pipeline, CU Classification Fix, Research Content Studio & Agent Skills"
category: data-quality
severity: high
component:
  - crawler-db
  - fee-analysis
  - admin-pipeline
  - research-hub
  - admin-nav
symptoms:
  - "52 states displayed on public website (impossible number)"
  - "All 4,419 credit unions classified as community_small regardless of asset size"
  - "Navy Federal CU ($194B) showing as community_small"
  - "$0.15 Paid Items fees classified as overdraft"
  - "No visibility into 76% of institutions missing fee data"
  - "No way to manually submit fee schedule URLs"
  - "Agent output lacks charts and structured export"
  - "Admin nav Ops section had 8 items, overwhelming"
root_cause:
  - "getStatesWithFeeData() returned all state_code values including FM (Federated States of Micronesia)"
  - "NCUA seed divided ACCT_010 by 1000, then enrich.py divided again — double division"
  - "crawl_targets.asset_size for CUs was 1000x too small vs tier thresholds"
  - "No VALID_US_CODES filter on geographic queries"
  - "No pipeline visibility page in admin"
  - "No content publishing workflow for research agents"
resolution_date: "2026-03-15"
tags:
  - data-hygiene
  - credit-union
  - state-classification
  - asset-tier
  - pipeline-visibility
  - content-studio
  - agent-skills
  - nav-consolidation
---

# Data Hygiene Pipeline, CU Classification, Research Studio & Agent Skills

## Problem

Multiple interconnected data quality and platform issues:

1. **"52 states"** — public website showed 52 states (50 + DC + VI), but FM (Federated States of Micronesia) was also in the data
2. **CU misclassification** — all 4,419 credit unions in `community_small` tier because NCUA assets were stored 1000x too small
3. **Overdraft outliers** — $0.15 "Paid Items" fees from Eclipse Bank and ConnectOne classified as overdraft, pulling down the min
4. **Pipeline blind spots** — 76% of institutions invisible in admin (no fee data, no way to see coverage gaps)
5. **Research output quality** — agents produced generic output, no charts, no export, no publishing workflow
6. **Admin nav bloat** — Ops section had 8 items (Pipeline, Operations, Institutions, Review, Research, Districts, Extracts, Quality)

## Root Causes

### 52 States
`getStatesWithFeeData()` in `geographic.ts` used `WHERE state_code IS NOT NULL` with no validation against a known set of US codes. FM institution existed in `crawl_targets` with 0 fees but financial data.

### CU Asset Units
The seed command (`seed_institutions.py`) reads NCUA ACCT_010 (whole dollars) and divides by 1000 to "match FDIC." Then `enrich.py` checked if values >1M and divided by 1000 again. Net result: CU assets stored as 1/1000th of correct value. Navy Federal ($194B) stored as 194,179 instead of 194,179,276.

### Overdraft Misclassification
`normalize_fee_name()` in `fee_analysis.py` matched "Paid Items" to overdraft because the alias table lacked specificity for per-item processing charges at sub-$1 amounts.

## Solution

### Data Hygiene (Phase 1)

1. Added `US_STATES_ONLY`, `US_TERRITORIES`, `VALID_US_CODES`, `EXCLUDED_CODES` to `us-states.ts`
2. Updated `getStatesWithFeeData()` to filter by `VALID_US_CODES`
3. Fixed research page to show "50 states + 2 territories"
4. Deleted FM institution from crawl_targets
5. Created `hygiene.ts` with `getDataQualityReport()` and 7 quality check functions
6. Created `/audit-data` skill for repeatable data quality checks

### Data Cleansing (Phase 2)

- Ran `categorize` command: 2,623 fees auto-categorized
- Rejected 2,430 non-fee items (product names, insurance, account types)
- Set $0 on 850 free-service null amounts
- Flagged 3,664 null-amount extraction failures for re-extraction
- Deduplicated 460 duplicate fees
- Added 90+ new aliases to `fee_analysis.py`

### CU Classification Fix

```sql
-- Fixed by syncing asset_size from institution_financials (authoritative source)
UPDATE crawl_targets
SET asset_size = (
  SELECT ifin.total_assets
  FROM institution_financials ifin
  WHERE ifin.crawl_target_id = crawl_targets.id
  ORDER BY ifin.report_date DESC LIMIT 1
)
WHERE charter_type = 'credit_union';
```

Fixed `enrich.py` to sync from `institution_financials` instead of blindly dividing. Result: CUs now span all 6 tiers.

### Pipeline Visibility Page

Created `/admin/pipeline` with:
- Coverage funnel (8,750 -> 8,116 -> 2,575 -> 2,112)
- Sortable gaps table with status/charter/state filters
- Inline URL submission for missing fee schedules
- Bulk CSV import
- Quality cards + recent crawl feed

### Admin Nav Consolidation

Reorganized from 3 groups (11 items) to 4 groups (9 items):
- **Benchmarks**: Market, National, Peer, Categories, Districts
- **Data**: Pipeline, Review, Institutions
- **Research**: Research Hub

Merged Operations + Quality + Extracts into Pipeline.

### Research Content Studio

- Content Writer agent with long-form article generation
- Articles DB table with draft/published/archived workflow
- "Save as Draft" button in chat (5 drafts/day limit)
- Export CSV (markdown table parser) + Export Report (branded HTML/PDF)
- Public article pages at `/research/articles/[slug]`
- Inline Recharts bar charts auto-rendered from agent table output

### Agent Domain Skills

8 SKILL.md files that auto-inject methodology frameworks:
- fee-benchmarking, district-economic-outlook, fee-revenue-correlation
- competitive-intelligence, executive-report, consumer-guide
- monthly-pulse, data-quality-audit

Auto-detected via keyword matching — invisible to the user. Agent output quality dramatically improved when skill is active.

### Agent Tool Improvements

- `rankInstitutions` tool: answers "top 10 by X" in 1 tool call (was 6+)
- Fixed model ID: `claude-sonnet-4-5-20250514` -> `claude-sonnet-4-5-20250929`
- Review queue search now matches institution name (was fee name only)
- Sortable column headers on review table

## Prevention

1. **Unit validation**: `enrich.py` now syncs CU assets from `institution_financials` (authoritative) instead of guessing unit conversion
2. **State validation**: All geographic queries filter through `VALID_US_CODES`
3. **Fee amount validation**: Fees <$0.50 in overdraft category flagged for review
4. **Data quality skill**: `/audit-data` provides repeatable hygiene checks
5. **Pipeline page**: Coverage gaps visible to admin, URL submission enabled

## Files Changed

### New Files (18)
- `src/lib/crawler-db/hygiene.ts` — data quality queries
- `src/lib/crawler-db/pipeline.ts` — pipeline/coverage queries
- `src/lib/crawler-db/articles.ts` — articles CRUD
- `src/lib/research/skills.ts` — skill loader with auto-detection
- `src/app/admin/pipeline/` — 4 files (page, actions, coverage-table, loading)
- `src/app/admin/research/articles/` — 3 files (page, actions, article-actions)
- `src/app/admin/research/[agentId]/` — 3 new files (save-article-action, export-utils, chat-chart)
- `src/app/(public)/research/articles/[slug]/page.tsx` — public article pages
- `.claude/skills/` — 8 SKILL.md domain skill files

### Modified Files (15)
- `src/lib/us-states.ts` — state/territory classification
- `src/lib/crawler-db/geographic.ts` — filtered queries
- `src/lib/crawler-db/core.ts` — getPublicStats(), search fix
- `src/lib/research/agents.ts` — Content Writer agent, model fix, dynamic stats
- `src/lib/research/tools-internal.ts` — rankInstitutions tool
- `src/lib/research/history.ts` — research_articles table
- `src/app/api/research/[agentId]/route.ts` — skill injection, model fix
- `src/app/admin/admin-nav.tsx` — 4-group nav consolidation
- `src/app/admin/review/review-table.tsx` — sortable headers
- `src/app/admin/fees/catalog/page.tsx` — Max column
- `fee_crawler/fee_analysis.py` — 90+ new aliases
- `fee_crawler/commands/enrich.py` — CU asset sync fix
- `.env.example` — added ANTHROPIC_API_KEY, FRED_API_KEY

## Impact

- CU tier distribution: 100% community_small -> properly spans 6 tiers
- State count: 52 -> "50 states + 2 territories"
- Overdraft range: $0.15-$179.82 -> $1-$50
- Data cleaned: 4,834 records fixed
- Pipeline visibility: 6,175 missing institutions now visible in admin
- Agent quality: dramatically improved via domain skills
- Nav: 11 items -> 9 items in 4 clear groups
