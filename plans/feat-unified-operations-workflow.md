# Unified Operations Workflow

## The Problem

The admin has 5 separate pages that don't talk to each other:

1. **Pipeline** (`/admin/pipeline`) -- shows coverage gaps and data sources
2. **Ops Center** (`/admin/ops`) -- triggers jobs with CLI-style interface
3. **Quality** (`/admin/quality`) -- shows data quality metrics
4. **Review** (`/admin/review`) -- manual fee review queue
5. **Fee Catalog** (`/admin/fees/catalog`) -- per-category drill-down

Each was built independently. Running outlier-detect on one page doesn't surface results on another. The admin has to mentally connect the dots.

## Current Data Lifecycle (Broken)

```
Seed → Discover → Download → Extract Text → LLM Extract → Store → Categorize → Validate → Review → Approve
                                                              ↓
                                                     (results lost between steps)
```

**What breaks:**
- Outlier-detect writes `validation_flags` but doesn't change `review_status` → invisible in review queue
- Auto-review approves/rejects but doesn't report what it did → admin doesn't know what changed
- Crawl succeeds with 0 fees but shows "Succeeded" → misleading
- Jobs complete but pipeline page doesn't update until manual refresh
- No "what happened last" summary anywhere

## The Three Questions

### 1. Are we getting all the information?

**Current coverage:**
- 8,750 institutions seeded
- 2,578 have fee schedule URLs (29%)
- 2,124 have extracted fees (24%)
- 53,884 approved fees

**Gaps:**
- 6,172 institutions have no fee URL
- 454 have URLs but no extracted fees
- Discovery hit rate: 14% (without Google search API)
- Large PDFs (>40K chars) were failing silently until today's fix

**What's needed:**
- Clear visibility into the funnel at every stage
- When a step fails, show WHY and offer a fix action
- Track coverage over time (is it improving?)

### 2. Is the data accurate?

**Current accuracy controls:**
- Per-category amount bounds (fee_amount_rules.py)
- Statistical outlier detection (IQR-based)
- Non-fee content filtering (NON_FEE_SUBSTRINGS)
- Auto-review (confidence + bounds checking)
- Manual review queue

**Gaps:**
- Outlier-detect results don't flow to review queue clearly
- No "accuracy score" per institution
- No way to compare extracted fees vs. the actual source document
- No tracking of extraction errors over time
- No "this institution's data looks wrong" flag

**What's needed:**
- Every fee links back to its source URL
- Side-by-side: extracted data vs. source document
- Institution-level quality score
- Clear flow: detect issue → flag → review → resolve

### 3. How do we maintain it ongoing?

**Current automation:**
- GitHub Actions: daily refresh-data, weekly crawl pipeline
- Auto-review runs as Stage 4 of pipeline
- Categorize runs as Stage 3

**Gaps:**
- No re-crawl schedule for stale data (>90 days)
- No automatic detection of URL changes (fee schedule moved)
- No monitoring of extraction quality over time
- No alerting when coverage drops or error rate spikes

**What's needed:**
- Dashboard showing "health over time"
- Automatic re-crawl of stale institutions
- Alert when extraction failure rate exceeds threshold
- Weekly quality report (what improved, what degraded)

## Proposed Unified Workflow

### Single Pipeline Dashboard

Replace the 5 separate pages with one unified operations view:

```
/admin/pipeline (single page, 4 sections)

┌─────────────────────────────────────────────────────────────┐
│ PIPELINE STATUS (existing unified bar - keep)                │
│ [Discover 29%] → [Crawl 24%] → [Categorize 89%] → [Review] │
│ [Run Smart Pipeline]                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ RECENT ACTIVITY (new - shows what happened)                  │
│                                                               │
│ 10 min ago  Crawl #28: Truist Bank → 48 fees (43 approved)  │
│ 2 hrs ago   Auto-Review: 6,331 approved, 1,916 rejected     │
│ 2 hrs ago   Outlier-Detect: 1,073 flagged                   │
│ Today       Coverage: 2,124 → 2,127 institutions (+3)       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ACTION CENTER (replaces ops panel for pipeline commands)      │
│                                                               │
│ [Crawl Gaps (454)]  [Categorize (4,935)]  [Auto-Review]      │
│ [Detect Outliers]   [Validate All]        [Enrich]           │
│                                                               │
│ Filters: [State ▼] [Charter ▼]                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CATEGORY COVERAGE (existing grouped table - keep)            │
│ DATA SOURCES (existing refresh status - keep)                │
│ COVERAGE GAPS TABLE (existing - keep)                        │
└─────────────────────────────────────────────────────────────┘
```

### Fix Outlier → Review Flow

When `outlier-detect` runs:
1. Set `validation_flags` (current behavior)
2. **Also set `review_status = 'flagged'`** for fees above hard ceiling
3. Show a summary: "1,073 outliers detected: 307 decimal errors (auto-rejected), 766 statistical outliers (flagged for review)"
4. Link to review page filtered to outliers

### Fix Job Result Reporting

Every job should:
1. Write a `result_summary` JSON to `ops_jobs` with key metrics
2. Show the summary in the ops panel when the job completes
3. Show a notification banner on the pipeline page: "Last job: Crawl #28 → 48 fees from Truist Bank"

### Source Document Linking

Every extracted fee should link to its source:
1. `crawl_results.document_url` already stores the source URL
2. Show "View source" on every fee in the review table
3. On institution detail, show the fee schedule PDF/page link prominently

## Implementation Priority

### Phase 1: Fix the broken flows (immediate)
1. **Outlier-detect → review flow**: change review_status when flags are set
2. **Job result summaries**: write result_summary JSON to ops_jobs
3. **Source links in review table**: show document_url for each fee

### Phase 2: Unified action center
4. **Action buttons on pipeline page**: all data quality commands as one-click buttons (partially done)
5. **Recent activity feed**: show last 5 job results with key metrics
6. **Remove separate ops page for pipeline commands**: pipeline page becomes the hub

### Phase 3: Ongoing monitoring
7. **Coverage tracking over time**: weekly snapshot of coverage %
8. **Stale data detection**: flag institutions not crawled in 90+ days
9. **Quality score per institution**: based on flag rate, outlier count, confidence

## Acceptance Criteria

### Phase 1
- [ ] Outlier-detect changes review_status to 'flagged' for hard ceiling violations
- [ ] Outlier-detect auto-rejects decimal_error fees
- [ ] Jobs write result_summary to ops_jobs table
- [ ] Review table shows source document URL for each fee
- [ ] Running outlier-detect then checking /admin/review shows new flagged items

### Phase 2
- [ ] Pipeline page has all data quality actions as buttons (not just crawl/categorize/review)
- [ ] Recent activity feed shows last 5 completed jobs with key metrics
- [ ] No need to visit /admin/ops for pipeline operations

### Phase 3
- [ ] Coverage % tracked weekly in a table/chart
- [ ] Stale institutions highlighted on pipeline page
- [ ] Per-institution quality score visible on peers page

## References

- Outlier detection: `fee_crawler/pipeline/outlier_detection.py`
- Auto-review: `fee_crawler/commands/auto_review.py`
- Validation: `fee_crawler/validation.py`
- Fee amount rules: `fee_crawler/fee_amount_rules.py`
- Pipeline page: `src/app/admin/pipeline/page.tsx`
- Review page: `src/app/admin/review/page.tsx`
- Ops page: `src/app/admin/ops/ops-client.tsx`
