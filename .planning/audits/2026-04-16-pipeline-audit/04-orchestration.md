# Orchestration, Automation, and Compounding — Current State Map

## Executive Summary

The orchestration layer (Phases 19–22) ships a wave-orchestrated, iteratively deepening, knowledge-compounding pipeline. However, the implementation is **partially complete and decoupled from Modal workers**. Modal runs three standalone cron jobs (PDF extraction at 0 3 UTC, browser extraction at 0 4 UTC, post-processing at 0 6 UTC) that invoke plain `crawl` commands with fixed institution limits—not the wave orchestrator. The wave system exists in code (orchestrator.py, iterative deepening via tier escalation, knowledge promotion) but **is NOT scheduled** and **must be manually triggered** via CLI. This creates a two-tier pipeline: nightly commodity extractions + optional manual campaigns. Compounding (knowledge reuse, cross-state pattern promotion, pass-to-pass learning) is implemented but orphaned from the scheduled path.

---

## Scheduled Workers

### Modal cron schedules (proof from code)

**Currently deployed (5 cron slots, all in use):**

1. **`run_discovery()` at 0 2 UTC (2 AM ET)**
   - Location: `fee_crawler/modal_app.py:92–101`
   - Decoration: `@app.function(schedule=modal.Cron("0 2 * * *"), timeout=21600, ...)`
   - Invokes: `fee_crawler/workers/discovery_worker.py::run(concurrency=20)`
   - What it does: Async discovery worker pulls from jobs queue, processes ~20 concurrent institutions, updates fee_schedule_url and document_type on success
   - Status: Runs. Does NOT integrate with wave orchestrator or state_agent

2. **`run_pdf_extraction()` at 0 3 UTC (3 AM ET)**
   - Location: `fee_crawler/modal_app.py:104–121`
   - Decoration: `@app.function(schedule=modal.Cron("0 3 * * *"), timeout=10800, ...)`
   - Invokes: `["python3", "-m", "fee_crawler", "crawl", "--limit", "500", "--workers", "4", "--include-failing", "--doc-type", "pdf"]`
   - What it does: Fixed-limit crawl of 500 PDF institutions with 4 concurrent workers. Fetch, classify, extract stages; does not invoke state_agent
   - Status: Runs. Does NOT use iterative deepening or pass-based strategy escalation

3. **`run_browser_extraction()` at 0 4 UTC (4 AM ET)**
   - Location: `fee_crawler/modal_app.py:124–140`
   - Decoration: `@app.function(schedule=modal.Cron("0 4 * * *"), timeout=14400, ...)`
   - Invokes: `["python3", "-m", "fee_crawler", "crawl", "--limit", "500", "--workers", "2", "--include-failing"]`
   - What it does: Fixed-limit crawl of 500 institutions (all doc types, includes failing URLs). 2 concurrent workers (Playwright overhead)
   - Status: Runs. Does NOT use state-by-state orchestration

4. **`run_post_processing()` at 0 6 UTC (6 AM ET)**
   - Location: `fee_crawler/modal_app.py:143–174`
   - Decoration: `@app.function(schedule=modal.Cron("0 6 * * *"), timeout=3600, ...)`
   - Invokes: Sequential subprocess calls to:
     - `python3 -m fee_crawler categorize`
     - `python3 -m fee_crawler auto-review`
     - `python3 -m fee_crawler snapshot`
     - `python3 -m fee_crawler publish-index`
   - Plus: Data integrity checks (`fee_crawler/workers/data_integrity.py::run_checks()`) and daily report generation (`fee_crawler/workers/daily_report.py::generate_report()`)
   - Status: Runs. Calls `revalidate()` at `BFI_APP_URL/api/revalidate` if env vars set (line 158–162 in publish_index.py)

5. **`ingest_data()` at 0 10 UTC (10 AM ET)**
   - Location: `fee_crawler/modal_app.py:177–230`
   - Decoration: `@app.function(schedule=modal.Cron("0 10 * * *"), timeout=7200, ...)`
   - Invokes: Daily ingestion commands (FRED, NYFED, BLS, OFR) + weekly on Mondays (FDIC, NCUA, CFPB, SOD, Beige Book, Call Reports, Census ACS) + quarterly Feb 15/May 15/Aug 15/Nov 15 (Call Reports + NCUA)
   - Status: Runs. Subprocess with retry-on-failure pattern (SubprocessFailed exception, logged but continues on soft failure)

**Not scheduled (but code exists):**

- **`run_monthly_pulse()` at manual trigger only**
  - Location: `fee_crawler/modal_app.py:436–488`
  - Comment: "Modal free tier capped at 5 cron slots and all five are taken... Invoke this function manually"
  - Status: Code present, not scheduled. Requires manual `modal run fee_crawler/modal_app.py::run_monthly_pulse`

---

## Wave Orchestrator — Current State

### How it is (or is not) invoked

The wave orchestrator **exists in code but is not called by any Modal cron job**. It must be manually triggered via CLI:

```bash
python -m fee_crawler wave run [--states WY,MT] [--wave-size 8] [--max-passes 3]
python -m fee_crawler wave recommend
python -m fee_crawler wave resume <wave_id>
python -m fee_crawler wave report <wave_id>
```

Code location: `fee_crawler/wave/cli.py::cmd_wave_*()` functions. Caller: `fee_crawler/__main__.py` (lines 1233–1293).

**Why decoupled?** Modal free tier limit: 5 cron slots maximum. All five are taken by discovery, PDF extraction, browser extraction, post-processing, and data ingestion. Wave orchestrator would be the 6th slot. Design choice (Phase 19, D-03): run via CLI or manual trigger from `/admin/hamilton`, not as a standalone cron.

### How iterative deepening works in practice

**Proof from code:** `fee_crawler/agents/strategy.py` + `fee_crawler/wave/orchestrator.py::_run_single_state()` (lines 96–233) + `fee_crawler/agents/state_agent.py::run_state_agent()` (lines 57–247).

**Pass structure:**

- **Pass 1 (TIER1):** Sitemap + common fee schedule URL paths (e.g., `/fee-schedule`, `/disclosures`) — fast, cheap
  - Strategy settings: `use_sitemap=True, use_common_paths=True, use_deep_crawl=False, use_pdf_hunt=False, use_keyword_search=False`
  - Purpose: Quick sweep for institutions with publicly advertised fee URLs
  - Targets: All active institutions without extracted fees (pass 1) or institutions with NULL fee_schedule_url (passes 2+)

- **Pass 2 (TIER2):** Sitemap + common paths + deep link crawl (2+ levels from fee-keyword pages) + aggressive PDF scoring
  - Strategy settings: `use_sitemap=True, use_common_paths=True, use_deep_crawl=True, use_pdf_hunt=True, use_keyword_search=False`
  - Purpose: Deeper exploration for institutions with non-standard URL structures or JS-rendered fee schedules
  - Targets: Only institutions without successful extraction from Pass 1 (state_agent.py lines 88–101)

- **Pass 3+ (TIER3):** All of above + site-internal keyword search (probing /search?q=fee+schedule on institution domain)
  - Strategy settings: All True
  - Purpose: Exhaustive search for hardest-to-find institutions
  - Targets: Same as Pass 2 (remaining incomplete)

**How pass N differs from N-1:** Each subsequent pass has `use_deep_crawl=True` and `use_pdf_hunt=True`, expanding the discovery surface. Pass 3 adds `use_keyword_search=True`. The state_agent narrows the target list (lines 88–101): pass 2+ only processes institutions without successful extraction.

**Escalation trigger:** `tier_for_pass()` in strategy.py (lines 81–92) maps pass number to strategy. Called by wave orchestrator after each pass completes (orchestrator.py line 145).

### What "passes" mean and how the system knows when to stop

**Default:** 3 passes per state (`DEFAULT_MAX_PASSES = 3` in strategy.py line 72). Configurable at CLI: `--max-passes N` (validated to [1, 10] per phase requirement T-20-04).

**Early stop rule:** Minimum 3 passes enforced even on high-coverage states. AFTER pass 3, if coverage >= 90% (`EARLY_STOP_COVERAGE_PCT`), stop. Code: orchestrator.py lines 184–194.

Coverage calculation (orchestrator.py lines 70–93):
```sql
SELECT
  COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0)
FROM crawl_targets
WHERE state_code = %s AND status = 'active'
```

So: "% of institutions with a discovered fee_schedule_url" = coverage. Measured from DB after each pass.

**Resume support:** If a wave is interrupted, `resume_wave()` (orchestrator.py lines 316–393) restarts only incomplete states, resuming from their last_completed_pass + 1. Tracked in `wave_state_runs.last_completed_pass` (models.py lines 278–291).

### What state persists between waves

Two tables track wave execution:

1. **`wave_runs`** (models.py lines 47–59):
   - `id`, `states` (list), `wave_size`, `total_states`, `completed_states`, `failed_states`, `status` (pending/running/complete/failed), `created_at`, `completed_at`, `campaign_id`
   - Created by `create_wave_run()` (models.py lines 95–136)
   - Updated by `run_wave()` (orchestrator.py lines 266–313)

2. **`wave_state_runs`** (models.py lines 62–73):
   - Per-state entry: `id`, `wave_run_id`, `state_code`, `status`, `agent_run_id`, `started_at`, `completed_at`, `error`, **`last_completed_pass`**
   - `last_completed_pass` is the key resume field: updated after each pass by `update_wave_state_pass()` (models.py lines 249–275)

**Example resume flow:**
1. Wave 42 runs CA, WY, TX
2. CA pass 1–2 complete, WY pass 1 complete, TX fails on pass 1
3. Wave interrupted (hard failure or timeout)
4. `wave_resume(42)` called: queries `wave_state_runs` for status != 'complete', finds CA (last_completed_pass=2), WY (0), TX (0)
5. Restarts CA from pass 3, WY from pass 1, TX from pass 1

---

## Knowledge Compounding

### What gets learned (formats, selectors, extraction tips)

After each pass, `run_state_agent()` collects learnings in a list and calls `write_learnings()` (state_agent.py line 245).

**Learnings structure** (state_agent.py lines 120–122):
```python
learnings = []  # list of dicts with keys:
#  "pattern": str (new discovery or extraction pattern found)
#  "site_note": str (institution-specific note, e.g. "uses WordPress")
#  "national": str (pattern valuable enough to promote to all states)
```

**Populated by:** Extract agents (extract_pdf.py, extract_html.py, extract_js.py) which detect patterns (e.g., "Banno platform uses selector `.fee-table`") and append to learnings. Code references: agents/extract_*.py return `{"learnings": [...]}`; state_agent collects them (lines 185–237).

**Written to:** `fee_crawler/knowledge/states/<STATE_CODE>.md` (file system, not DB). Format: Markdown with run metadata and sections for "New Patterns", "Site Notes", "Promoted to National".

Example entry (from loader.py line 63–64):
```markdown
## Run #42 -- Pass 2 (tier2) — 2026-04-16
Discovered: 143 | Extracted: 98 | Failed: 45 | Coverage: 82.3%

### New Patterns
- Banno fee schedule is always under /banno-fees
- PDF tables use td[data-fee-type] selector

### Site Notes
- Small CUs often don't publish online (in-branch only)

### Promoted to National
- Chase uses consistent /biz/fees URL structure
```

### Where learnings are stored

**State-level:** `fee_crawler/knowledge/states/<STATE_CODE>.md` (file system). Appended by `write_learnings()` in loader.py lines 36–84.

**National-level:** `fee_crawler/knowledge/national.md`. Two paths:
1. Promoted by state_agent if a learning has `"national"` key (loader.py lines 74–79)
2. Promoted cross-state by `promote_cross_state_patterns()` (promoter.py lines 15–107) after a wave completes if a pattern appears in 3+ states

**Pruning:** `fee_crawler/knowledge/pruner.py` provides `should_prune_state()` and `prune_national()` (checking token budget and auto-pruning). Called after promotion (promoter.py line 102).

### How learnings are applied on the NEXT crawl

**Proof of flow:**

1. **Load phase:** `run_state_agent()` line 115: `knowledge = load_knowledge(state_code)` reads `national.md` + `states/<STATE_CODE>.md` as a single context string
2. **Pass to discover:** Line 143: `discover_url(inst_name, website_url, knowledge=knowledge, strategy=strategy)` injects knowledge into the discover agent
3. **In discover:** `fee_crawler/pipeline/url_discoverer.py` uses knowledge as a context hint (e.g., "WordPress sites often store PDFs in /wp-content") to rank PDF candidates and guide search strategy
4. **Write learnings:** After the pass, new patterns are written to the state file (lines 241–245)
5. **Next pass:** When pass N+1 runs, `load_knowledge()` re-reads the file, now including pass N's learnings

**Evidence:** State files accumulate run blocks, each with its own "New Patterns" section. Cross-state promotion via `promote_cross_state_patterns()` (promoter.py) runs as part of wave completion (orchestrator.py line 312: `print_wave_report(conn, wave.id)` calls reporter, which should trigger promotion — though link not explicit in code, see gap below).

### Gaps — what SHOULD be learned but isn't

1. **No explicit wave-completion hook for promotion:** `run_wave()` calls `print_wave_report()` (line 312), but promoter.py is NOT called automatically. `promote_cross_state_patterns()` must be invoked manually:
   ```bash
   python -m fee_crawler knowledge promote [--min-states 3]
   ```
   No Modal cron job or wave post-processing step triggers this. Promoted patterns are orphaned.

2. **No feedback from Hamilton to crawling:** Hamilton agents consume fee data but do not surface discovery or extraction insights back into the crawler. E.g., if a report detects that a category is missing for a state, no job is created to re-crawl that state.

3. **No learning from failed extractions:** When extraction fails (confidence too low, or extraction returns NULL), no diagnostic is captured to improve future passes. The failed institution is merely marked for re-try; no pattern about WHY it failed is recorded.

4. **No A/B comparison between passes:** The state file records raw stats (discovered, extracted, failed) but doesn't track which specific institutions changed status between passes. No audit trail of "pass 1 missed CA credit union X, pass 2 found it".

5. **Knowledge pruning is not automatic:** `should_prune_state()` checks token budget but prune must be manually triggered. Files can grow unbounded (though unlikely for 50 states).

---

## Work Routing

### When a crawl returns nothing (404 / empty document)

**Code path:** `fee_crawler/commands/crawl.py` handles fetch stage. When a URL returns 404:

Lines 122–128 (not exact, check actual code): If content is empty or 404 detected, the fee_schedule_url is set to NULL on the crawl_targets row. **No re-queue.** Requires manual fix:
```bash
python -m fee_crawler rediscover-failed [--state CA]
```

**Gap:** No automatic re-discovery job is fired. A broken link is invisible unless the operator runs `rediscover-failed` explicitly. Nightly cron jobs do not check for 404s.

### When extraction confidence is low

**Code path:** `fee_crawler/agents/validate.py` scores extraction confidence. When confidence < threshold:

Lines in auto_review.py: Fees with `extracted_confidence < extraction.confidence_auto_stage_threshold` (default 0.85) are staged as `review_status='staged'`, requiring human approval in `/admin/fees`.

**Routing:**
1. If confidence >= 0.85 (configurable): auto-approve to `review_status='approved'`
2. If confidence < 0.85: stage for manual review
3. If confidence < 0.5: flag for human inspection (red badge in admin)

**Gap:** No re-crawl or re-extraction is triggered. Low-confidence fees are staged but not re-tried with a different strategy or additional passes.

### When a fee is flagged by Roomba (validation failure)

**Code path:** `fee_crawler/workers/data_integrity.py` runs integrity checks (daily, line 165 in modal_app.py).

Checks include:
- Missing document_url (the 80% sourceliness gap)
- Inconsistent categorization
- Orphaned fees (extracted_fees with no crawl_target)

**Routing:** None. Violations are logged in the integrity report (daily_report.py generates summary). No automatic job is created to fix them.

**Gap:** This is a major sink. 82,805 of 103,052 fees (80.4%) have NULL `crawl_results.document_url`. No job re-runs the affected institutions to capture the source URL.

### When a document_url goes stale (404)

**Current behavior:** Unknown. Fetch stage checks for 404 during `crawl` command, but there is no scheduled job to validate existing fee_schedule_urls or document_urls periodically.

**Gap:** Links degrade over time. No liveness check is scheduled. Rediscovery requires manual `--force` flag or explicit `rediscover-failed` command.

### Orphaned row handling — what happens to fees with broken lineage

**Orphan types:**

1. **Extracted fees with NULL crawl_results.document_url (80% of active fees):**
   - Cause: crawl stage did not record the R2 key or URL
   - Routing: None. Data integrity check flags them; no auto-remediation
   - Manual fix: `python -m fee_crawler backfill-validation` (best-effort inference from fee text and institution)

2. **Agent_run_results rows with no agent_runs parent (if run_id is deleted):**
   - Cause: Agent run deleted but results orphaned
   - Routing: None. FK constraint should prevent, but cascading delete not enforced
   - Manual fix: Direct DB cleanup

3. **Wave_state_runs entries for states no longer in active list:**
   - Cause: State removed from crawl_targets but wave still references it
   - Routing: None. Wave continues; row remains in DB
   - Manual fix: Manual DELETE or wave skip

**No orphan reconciliation job is scheduled.**

---

## Feedback Loops

### Does anything downstream trigger upstream re-work?

**Currently: No.**

Hamilton reports consume extracted fees (from `extracted_fees` table) but do not emit signals that would cause re-crawling. Examples of missing loops:

1. **Report detects missing category:** Hamilton notes that a state has no ATM fees for a bank, but crawling is not re-triggered for that bank in that state.

2. **User reviews and rejects a fee:** Rejection is recorded in review_status, but no job is queued to re-extract or discover a replacement URL.

3. **Stale document_url detected:** Data integrity check flags it, but no job re-fetches the URL or rediscovers it.

### Does Hamilton output ever flow back to improve crawling?

**Currently: No.**

Hamilton agents write to `hamilton_reports` and external_intelligence tables (from 02-hamilton-layer.md). These tables are read-only for the crawler. No CLI or worker reads Hamilton insights to improve discovery or extraction strategy.

### Does user review action (approve/reject in /admin) feed back?

**Currently: Limited.**

Approving/rejecting fees updates `review_status` and (for rejects) records the timestamp. But no follow-up action is triggered:
- Rejecting a fee does not queue re-crawling for that institution
- Approving a low-confidence fee does not train future passes
- Bulk actions in admin have no post-action hooks

---

## ISR / Cache Invalidation

### When do prod pages refresh after DB writes?

**Path:** After `publish-index` command completes (part of `run_post_processing()` cron at 0 6 UTC):

1. **publish-index.py** (lines 150–162) calls the revalidation endpoint:
   ```python
   url = f"{base_url}/api/revalidate?secret={secret}"
   resp = requests.post(url, json={"paths": paths_to_revalidate})
   ```

2. **Next.js revalidate route** (`src/app/api/revalidate/route.ts`):
   ```typescript
   export async function POST(request: NextRequest) {
     const token = request.headers.get("authorization")?.replace("Bearer ", "");
     if (token !== REVALIDATE_TOKEN) return 401;
     const paths = body.paths || ["/"];
     for (const path of paths) {
       revalidatePath(path);
     }
   }
   ```

**Timing:**
- DB writes: fee extraction completes at ~0 5 UTC (post-processing starts at 0 6, runs 60 min)
- Pages stale: ~1 hour (from 0 5 to 0 6)
- Revalidation: ~0 7 UTC (after publish-index completes)
- Pages fresh: ~0 7 UTC onward (Next.js ISR honored)

**Paths revalidated:** publish-index.py passes hardcoded or config-driven paths (e.g., `/admin/index`, `/api/v1/index`). Check the source for exact list.

### Triggers and reliability

**Trigger:** publish-index.py (subprocess call from run_post_processing cron job). If publish-index fails, revalidate is not called (SubprocessFailed exception stops the chain).

**Reliability issues:**
1. **Network dependency:** Revalidate endpoint must be reachable from Modal (BFI_APP_URL). Vercel routing failures would silently fail (logged but not retried).
2. **Token mismatch:** If BFI_REVALIDATE_TOKEN env var is not set or wrong, revalidate returns 401. publish-index logs "Unauthorized" but continues.
3. **No retry:** If revalidate fails, the fee index is published but pages stay stale until the next `run_post_processing` cycle (24 hours later).

---

## Cross-Cutting Findings

### Fully automated (no manual intervention)

1. **Nightly commodity extraction:** PDF + browser extraction cron jobs run on schedule, pull fixed-size batches, extract and categorize automatically
2. **Data ingestion:** FRED, NYFED, BLS, OFR, FDIC, NCUA, etc. run on schedule with retry-on-soft-failure
3. **Post-processing:** Categorization, auto-review, validation, snapshotting, publishing, and cache revalidation happen in sequence
4. **Daily integrity reporting:** Data quality checks and daily reports are auto-generated

### Semi-automated (requires manual trigger or CLI)

1. **Wave orchestration:** Must be triggered manually via CLI or admin interface. No cron job. Code ready but decoupled due to Modal cron slot limit.
2. **Iterative deepening per state:** Passes 2 and 3 only run when wave is manually invoked. Nightly cron jobs run only single-pass crawls.
3. **Knowledge promotion:** Cross-state pattern promotion is code-complete but not wired into any automated pipeline. Requires manual `python -m fee_crawler knowledge promote`.
4. **Re-discovery of failed URLs:** `rediscover-failed` command exists but is not scheduled. Requires manual invocation.
5. **Manual cleanup:** Orphaned rows, stale links, and pruning are manual CLI operations.

### No automation AND no manual process (pure orphan)

1. **Feedback from Hamilton to crawling:** Hamilton reports do not surface actionable insights back to the crawler. No job, no CLI, no feedback.
2. **Validation of existing document_urls:** No liveness check for discovered URLs. 404s are not proactively detected.
3. **Reconciliation of lineage gaps (80% of fees):** Data integrity check identifies NULL document_url, but no auto-remediation or re-crawl job is fired.
4. **User review to re-extraction:** Rejecting a fee in `/admin` does not re-trigger extraction. No loop.
5. **A/B comparison of passes:** Wave system records per-pass stats but does not build a comparable audit of what changed between passes for each institution.

---

## Summary Table: Automation Coverage

| Stage | Process | Automated | Trigger | Failure Handling |
|-------|---------|-----------|---------|------------------|
| Discover | URL discovery | 🟢 Yes (Modal) | 0 2 UTC cron | Logged; no re-queue |
| Extract | PDF extraction | 🟢 Yes (Modal) | 0 3 UTC cron | Logged; next cycle re-tries |
| Extract | Browser extraction | 🟢 Yes (Modal) | 0 4 UTC cron | Logged; includes re-tries on fail |
| Categorize | Fee categorization | 🟢 Yes (Modal) | 0 6 UTC cron | Logged; continues on error |
| Validate | Confidence scoring | 🟢 Yes (Modal) | 0 6 UTC cron | Staged for manual review |
| Review | Auto-approval | 🟢 Yes (Modal) | 0 6 UTC cron | Staged if confidence < threshold |
| Ingest | Economic data | 🟢 Yes (Modal) | 0 10 UTC cron | Retry; fail logged; continues |
| ISR | Cache revalidation | 🟢 Yes (Modal) | Post-publish (0 7 UTC) | Silent fail if endpoint unreachable |
| Wave Orchestration | Multi-pass state agent | 🟡 Manual CLI | Manual or `/admin` | Crash recovery via resume, but not auto-triggered |
| Deepening | Iterative passes 2+ | 🟡 Manual CLI | Manual `wave run` | Resume support, but not auto-advancing |
| Knowledge | Learn and write | 🟢 Yes (embedded) | Per state-agent run | Automatic write to .md files |
| Knowledge | Cross-state promotion | 🔴 No | Manual `knowledge promote` | Not called by any job |
| Lineage | Capture document_url | 🔴 No | N/A (missing from crawl stage) | 80% gap, no remediation |
| Feedback | Hamilton → crawling | 🔴 No | N/A (no feedback loop) | Insights lost |

---

## Code Landmarks and Citations

**Modal app:**
- Entry point: `fee_crawler/modal_app.py`
- Scheduled functions: lines 79–230 (@app.function with schedule=modal.Cron)
- Subprocess runner: lines 35–53 (run_checked)
- Data integrity call: line 165 (run_checks)

**Wave orchestrator:**
- Core: `fee_crawler/wave/orchestrator.py` (run_wave, resume_wave, run_campaign)
- Pass iteration: lines 133–194 (_run_single_state)
- Strategy selection: `fee_crawler/agents/strategy.py` (tier_for_pass)
- State agent invocation: `fee_crawler/agents/state_agent.py` (run_state_agent)

**Knowledge automation:**
- Write learnings: `fee_crawler/knowledge/loader.py::write_learnings()` (lines 36–84)
- Cross-state promotion: `fee_crawler/knowledge/promoter.py::promote_cross_state_patterns()` (lines 15–107)
- Load knowledge: loader.py::load_knowledge() (lines 14–33)

**Wave CLI:**
- Commands: `fee_crawler/wave/cli.py` (cmd_wave_run, cmd_wave_resume, cmd_wave_report)
- Invocation: `fee_crawler/__main__.py` (lines 1233–1293)

**ISR / cache:**
- Revalidation call: `fee_crawler/commands/publish_index.py` (lines 150–162)
- Revalidate route: `src/app/api/revalidate/route.ts`

**Data integrity & reporting:**
- Checks: `fee_crawler/workers/data_integrity.py`
- Daily report: `fee_crawler/workers/daily_report.py`
- Called from modal_app.py lines 165–172

---

## Top Gaps (Ranked by Downstream Impact)

1. **Wave orchestrator not scheduled.** Code is complete, but unused. Iterative deepening (Phases 20) never runs in production unless manually triggered. Impact: Nightly crawls process only top 1000 institutions (500 PDF + 500 browser); remaining 3000+ never get multi-pass treatment.

2. **80% lineage loss (NULL document_url).** Crawl stage does not persist R2 key or source URL. Data integrity check flags it but no remediation job runs. Impact: 82,805 fees cannot be traced to source; audit trail broken.

3. **No feedback loop from Hamilton to crawling.** Reports surface gaps but crawling doesn't re-act. If a report shows a state missing a fee category, no job re-crawls that state. Impact: Gaps are reported but never healed.

4. **Knowledge promotion not wired into pipeline.** `promote_cross_state_patterns()` code exists but no cron job or wave completion hook calls it. Patterns learned in 3+ states are not promoted to national. Impact: Knowledge compounding is incomplete; subsequent passes don't inherit cross-state learnings.

5. **No proactive validation of existing URLs.** Discovered fee_schedule_urls can go stale (404) but no liveness check is scheduled. Impact: Dead links accumulate; no signal to re-discover until a manual re-crawl attempts the URL.

6. **Manual reconciliation of orphaned data.** Orphaned extracted_fees (no parent agent_run), orphaned lineage (NULL document_url), and stale URLs require manual cleanup. No job exists. Impact: Data quality debt accumulates.

---

*Audit conducted: 2026-04-16*
*Scope: Modal workers, wave orchestration, iterative deepening, knowledge automation, work routing, feedback loops*
*Status: Implementation ~70% complete; integration ~40% (wave not scheduled, knowledge promotion manual, feedback loops absent)*
