# Admin Data Operations -- V2 Architecture (Deepened)

> **Deepened on:** 2026-03-16
> **Agents used:** Performance Oracle, Security Sentinel, TypeScript Reviewer, Data Integrity Guardian, Agent-Native Reviewer, Pattern Recognition, Spec Flow Analyzer, Best Practices Researcher, Python Reviewer, Code Simplicity Reviewer
> **Key finding:** ~95% of the UI is already built. The real gaps are backend data integrity, security, and structured job reporting.

---

## Enhancement Summary

### What's Actually Built (95%)
- Pipeline status bar with clickable stages + breakdowns
- Activity feed showing recent jobs with stdout parsing
- Action buttons (crawl gaps, categorize, auto-review, detect outliers, smart pipeline)
- Category coverage grouped by 9 families (collapsible, sortable, searchable)
- Coverage gaps table (sortable, filterable, inline URL edit, bulk import)
- Data sources refresh status (11 sources)
- Quality cards (uncategorized, null amounts, duplicates, failing)
- Review queue with keyboard nav (j/k/a/x), bulk operations
- Institution detail with URL edit + Crawl Now + View Source

### What's Actually Missing (The Real Gaps)
1. **Security holes** -- 2 server actions missing auth, no job concurrency cap
2. **Data integrity** -- No transactions in batch ops, manual approvals overridden by outlier-detect, no audit trail for auto-review
3. **Structured job results** -- `result_summary` column exists but is never populated
4. **Dead code / duplication** -- 2 unused files, 3 duplicate `timeAgo`, 6 components bypassing DB layer
5. **Performance** -- N+1 query (49 extra queries) in category coverage, ~15 redundant COUNTs

---

## Philosophy

Every action the admin takes should:
1. **Show what's happening** in real-time
2. **Show what happened** with clear results
3. **Show what needs attention** with actionable next steps
4. **Never lose information** between steps

The admin should never have to:
- Guess whether a job is still running
- Wonder if detected issues were actually addressed
- Visit multiple pages to complete one workflow
- Use CLI arguments or remember command names

---

## The Data Lifecycle

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  SEED   │ ──→ │ DISCOVER │ ──→ │  CRAWL   │ ──→ │ EXTRACT  │ ──→ │ VALIDATE │ ──→ │  SERVE   │
│         │     │          │     │          │     │          │     │          │     │          │
│ 8,750   │     │ Find fee │     │ Download │     │ LLM +    │     │ Bounds + │     │ Public   │
│ instit. │     │ schedule │     │ page or  │     │ Categor. │     │ Review + │     │ API +    │
│         │     │ URLs     │     │ PDF      │     │ + Rules  │     │ Approve  │     │ Index    │
└─────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │               │                │                │                │                │
     ▼               ▼                ▼                ▼                ▼                ▼
  crawl_targets   crawl_targets    crawl_results   extracted_fees   extracted_fees    Public
  (seeded)        (fee_schedule_   (document_url,  (fee_name,       (review_status    pages,
                   url set)        content_hash)   amount, etc.)    = approved)       API
```

---

## Implementation: Priority-Ordered Work Items

### DO NOT create a `feat/admin-ops-v2` branch. Work incrementally on `main`.

The plan originally proposed a multi-phase rewrite. All 10 reviewers agree: the UI is 95% built. The work is backend hardening, security fixes, and cleanup. Ship each item independently.

---

### Priority 0: Security Fixes (Do Today)

**P0-1. Add missing auth to `setFeeScheduleUrl` and `bulkImportUrls`**
- File: `src/app/admin/pipeline/actions.ts` (lines 52-127)
- Both are `"use server"` functions that write to the DB with NO auth check
- Every other action in the file calls `requireAuth()` -- these two were missed
- Impact: unauthenticated user can overwrite any institution's fee schedule URL
- Fix: Add `await requireAuth("edit")` as the first line of each function

**P0-2. Add job concurrency guard in `spawnJob()`**
- File: `src/lib/job-runner.ts`
- Currently no limit on concurrent jobs -- admin can accidentally spawn dozens
- Fix: Before spawning, check `SELECT COUNT(*) FROM ops_jobs WHERE status IN ('running', 'queued')`. If >= 3, return error.
- Also prevents two auto-review or outlier-detect jobs from running simultaneously (which causes data corruption via double-processing)

**P0-3. Add path validation to `tailFile` in ops API**
- File: `src/app/admin/ops/api/route.ts` (lines 6-24)
- `tailFile()` reads arbitrary file paths stored in DB with no validation
- Fix: Resolve path and verify it starts with `data/logs/`

**P0-4. Fix XSS in markdown link rendering**
- File: `src/app/admin/research/[agentId]/research-chat.tsx`
- `simpleMarkdown()` creates `<a href="...">` tags from AI output without protocol validation
- A crafted `[click](javascript:alert(1))` would execute
- Fix: Restrict link regex to only allow `https?://` prefixes

---

### Priority 1: Data Integrity (This Week)

**P1-1. Wrap single-fee actions in transactions**
- File: `src/lib/fee-actions.ts`
- `approveFee()` and `rejectFee()` do SELECT then UPDATE + INSERT without a transaction
- If process crashes between UPDATE and INSERT, fee status changes but no audit record
- Fix: Wrap in `db.transaction()` like `editAndApproveFee()` already does

**P1-2. Add audit trail to auto-review and outlier-detect**
- Files: `fee_crawler/commands/auto_review.py`, `fee_crawler/pipeline/outlier_detection.py`
- Both modify `review_status` for thousands of fees with ZERO entries in `fee_reviews`
- This breaks Workflow 5 (Investigate a Problem) -- admin can't see what was auto-decided or why
- Fix: Insert into `fee_reviews` with `action = 'auto_approve'/'auto_reject'/'auto_flag'` and `username = 'system'`

**P1-3. Protect manually-reviewed fees from outlier-detect override**
- File: `fee_crawler/pipeline/outlier_detection.py` (lines 193-224)
- Currently: outlier-detect can change an admin-approved fee to `flagged`
- This is the most dangerous data integrity issue -- human decisions silently reversed
- Fix: Before downgrading, check `fee_reviews` for a human approval (`username != 'system'`). Skip those fees.

**P1-4. Add transaction boundaries to batch Python commands**
- Files: `auto_review.py` (single commit at end), `outlier_detection.py` (individual UPDATEs), `categorize_fees.py` (batches but single commit)
- A crash mid-way leaves DB in inconsistent state
- Fix: Use `BEGIN IMMEDIATE` + batch commits every 500 rows
- The crawl command already does this correctly (`BEGIN IMMEDIATE` per institution) -- follow that pattern

**P1-5. Enable `PRAGMA foreign_keys = ON` in Python**
- File: `fee_crawler/db.py` (lines 419-425)
- Python `Database` class never sets `foreign_keys = ON`
- All FK constraints in the schema are NOT enforced on the Python side
- Fix: Add `self.conn.execute("PRAGMA foreign_keys = ON")` after connection

**P1-6. Add CHECK constraint on review_status**
- `ALTER TABLE extracted_fees ADD CHECK (review_status IN ('pending','staged','flagged','approved','rejected'))`
- Prevents typos in Python code from creating invalid states

---

### Priority 2: Structured Job Reporting (This Sprint)

**P2-1. Python: `##RESULT_JSON##` sentinel convention**
- Every Python command outputs a final line: `##RESULT_JSON##{"version":1,"command":"auto-review",...}`
- Base schema for all commands:
```json
{
  "version": 1,
  "command": "auto-review",
  "status": "completed|partial|failed",
  "duration_s": 12.3,
  "processed": 450,
  "succeeded": 420,
  "failed": 30,
  "skipped": 0
}
```
- Per-command extensions:
  - **crawl:** `fees_extracted`, `unchanged`, `institutions_failed`
  - **auto-review:** `auto_approved`, `auto_rejected`, `kept_staged`, `kept_flagged`
  - **outlier-detect:** `decimal_errors_rejected`, `statistical_outliers_flagged`
  - **categorize:** `matched`, `unmatched`
- Why stdout sentinel (not DB write from Python): Python commands don't know their `ops_jobs.id`. The Node.js job runner owns the job lifecycle. Keep them decoupled.

**P2-2. Node.js: Parse sentinel and write `result_summary`**
- File: `src/lib/job-runner.ts` `child.on("exit")` handler
- Scan `stdout_tail` for `##RESULT_JSON##` prefix, extract JSON, write to `result_summary`
- Fall back to `null` if no sentinel found (backward compat with old commands)

**P2-3. TypeScript: Type the `result_summary` column**
- Define discriminated union in `src/lib/crawler-db/pipeline.ts`:
```typescript
interface BaseResult { version: number; command: string; status: string; duration_s: number; processed: number; succeeded: number; failed: number; }
interface CrawlResult extends BaseResult { command: 'crawl'; fees_extracted: number; }
interface AutoReviewResult extends BaseResult { command: 'auto-review'; auto_approved: number; auto_rejected: number; }
type ResultSummary = CrawlResult | AutoReviewResult | ...;
```
- Add safe parser: `parseResultSummary(raw: string | null): ResultSummary | null`

**P2-4. Activity feed: Use `result_summary` when available**
- When `result_summary` is populated, display structured metrics directly
- Fall back to `extractKeyMetrics(stdout_tail)` for older jobs
- ~10 lines of new code in the activity feed component

**P2-5. Exit code convention**
- 0 = fully succeeded, 1 = fatal error, 2 = partial success
- Update `__main__.py` to return structured dicts from `run()` functions
- Update `job-runner.ts` to treat exit code 2 as `completed` with `result_summary.status = "partial"`

---

### Priority 3: Code Cleanup (This Sprint)

**P3-1. Delete dead code**
- `src/app/admin/pipeline/pipeline-flow.tsx` -- 95 lines, never imported by page.tsx. Duplicate of `pipeline-data.tsx` funnel.
- `src/app/admin/pipeline/activity-feed.tsx` -- 113 lines, never imported. `RecentJobs` component serves same purpose and IS used. (Verify `recent-jobs.tsx` is actually rendered first.)

**P3-2. Delete duplicate `timeAgo` functions**
- `data-sources-status.tsx` (lines 43-51) and `recent-jobs.tsx` (lines 42-50) both redefine `timeAgo`
- The canonical version at `src/lib/format.ts` already guards against empty/NaN dates
- Fix: Import from `@/lib/format` in both files

**P3-3. Extract SQL from `.tsx` files into DB layer**
- 6 components bypass the DB layer and run inline SQL via `getDb()` directly
- Move queries to `src/lib/crawler-db/pipeline.ts` as named, typed functions
- Files: `pipeline-data.tsx`, `category-coverage-data.tsx`, `data-sources-status.tsx`, `recent-jobs.tsx`
- This makes queries testable and eliminates data inconsistencies (e.g., website NULL check differs between `pipeline.ts` and `pipeline-data.tsx`)

**P3-4. Fix data inconsistencies between duplicate queries**
- Website check: `pipeline.ts` uses `IS NOT NULL` but `pipeline-data.tsx` uses `IS NOT NULL AND != ''`. Standardize on the stricter check.
- Failure threshold: `pipeline.ts` uses `> 3` but `pipeline-data.tsx` uses `>= 5`. Define constants: `FAILURE_THRESHOLD = 3`, `PERMANENT_FAILURE_THRESHOLD = 5`.

**P3-5. Remove unused props from `CoverageTable`**
- Interface declares `currentPage`, `totalPages`, `states` but component never uses them

**P3-6. Fix `font-mono` in activity-feed.tsx**
- Should be `tabular-nums` per design system (if file survives P3-1 deletion)

---

### Priority 4: Performance (Next Sprint)

**P4-1. Fix N+1 in category-coverage-data.tsx (CRITICAL)**
- Currently runs 49 separate `topStates` queries inside a `.map()` loop -- one per fee category
- Each query does JOIN + GROUP BY + ORDER BY on 65K extracted_fees
- At current scale: ~250ms. At 200K fees: ~750ms.
- Fix: Single query fetching all category-state pairs, partition in JS. Cuts 49 queries to 1.

**P4-2. Add composite index**
```sql
CREATE INDEX IF NOT EXISTS idx_fees_target_status
  ON extracted_fees(crawl_target_id, review_status);
```
- Speeds up all NOT IN / EXISTS subqueries in pipeline stats and coverage gaps
- 5 minutes of work, measurable improvement

**P4-3. Consolidate extracted_fees COUNTs**
- Pipeline page runs ~15 separate COUNT queries on `extracted_fees` with overlapping WHERE clauses
- Replace with a single aggregation query using CASE WHEN:
```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN review_status = 'approved' THEN 1 ELSE 0 END) as approved,
  SUM(CASE WHEN review_status = 'staged' THEN 1 ELSE 0 END) as staged,
  -- etc
FROM extracted_fees
```

**P4-4. Deduplicate `getPipelineStats` / `getPipelineData` overlap**
- Both count total_institutions, with_fees, with_approved independently
- Pass stats as props from page.tsx instead of re-fetching in components

**P4-5. Cache `DataSourcesStatus` refresh timestamps (5-min TTL)**
- 11 separate `MAX(date)` queries on slow-changing data
- Simple in-memory cache with timestamp

---

### Priority 5: Fee Change Tracking (Core Product Feature)

> "How many of your institutional peers have increased their prices over the last three months to a year? In my experience with my customers, market movements of peers is incredibly important."

This is not operational infrastructure -- it's **core product value** that justifies $499.99/mo. Tables already exist (`fee_snapshots`, `fee_change_events`) but are never populated.

**P5-1. Smart re-crawl: Compare, don't replace**
- Current behavior: `DELETE FROM extracted_fees WHERE crawl_target_id = ?` then re-extract (destroys all history)
- New behavior: Extract new fees into a temp staging area, then compare against existing approved fees
- For each fee category at that institution:
  - **Same amount**: Keep existing approved fee, skip review (don't redo manual work)
  - **Amount changed**: Snapshot old fee to `fee_snapshots`, create new fee as `staged`, insert `fee_change_events` record
  - **New category**: Insert as `staged` (normal new-fee flow)
  - **Category removed**: Keep old fee but flag as "not found in latest crawl"
- This means quarterly re-crawls only surface CHANGES for review, not the full fee schedule

**P5-2. Populate `fee_change_events` on re-crawl**
- Schema already exists:
```sql
fee_change_events (
  crawl_target_id, fee_category,
  previous_amount, new_amount,
  change_type,  -- 'increased', 'decreased', 'new', 'removed'
  detected_at
)
```
- Write a row for every price change detected during re-crawl
- This powers "X% of banks raised overdraft fees this quarter" analysis

**P5-3. Populate `fee_snapshots` before overwriting**
- Schema already exists:
```sql
fee_snapshots (
  crawl_target_id, crawl_result_id, snapshot_date,
  fee_name, fee_category, amount, frequency, conditions,
  extraction_confidence
)
```
- Before modifying any approved fee, copy it to `fee_snapshots` with today's date
- UNIQUE constraint on `(crawl_target_id, snapshot_date, fee_category)` prevents duplicates

**P5-4. Fee history query layer**
- Add to `src/lib/crawler-db/fees.ts`:
  - `getFeeHistory(institutionId, category)` -- returns snapshots + current fee over time
  - `getRecentPriceChanges(days, category?)` -- "what changed in the last 90 days?"
  - `getPriceMovementSummary(category, period)` -- "X% increased, Y% decreased, Z% unchanged"
- These queries power both admin investigation and public-facing market intelligence

**P5-5. Re-crawl review workflow**
- After a re-crawl with smart comparison, show only the diffs in the review queue
- Filter: `/admin/review?change_type=increased` to see only price increases
- This means the admin's quarterly re-crawl review is 50 changed fees, not 500 full re-reviews

**P5-6. Public-facing market intelligence (future)**
- "Fee Change Tracker" on public site showing quarterly price movements by category
- "Your peers changed" alerts for B2B customers
- This is the killer feature for retention -- customers can't get this elsewhere

---

### Priority 6: Operational Flexibility (Admin Decisions)

**P6-1. Default command order with independent override**
- Default "Data Quality Sweep" runs: categorize -> validate -> outlier-detect -> auto-review
- Each command also available independently for ad-hoc work
- Use cases for independent runs:
  - "I found one URL while traveling" -> just crawl that one institution
  - "I compiled 10 PDFs in a spreadsheet" -> bulk import URLs + crawl those 10
  - "I just want to check outliers" -> run outlier-detect alone
- The pipeline page shows both: "Run Full Sweep" button AND individual command buttons

**P6-2. Protect manual approvals from automated override**
- Decision: Outlier-detect must NOT downgrade fees that a human manually approved
- Implementation: Before changing `review_status`, check `fee_reviews` for a human approval (`username != 'system'`). Skip those fees.
- Automated approvals (from auto-review) CAN be overridden by outlier-detect
- This respects the admin's manual review work

**P6-3. Reversible decisions for re-crawl scenarios**
- The primary undo scenario is not "auto-review was wrong" but "re-crawl produced bad data"
- With smart re-crawl (P5-1), this is less of an issue because old fees are preserved
- Add admin-only `unstage` action (approved/rejected -> staged) with mandatory notes for edge cases

---

### Priority 7: Future Considerations (Defer)

**Defer: "Issues & Actions" panel**
- The existing stage breakdowns + quality cards + review link already cover this

**Defer: Merge all 5 pages into 1**
- Pipeline page is already 288 lines with 6 sections. Cross-links sufficient.

**Defer: Live log streaming (SSE/WebSocket)**
- For a single admin, `router.refresh()` after job completion is sufficient

**Defer: Per-institution quality score**
- A composite metric is a vanity number. Individual metrics are more actionable.

**Defer: Source document side-by-side in review**
- Admin can just open the source URL and compare manually.

**Defer: Agent-native pipeline operations**
- 0/16 write operations are agent-accessible today. Good primitives exist but need API routes.
- Worth doing when building the ops-agent, not as part of V2 UI work.

---

## Research Insights (from Best Practices Agent)

### From Dagster/Prefect/Airflow (Job Management)
- Show the pipeline funnel as a **persistent header strip**, not a one-time chart (already done)
- Recency is the primary health signal. Foreground "last run" timestamps with relative time.
- For single-admin: skip DAG visualization, complex scheduling UI, multi-tenant concurrency

### From Fivetran/dbt Cloud (Activity Feeds)
- Activity feed as a **reverse-chronological table**, not a card stream. Tables are scannable and sortable.
- Collapse consecutive successes: "15 successful crawls" as one row
- Emphasize **state transitions** over raw events ("went from 0 to 12 fees" > "crawl completed")

### From Monte Carlo/Soda (Data Quality)
- "Data quality is a pipeline problem, not a dashboard problem" -- quality checks should run at ingestion time
- Pass/Warn/Fail as universal status language (emerald/amber/red)
- Freshness as first-class metric: "oldest uncrawled institution" and "median data age"

### From Labelbox/Prodigy (Review Queues)
- Confidence-based routing: high-confidence auto-approve, low-confidence to human review (already done via auto-review)
- Keyboard-first interaction (already done: j/k/a/x)
- **Batch approve by confidence band**: "Approve all staged with confidence > 0.9"
- Default sort by impact: largest institutions first, then by fee category importance

### Idempotent Operations (from Prefect blog)
- Every operation should be safe to run twice
- Re-crawl uses delete-then-insert pattern (already done)
- Prevent double-runs with simple DB lock check (P0-2 above)

---

## Missing Workflows Identified by Spec Flow Analysis

### Workflow 6: "Quarterly Re-crawl and Price Change Review"
- Admin triggers "Re-crawl stale institutions" (>90 days since last crawl)
- Smart re-crawl compares new extraction against existing approved fees
- Only CHANGED fees enter the review queue (not the full fee schedule)
- Activity log: "Re-crawl JPMorgan: 3 fees changed (2 increased, 1 decreased), 20 unchanged"
- Admin reviews only the 3 changes, approves/rejects
- `fee_change_events` records the price movements for market intelligence
- This is the core loop for keeping data fresh without redoing all manual work

### Workflow 7: "Ad-hoc: I Found a URL While Traveling"
- Admin compiles URLs in a spreadsheet while on the road
- Uploads CSV via bulk import on pipeline page
- Clicks "Crawl" for those specific institutions
- No need to run full Data Quality Sweep -- just crawl + extract for the batch
- Individual commands available independently of the fixed sweep order

### Workflow 8: "Fix Systematic Miscategorization"
- Admin notices a category has wrong fees (e.g., "Monthly Service Charge" in `account_closing`)
- No workflow for fixing the root cause (alias mapping in `fee_analysis.py`) vs. fixing fees one-by-one
- Need: "Re-categorize all" button + ability to edit alias mappings from UI (future)

### Workflow 9: "Navigate from Crawl Result to Extracted Fees"
- After "Crawl Now" on peer detail, no link to the resulting fees
- Need: Deep link to `/admin/review?q={institution_name}&status=staged` in crawl completion message

---

## Decisions Made (2026-03-16)

1. **Outlier-detect must NOT override manual approvals.** Skip fees where `fee_reviews` has a human approval (`username != 'system'`). Automated approvals from auto-review CAN be overridden. (P6-2)

2. **Re-crawls must preserve fee history.** Compare new extraction against existing approved fees. Only surface CHANGES for review. Snapshot old amounts to `fee_snapshots`, record changes in `fee_change_events`. This is core product value -- peer price movements justify $499.99/mo. (P5-1 through P5-6)

3. **Default command order + independent override.** "Data Quality Sweep" runs categorize -> validate -> outlier-detect -> auto-review. Each command also available independently for ad-hoc work (single URL, small batch, just checking outliers). (P6-1)

4. **Reversible decisions for edge cases.** Admin-only `unstage` action with mandatory notes. Primary scenario is not "undo auto-review" but handling bad re-crawl data. Smart re-crawl (P5-1) makes this less critical since old fees are preserved by default. (P6-3)

---

## Success Criteria

The admin can:
1. Open `/admin/pipeline` and instantly know the state of everything (already works)
2. See what happened in the last 24 hours without checking multiple pages (works via activity feed, improves with `result_summary`)
3. Take action on any issue with one click (already works)
4. Verify extracted data against source documents (source URL link exists, side-by-side deferred)
5. Never encounter a job that ran but produced invisible results (requires P2-1 through P2-4)
6. **NEW:** Trust that automated decisions have an audit trail (requires P1-2)
7. **NEW:** Trust that manual approvals won't be silently overridden (requires P1-3)
8. **NEW:** Be unable to accidentally trigger duplicate concurrent jobs (requires P0-2)
9. **NEW:** Re-crawl an institution quarterly and only review what CHANGED (requires P5-1)
10. **NEW:** See "JPMorgan raised overdraft fees from $35 to $38" as a market event (requires P5-2)
11. **NEW:** Run individual commands ad-hoc without the full sweep (requires P6-1)
