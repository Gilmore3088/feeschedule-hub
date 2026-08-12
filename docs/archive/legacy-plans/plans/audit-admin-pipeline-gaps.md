# Admin Pipeline Gap Audit — 2026-03-16

## Honest Assessment

Across 10 plans and 165 total items, here's where we actually stand after today's work.

---

## Plans at 100% (No Gaps)

| Plan | Items |
|------|-------|
| feat-admin-hub-drill-down-navigation | 24/24 |
| feat-data-hygiene-pipeline | 12/12 |
| feat-coverage-drilldown-index-market | 15/15 |

These are done. No further work needed.

---

## Plans at 77-92% (Minor Gaps)

### feat-admin-ops-center (10/13 = 77%)
- Missing: Rate limiting (max crawls/hour) — low priority for single admin
- Missing: Concurrent job cap — **FIXED TODAY** (max 3 active jobs)
- Missing: Phase 3 URL testing/config view — deferred

### feat-auto-review-rules (11/12 = 92%)
- Missing: Verify backfill was actually run successfully

### feat-pipeline-visual-dashboard (8/9 = 89%)
- Missing: 8-week historical coverage trend chart (no snapshots table populated)

---

## Plans With Significant Gaps

### feat-admin-pipeline-visibility (5/8 = 62%)
**Still missing:**
- [ ] Dashboard summary card showing pipeline health at a glance
- [ ] "Crawl Now" integration from institution detail — **EXISTS** (fee-url-actions.tsx)
- [ ] Institution detail shows fee URL form — **EXISTS** (fee-url-actions.tsx)

**Corrected:** Actually 7/8 = 88%. The deferred items were built later.

### feat-unified-operations-workflow (was 1/11, now ~6/11 = 55%)
**Fixed today:**
- [x] Outlier-detect changes review_status to 'flagged' — done (P1-2/P1-3)
- [x] Outlier-detect auto-rejects decimal_error fees — done
- [x] Jobs write result_summary to ops_jobs — done (P2-1/P2-2)
- [x] Review table shows source URL — done (P39)
- [x] Pipeline page has data quality action buttons — done (quick-actions.tsx)

**Still missing:**
- [ ] Running outlier-detect then checking /admin/review shows new flagged items — **SHOULD WORK NOW** but untested
- [ ] No need to visit /admin/ops for pipeline operations — **MOSTLY DONE** (Quick Actions covers 9 commands, but ops still has 20+ and full logs)
- [ ] Coverage % tracked weekly — NOT DONE (no snapshots table populated)
- [ ] Stale institutions highlighted on pipeline page — **EXISTS** (stale filter on coverage table)
- [ ] Per-institution quality score — NOT DONE

### refactor-ui-first-pipeline (was 1/6, now ~4/6 = 67%)
**Fixed today:**
- [x] Pipeline backlog Run buttons with smart defaults — done (quick-actions.tsx)
- [x] --target-id support — was already done

**Still missing:**
- [ ] "Add Institution" form on pipeline page
- [ ] Tier dropdown in ops panel (low priority)

---

## admin-data-ops-v2 Architecture (was 2/55, now ~28/55 = 51%)

### P0 Security — 4/4 DONE TODAY
- [x] P0-1: Auth on setFeeScheduleUrl/bulkImportUrls
- [x] P0-2: Job concurrency guard (max 3)
- [x] P0-3: Path validation in tailFile
- [x] P0-4: XSS fix in simpleMarkdown

### P1 Data Integrity — 5/6 DONE TODAY
- [x] P1-1: Transaction wrappers on fee actions
- [x] P1-2: Audit trail for auto-review + outlier-detect
- [x] P1-3: Protect manual approvals from outlier-detect
- [x] P1-4: Transaction boundaries in Python batch commands
- [x] P1-5: PRAGMA foreign_keys in Python
- [ ] P1-6: CHECK constraint on review_status — DEFERRED (SQLite limitation)

### P2 Structured Reporting — 2/5 DONE TODAY
- [x] P2-1: ##RESULT_JSON## sentinel in Python commands
- [x] P2-2: Parse sentinel in job-runner.ts
- [ ] P2-3: Type result_summary as discriminated union — NOT DONE
- [ ] P2-4: Activity feed uses result_summary — PARTIAL (recent-jobs.tsx does, but no typed parsing)
- [ ] P2-5: Exit code convention (0/1/2) — NOT DONE

### P3 Code Cleanup — 4/6 DONE TODAY
- [x] P3-1: Delete dead files (pipeline-flow.tsx, activity-feed.tsx)
- [x] P3-2: Delete duplicate timeAgo functions
- [ ] P3-3: Extract SQL from .tsx files into DB layer — NOT DONE
- [x] P3-4: Fix data inconsistencies (NULL checks, failure thresholds)
- [x] P3-5: Remove unused CoverageTable props
- [ ] P3-6: Fix font-mono — N/A (file deleted)

### P4 Performance — 2/5 DONE TODAY
- [x] P4-1: Fix N+1 in category-coverage (49 queries -> 1)
- [x] P4-2: Add composite index idx_fees_target_status
- [ ] P4-3: Consolidate extracted_fees COUNTs — NOT DONE
- [ ] P4-4: Deduplicate getPipelineStats/getPipelineData — NOT DONE
- [ ] P4-5: Cache DataSourcesStatus (5-min TTL) — NOT DONE

### P5 Fee Change Tracking — 0/6 NOT STARTED
- [ ] P5-1: Smart re-crawl (compare, don't replace)
- [ ] P5-2: Populate fee_change_events on re-crawl
- [ ] P5-3: Populate fee_snapshots before overwriting
- [ ] P5-4: Fee history query layer
- [ ] P5-5: Re-crawl review workflow (only show diffs)
- [ ] P5-6: Public market intelligence

### P6 Operational Flexibility — 1/3 PARTIAL
- [x] P6-1: Default command order + independent override — done (quick-actions.tsx)
- [x] P6-2: Protect manual approvals — done (P1-3)
- [ ] P6-3: Reversible decisions / unstage action — NOT DONE

### UI Items — 4/4 DONE TODAY
- [x] Quick Actions panel (9 buttons + Run Full Pipeline)
- [x] Recent Jobs clickable with structured results
- [x] Failure reasons in coverage gaps table
- [x] Source URL link in review table
- [x] Category coverage table improved (full headers, summary strip, review links)

---

## What the Admin CANNOT Do Today (Real Gaps)

### Data Operations
1. **No fee change tracking** — re-crawling destroys old fees with no history
2. **No coverage trend over time** — can't see "are we improving?"
3. **Can't undo auto-review decisions** — no unstage/revert action
4. **Can't add a new institution** — no "Add Institution" form

### Discovery & Coverage
5. **Only 169 of 5,371 eligible institutions attempted** — 97% never tried
6. **11% discovery hit rate** — needs improvement (Playwright + deeper scan committed but untested at scale)
7. **No state-by-state discovery workflow** — must manually run per state

### Monitoring
8. **No real-time job progress on pipeline page** — must go to Ops Center
9. **No notifications** — admin doesn't know when overnight jobs finish or fail
10. **Data source refresh is view-only** — can't trigger refresh from status panel

### Review Workflow
11. **No "what changed" comparison for re-crawls** — all fees look new
12. **No per-institution bulk reject** — can't reject all fees from one bad crawl
13. **No confidence-band batch approve** — can't "approve all with confidence > 0.9"

---

## Corrected Summary Table

| Plan | Before Today | After Today | Gap |
|------|-------------|-------------|-----|
| feat-admin-hub-drill-down-navigation | 100% | 100% | 0 |
| feat-data-hygiene-pipeline | 100% | 100% | 0 |
| feat-coverage-drilldown-index-market | 100% | 100% | 0 |
| feat-auto-review-rules | 92% | 92% | 1 item |
| feat-pipeline-visual-dashboard | 89% | 89% | 1 item |
| feat-admin-ops-center | 77% | 85% | 2 items |
| feat-admin-pipeline-visibility | 62% | 88% | 1 item |
| refactor-ui-first-pipeline | 33% | 67% | 2 items |
| feat-unified-operations-workflow | 9% | 55% | 5 items |
| **admin-data-ops-v2 (Architecture)** | **4%** | **51%** | **27 items** |
| **OVERALL** | **54%** | **73%** | **39 items** |

---

## What Should Be Built Next (Priority Order)

### Tier 1: Directly impacts data quality and admin trust
1. **Fee change tracking (P5)** — core product value, 6 items
2. **Coverage trend snapshots** — track progress over time
3. **State-by-state discover workflow** — unlock 5,371 uninvestigated institutions

### Tier 2: Admin efficiency
4. **Confidence-band batch approve** — "approve all staged > 0.9 confidence"
5. **Per-institution bulk reject** — handle bad crawl results
6. **Unstage/revert action** — undo mistakes

### Tier 3: Polish
7. **Extract SQL from .tsx to DB layer** — testability
8. **Consolidate COUNT queries** — performance
9. **Add Institution form** — rare but useful
10. **Real-time job progress** — nice to have for single admin
