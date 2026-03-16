# Smart Pipeline Control

## Problem

The pipeline is dumb:
1. Always processes institutions in asset_size DESC order (biggest first)
2. Re-crawls the same institutions every time
3. No way to "crawl what I just discovered"
4. No batch targeting (specific IDs or last-discover results)
5. 29% URL coverage after months -- need more control to increase it

## What the Admin Needs

### Mode 1: Target New Discoveries
"I just ran discover for FL and found 15 new URLs. Now crawl exactly those 15."

**Implementation:** Track which URLs were found in the last discover run. Add a `--new-only` flag to crawl that targets only institutions where `fee_schedule_url` was set in the last N minutes.

### Mode 2: Work a Segment End-to-End
"I want to fully process all Texas credit unions under $1B."

**Implementation:** The pipeline should accept `--state TX --charter-type credit_union --tier community_small,community_mid` and process ALL matching institutions through discover → crawl → categorize, skipping any that already have approved fees.

### Mode 3: Skip Already Done
"Don't re-crawl institutions that already have 5+ approved fees."

**Implementation:** Add `--skip-with-fees` flag that excludes institutions from the crawl queue if they have `N+` non-rejected fees. Default behavior for run-pipeline should be to skip institutions with existing fee data.

### Mode 4: Master Pipeline (Intelligent)
"Run the whole pipeline but be smart about it."

**Implementation:**
1. Discover: only target institutions WITHOUT a fee_schedule_url
2. Crawl: only target institutions WITH a url but WITHOUT fees (or stale >90 days)
3. Categorize: process all uncategorized fees
4. This is what the weekly GitHub Action cron should run

## Changes Needed

### Python CLI Changes

**`fee_crawler/commands/crawl.py`:**
```python
# Add --skip-with-fees flag
# Add --new-only flag (crawl_targets where fee_schedule_url was set recently)
# Change default ORDER to prioritize institutions WITHOUT fees first
```

**`fee_crawler/commands/discover_urls.py`:**
```python
# Add --skip-with-url flag (default: True) to skip institutions that already have a URL
# Track discover results in crawl_results or a new discovery_runs table
```

**`fee_crawler/commands/run_pipeline.py`:**
```python
# Smart mode: discover only no-URL, crawl only no-fees, categorize all
# Add --mode smart|force flag
```

### Admin UI Changes

**`src/app/admin/ops/ops-client.tsx`:**
- Add "Smart Pipeline" preset button (one-click, runs intelligent pipeline)
- Add tier filter dropdown (community_small, community_mid, community_large, regional, large_regional, super_regional)
- Add "New URLs Only" toggle for crawl command
- Add "Skip With Fees" toggle for crawl command
- Show last discover results count: "15 new URLs found in FL -- Crawl them?"

### Database Changes

None needed -- the data model supports this. Just need smarter queries:

```sql
-- Institutions needing discover (no URL yet)
SELECT * FROM crawl_targets WHERE fee_schedule_url IS NULL AND website_url IS NOT NULL

-- Institutions needing crawl (have URL, no fees)
SELECT * FROM crawl_targets ct
WHERE ct.fee_schedule_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM extracted_fees ef WHERE ef.crawl_target_id = ct.id AND ef.review_status != 'rejected')

-- Institutions needing re-crawl (stale >90 days)
SELECT * FROM crawl_targets
WHERE fee_schedule_url IS NOT NULL AND last_crawl_at < datetime('now', '-90 days')
```

## Pipeline Flow Visualization Update

After building smart pipeline, the pipeline page should show:

```
[Seed: 8,750] → [Need URL: 6,175] → [Need Crawl: 460] → [Need Category: 6,842] → [Need Review: 4,589]
                  ↑ discover            ↑ crawl              ↑ categorize             ↑ auto-review
```

Each stage shows a "Run" button that targets just that stage's backlog.

## Acceptance Criteria

- [ ] Discover skips institutions that already have a fee_schedule_url by default
- [ ] Crawl has --new-only flag to target recently-discovered URLs
- [ ] Crawl has --skip-with-fees flag (default: true for run-pipeline)
- [ ] Pipeline orders by "needs work" first, not by asset size
- [ ] Ops UI has tier dropdown for pipeline commands
- [ ] Ops UI has "Smart Pipeline" one-click button
- [ ] Ops UI shows "Crawl new URLs" quick action after discover completes
- [ ] Weekly GitHub Action uses smart mode

## Priority

This should be built before increasing crawl coverage. Without smart targeting, running the pipeline wastes API calls re-processing institutions that already have data.

## References

- Crawl command: `fee_crawler/commands/crawl.py:310-320` (ORDER BY asset_size DESC)
- Discover command: `fee_crawler/commands/discover_urls.py`
- Run pipeline: `fee_crawler/commands/run_pipeline.py`
- Ops client: `src/app/admin/ops/ops-client.tsx`
- Pipeline page: `src/app/admin/pipeline/page.tsx`
