# Smart Pipeline Control — Enhanced

## Current Pipeline Reality

```
8,750 institutions total

DISCOVER                    CRAWL                      CATEGORIZE               REVIEW
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐     ┌──────────────────┐
│ No website: 634  │       │ Has URL,         │       │ Uncategorized:   │     │ Staged: 11,240   │
│ Need discover:   │  →→→  │ no fees: 490     │  →→→  │ 4,782            │ →→→ │ Flagged: 4,579   │
│ 5,538            │       │                  │       │                  │     │ Approved: 47,066 │
│ Has URL: 2,578   │       │ Done: 2,088      │       │ Categorized:     │     │                  │
│                  │       │ Stale: 0         │       │ 58,103           │     │                  │
└──────────────────┘       └──────────────────┘       └──────────────────┘     └──────────────────┘
     29% coverage              24% with fees            89% categorized          75% approved
```

### Discovery Method Effectiveness
- Sitemap scan: 14% success (3/21)
- Common path: 0% (0/18)
- Link scan: 0% (0/16)
- Deep scan: 0% (0/16)

**Discovery is terrible.** 14% best case. The SERPAPI search (disabled — needs API key) would dramatically improve this. Google site: search is the most reliable way to find fee schedules.

### Top Crawl Failure Reasons
- No text extracted: 182 (PDF parsing failures)
- Rate limited (429): 62 (too many concurrent API calls)
- No fee keywords: 19 (wrong page crawled)
- 404/403: 27 (URL went stale or blocked)
- Redirected to login: 13

### States with Most Uncrawled URLs
CA: 38, TX: 37, NY: 34, FL: 28, IL: 23, PA: 22, NJ: 22

## Problems (Expanded)

1. **Pipeline always re-processes the same institutions** — ordered by asset_size DESC
2. **No "crawl what I just discovered"** — 490 institutions have URLs but no fees, sitting idle
3. **Discovery hit rate is 0-14%** — sitemap is only working method; SERPAPI disabled
4. **No visibility into what needs work** — admin can't see the backlog breakdown
5. **No batch targeting** — can't target specific IDs, last-discover results, or "uncrawled only"
6. **Crawl failures not surfaced** — 182 PDF failures, 62 rate limits not visible in UI
7. **No cost tracking** — LLM API spend per crawl run not tracked
8. **No progress during job execution** — live logs just added but no stage indicators

## Enhanced Solution

### Phase 1: Smart Defaults (Python CLI)

**Make the pipeline intelligent without any UI changes:**

#### `discover_urls.py` — Skip already-discovered
```python
# Default: WHERE fee_schedule_url IS NULL AND website_url IS NOT NULL
# --force flag overrides to re-discover
# --skip-discovered (default: True)
```

#### `crawl.py` — Skip already-crawled, prioritize gaps
```python
# Default: WHERE fee_schedule_url IS NOT NULL AND NOT EXISTS (fees)
# ORDER BY: no-fees first, then stale, then by asset_size
# --skip-with-fees (default: True for run-pipeline, False for direct crawl)
# --new-only (only institutions where fee_schedule_url was set in last 24h)
# --tier community_small,community_mid (comma-separated filter)
```

#### `run_pipeline.py` — Smart mode
```python
# --mode smart (default): discover no-URL → crawl no-fees → categorize all
# --mode force: re-process everything (current behavior)
# Each stage prints: "Stage 1: Discovering 5,538 institutions without URLs..."
# Each stage prints completion stats: "Found 23 new URLs (0.4% hit rate)"
```

### Phase 2: Pipeline Dashboard (Admin UI)

**Replace the current pipeline page header with an actionable backlog view:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  PIPELINE BACKLOG                                            [Run Smart Pipeline]  │
│                                                                                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │ DISCOVER    │ → │ CRAWL       │ → │ CATEGORIZE  │ → │ REVIEW      │           │
│  │             │   │             │   │             │   │             │           │
│  │ 5,538       │   │ 490         │   │ 4,782       │   │ 15,819      │           │
│  │ need URL    │   │ need crawl  │   │ uncat'd     │   │ need review │           │
│  │             │   │             │   │             │   │             │           │
│  │ [Run ▶]    │   │ [Run ▶]    │   │ [Run ▶]    │   │ [Auto ▶]   │           │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘           │
│                                                                                     │
│  Last run: 13m ago | Discover: 0 found | Crawl: 5/10 succeeded | 159 fees          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

Each "Run" button:
- **Discover**: Opens ops panel pre-filled with `discover --skip-discovered --limit 100`
- **Crawl**: Opens ops panel pre-filled with `crawl --skip-with-fees --limit 50`
- **Categorize**: Runs inline (instant, no API calls)
- **Auto-review**: Runs validate + outlier-detect inline

**Below the backlog bar:** The existing coverage funnel, gaps table, and data sources status.

### Phase 3: Enhanced Ops Panel

#### Tier Filter
Add asset tier multi-select alongside State and Charter:
```
Limit: [10]   Charter: [All ▼]   State: [FL ▼]   Tier: [Community Small, Community Mid ▼]
```

#### Smart Toggles
For pipeline commands, show toggles:
```
☑ Skip with existing fees (default: on)
☑ Skip with existing URL (for discover, default: on)
☐ New URLs only (crawl recently discovered)
```

#### Post-Job Actions
When a discover job completes and found N new URLs:
```
┌──────────────────────────────────────────────────────────────┐
│ ✓ Discover complete: 15 new URLs found in FL                 │
│                                                               │
│ [Crawl These 15 ▶]   [View in Pipeline]   [Dismiss]        │
└──────────────────────────────────────────────────────────────┘
```

#### Job Detail Panels
Running jobs show:
```
┌──────────────────────────────────────────────────────────────┐
│ run-pipeline #4                                    [Cancel]  │
│ Stage: Crawl (2 of 3)           Elapsed: 4m 23s              │
│ Progress: 7/10 institutions     Fees found: 89               │
│ ████████████████░░░░░ 70%                                    │
│                                                               │
│ [7/10] Wells Fargo Bank (SD) html  15 fees (12 approved)     │
│ [6/10] U.S. Bank (OH) html  18 fees (18 approved)           │
│ [5/10] JPMorgan Chase (OH) html  LLM FAILED: 400            │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Phase 4: Coverage Strategy Tools

#### State Coverage Heatmap
On the pipeline page, show a US map colored by coverage percentage:
- Green: >50% of state's institutions have fees
- Yellow: 20-50%
- Red: <20%
- Clickable: click a state → pre-fills ops panel with that state

#### "Work a State" Workflow
One-click button per state that runs: `run-pipeline --state XX --mode smart --limit 50`

#### Discovery Strategy Enhancement
Show which discovery methods work and suggest improvements:
```
Discovery Success Rates:
  Google site: search   — Not configured (set SERPAPI_API_KEY)
  Sitemap scan          — 14% (3/21)
  Common path (/fees)   — 0% (0/18)
  Link scan             — 0% (0/16)

💡 Enable Google search to improve discovery from 14% to ~60%
   Set SERPAPI_API_KEY in .env.local
```

## Implementation Priority

### Build First (Python CLI — unlocks everything)
1. `--skip-with-fees` flag on crawl (default: True for run-pipeline)
2. `--skip-discovered` flag on discover (default: True)
3. Smart ordering: no-fees first, then stale, then asset_size
4. Smart mode for run-pipeline
5. `--tier` filter on crawl and discover

### Build Second (Admin UI — visibility)
6. Pipeline backlog bar with stage counts and "Run" buttons
7. Tier filter dropdown in ops panel
8. Smart toggles (skip-with-fees, skip-discovered, new-only)
9. Post-job action buttons ("Crawl these N")

### Build Third (Polish)
10. State coverage heatmap on pipeline page
11. "Work a State" one-click workflow
12. Discovery strategy recommendations
13. Progress bar for running jobs (requires structured log parsing)

## Acceptance Criteria

### Phase 1: Smart Defaults
- [ ] Discover skips institutions with existing fee_schedule_url by default
- [ ] Crawl skips institutions with existing fees by default (in run-pipeline)
- [ ] Crawl supports `--new-only` flag for recently-discovered URLs
- [ ] Crawl supports `--tier` filter
- [ ] Pipeline orders by "needs work" first
- [ ] Smart mode: discover→crawl→categorize each targets only its backlog
- [ ] Each stage prints clear summary: "Found 23 URLs" / "Extracted 159 fees"

### Phase 2: Pipeline Dashboard
- [ ] Backlog bar shows counts for each stage (discover, crawl, categorize, review)
- [ ] Each stage has "Run" button that pre-fills ops panel
- [ ] "Run Smart Pipeline" button runs full intelligent pipeline
- [ ] Last run summary shown below backlog bar

### Phase 3: Enhanced Ops
- [ ] Tier filter dropdown for pipeline commands
- [ ] Smart toggles for skip-with-fees, skip-discovered
- [ ] Post-discover "Crawl These N" action button
- [ ] Running jobs show stage, progress count, and fees found

### Phase 4: Coverage Strategy
- [ ] State coverage heatmap or table with click-to-run
- [ ] Discovery strategy panel with method effectiveness
- [ ] "Work a State" one-click workflow

## Cost Considerations

Each crawl uses Claude API for LLM extraction:
- ~$0.05-0.20 per institution (depending on document size)
- 490 institutions needing crawl ≈ $25-100
- 5,538 institutions needing discover ≈ $0 (no LLM, just HTTP requests)
- Smart mode prevents wasting $$ on re-processing

## References

- Crawl command: `fee_crawler/commands/crawl.py:310-320`
- Discover command: `fee_crawler/commands/discover_urls.py`
- Run pipeline: `fee_crawler/commands/run_pipeline.py`
- LLM extraction: `fee_crawler/pipeline/extract_llm.py`
- Ops client: `src/app/admin/ops/ops-client.tsx`
- Pipeline page: `src/app/admin/pipeline/page.tsx`
- Quality page: `src/app/admin/quality/page.tsx`
- Discovery cache: `fee_crawler/db.py` (discovery_cache table)
