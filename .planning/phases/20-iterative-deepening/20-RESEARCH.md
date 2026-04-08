# Phase 20: Iterative Deepening - Research

**Researched:** 2026-04-08
**Domain:** Python crawler pipeline — multi-pass state agent orchestration, strategy escalation, per-pass logging
**Confidence:** HIGH (all findings from direct codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pass 1: Easy URL discovery (sitemap, common fee schedule paths). Fast, low-cost.
- **D-02:** Pass 2: Playwright for JS-rendered pages. Catches SPAs and dynamically loaded fee schedules.
- **D-03:** Pass 3+: PDF search and fee schedule keyword queries. Targets harder-to-find institutions with non-standard URL patterns.
- **D-04:** 3-5 passes per state, automatic. No manual re-triggering between passes. Each pass builds on what prior passes found.
- **D-05:** After each pass, log: fees discovered this pass, cumulative coverage %, new URL patterns or extraction patterns found. Visible in agent_runs or a pass-level log.

### Claude's Discretion
- **D-06:** How to integrate with wave orchestrator: loop inside `run_campaign()` that runs N passes per state, or have the orchestrator re-queue incomplete states.
- **D-07:** Where to store pass metadata: extend `agent_runs` table with `pass_number` and `strategy` columns, or create a separate `agent_passes` table.
- **D-08:** How to parameterize `run_state_agent()`: accept a strategy tier parameter that controls which discovery stages activate, or create a wrapper that calls the agent multiple times with different configs.
- **D-09:** Whether the agent skips already-discovered institutions on subsequent passes (only targets institutions without fee URLs or with failed extractions).
- **D-10:** How many passes to default to (3 vs 5) and whether to stop early if coverage reaches a threshold (e.g., 90%).

### Deferred Ideas
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ITER-01 | After a wave run, each state has at least 3 agent_run entries — one per iteration — without manual re-triggering | Inner pass loop in orchestrator; each pass creates its own agent_runs row via existing INSERT |
| ITER-02 | Pass 1 uses easy discovery; pass 2 activates deeper Playwright; pass 3+ adds PDF/keyword — escalation visible in strategy field | Strategy tier parameter to `run_state_agent()` + `strategy` column on agent_runs |
| ITER-03 | Per-pass log with fees discovered, cumulative coverage %, new patterns found | `write_learnings()` already writes per-run block; extend with coverage % and pass number |
</phase_requirements>

---

## Summary

Phase 20 adds multi-pass iteration to the wave crawl system. The wave orchestrator (Phase 19) currently calls `run_state_agent(state_code)` once per state. This phase wraps that call in an inner pass loop so each state is processed 3–5 times automatically, with each pass escalating to more aggressive discovery strategies.

The key insight from the codebase: `discover.py` already contains all three strategy tiers — they all run sequentially in a single pass today. Escalation means controlling *which strategies are active per pass*, not enabling/disabling Playwright (it's already always active). Pass 1 would use only fast direct/sitemap strategies; Pass 2 would add deeper link-following with Playwright; Pass 3+ would add aggressive PDF hunting and keyword search.

The knowledge system (`loader.py`) already writes per-run learnings to state `.md` files after each run — this is the natural injection point for cross-pass learning. Each subsequent pass loads learnings from prior passes automatically (the `load_knowledge()` call in `state_agent.py` already does this).

**Primary recommendation:** Add `pass_number` and `strategy` columns to `agent_runs` via migration, accept a `StrategyTier` parameter in `run_state_agent()`, add an inner pass loop to `_run_single_state()`, and extend `write_learnings()` to include coverage percentage. This is the minimum disruption path.

---

## Standard Stack

This phase is pure Python — no new libraries required.

### Core (already in use)
| Component | Version | Purpose |
|-----------|---------|---------|
| psycopg2 | 2.9+ | PostgreSQL access for agent_runs, wave tables |
| anthropic | 0.40+ | LLM calls in discover.py and state_agent.py |
| playwright | 1.40+ | Browser automation for JS-rendered pages |

### No New Dependencies
All discovery strategies exist in `discover.py`. The iteration layer is pure orchestration logic.

---

## Architecture Patterns

### Existing Data Model (VERIFIED: codebase inspection)

**`agent_runs` table** (defined in `src/lib/scout/agent-db.ts`, used by Python agent):
```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id                 SERIAL PRIMARY KEY,
  state_code         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'running',
  started_at         TIMESTAMPTZ DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  total_institutions INTEGER DEFAULT 0,
  discovered         INTEGER DEFAULT 0,
  classified         INTEGER DEFAULT 0,
  extracted          INTEGER DEFAULT 0,
  validated          INTEGER DEFAULT 0,
  failed             INTEGER DEFAULT 0,
  current_stage      TEXT,
  current_institution TEXT
);
```

Currently has **no** `pass_number` or `strategy` columns. These must be added via migration.

**`wave_state_runs` table** stores one row per (wave_run_id, state_code) with `agent_run_id` FK pointing to one agent_runs row. This 1:1 assumption breaks when multi-pass creates multiple agent_runs rows per state per wave.

### Recommended Approach for D-06: Inner Pass Loop in Orchestrator

The cleaner option is an inner pass loop inside `_run_single_state()` in `orchestrator.py`. This keeps the wave/state relationship intact — the wave tracks one logical "state run" while each pass creates its own `agent_runs` row internally.

Pseudocode:
```python
def _run_single_state(conn, wave_run_id, state_code, max_passes=3, early_stop_pct=90.0):
    for pass_num in range(1, max_passes + 1):
        strategy = _tier_for_pass(pass_num)  # tier1 | tier2 | tier3
        result = run_state_agent(state_code, pass_number=pass_num, strategy=strategy)
        coverage = _get_coverage_pct(conn, state_code)
        log.info("Pass %d/%d: coverage=%.1f%%", pass_num, max_passes, coverage)
        if coverage >= early_stop_pct:
            log.info("Early stop: coverage %.1f%% >= %.1f%%", coverage, early_stop_pct)
            break
    update_wave_state(conn, wave_run_id, state_code, status="complete",
                      agent_run_id=result.get("run_id"))
```

The `wave_state_runs.agent_run_id` FK should point to the **last** pass's agent_runs row (for admin UI linking). Earlier passes are discoverable by querying `agent_runs WHERE state_code = ? ORDER BY started_at`.

### Recommended Approach for D-07: Extend agent_runs Table

Extending `agent_runs` (not a new table) is simplest. New columns:

```sql
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pass_number INTEGER DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS strategy    TEXT    DEFAULT 'tier1';
```

This keeps all existing queries working unchanged. The admin UI in `states.ts` already queries `agent_runs` — adding columns is backward-compatible.

### Recommended Approach for D-08: Strategy Tier Parameter

Add a `StrategyTier` dataclass or enum and pass it through `run_state_agent()`:

```python
# fee_crawler/agents/strategy.py  (new file)
from dataclasses import dataclass

@dataclass(frozen=True)
class StrategyTier:
    name: str           # "tier1" | "tier2" | "tier3"
    use_sitemap: bool
    use_common_paths: bool
    use_deep_playwright: bool  # follow links 2+ levels deep
    use_pdf_hunt: bool         # aggressive PDF scoring
    use_keyword_search: bool   # search engines for fee schedules

TIER1 = StrategyTier("tier1", True,  True,  False, False, False)
TIER2 = StrategyTier("tier2", True,  True,  True,  True,  False)
TIER3 = StrategyTier("tier3", True,  True,  True,  True,  True )
```

`discover_url()` already accepts a `knowledge` kwarg — add a `strategy` kwarg that gates which code paths run.

### Recommended Approach for D-09: Skip Already-Discovered Institutions

In `state_agent.py`, the Stage 2 (Discover) already skips institutions that have `fee_schedule_url` set:
```python
if not fee_url and website_url:
    # ... run discovery
elif fee_url:
    _record_result(conn, run_id, inst_id, "discover", "skipped", {"existing_url": fee_url})
```

Pass 2+ should target institutions where `fee_schedule_url IS NULL` OR where prior extraction failed (status in extracted_fees = 0 rows). The inventory query in Stage 1 should be narrowed per pass:

```python
# Pass 1: all institutions
WHERE status = 'active' AND state_code = %s

# Pass 2+: only those without successful extraction
WHERE status = 'active' AND state_code = %s
  AND (fee_schedule_url IS NULL
       OR id NOT IN (SELECT crawl_target_id FROM extracted_fees WHERE review_status != 'rejected'))
```

### Recommended Approach for D-10: Default 3 Passes, 90% Early Stop

Start with 3 passes (`MAX_PASSES = 3`). Early stop at 90% coverage. Coverage is queryable as:
```sql
SELECT
  COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL) * 100.0 / COUNT(*) AS coverage_pct
FROM crawl_targets
WHERE state_code = %s AND status = 'active'
```

5 passes is available as a CLI flag `--max-passes` for manual override on low-coverage states.

### Knowledge Injection (Cross-Pass Learning)

`load_knowledge(state_code)` already runs at the top of `run_state_agent()`. Because `write_learnings()` appends to the state's `.md` file at the end of each pass, Pass 2 automatically receives Pass 1's learnings. No extra wiring needed — the existing flow handles this.

The CONTEXT.md example: "this state uses WordPress, look for /wp-content/ PDFs" is already captured by `_generate_learnings()` and written to the knowledge file. Pass 2's `_ask_claude()` call receives this as `knowledge_context`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Coverage % computation | Custom coverage tracker | SQL query on crawl_targets | Single source of truth already in DB |
| Cross-pass learning state | Custom state object | knowledge/loader.py write_learnings() | Already implements file-based learning accumulation |
| Strategy gating | Complex feature flags | Simple StrategyTier dataclass with bool fields | Readable, testable, no hidden state |
| DB schema evolution | Manual ALTER TABLE | Supabase migration file matching existing pattern | Consistent with 20260407_wave_runs.sql pattern |

---

## Common Pitfalls

### Pitfall 1: wave_state_runs 1:1 Assumption
**What goes wrong:** `wave_state_runs` has `UNIQUE(wave_run_id, state_code)` and one `agent_run_id`. If you try to store multiple agent_run_ids for the same state in the same wave, the FK becomes ambiguous.
**Why it happens:** The wave system was designed for single-pass per state.
**How to avoid:** Store only the *last* pass's `agent_run_id` in `wave_state_runs`. Use `agent_runs.pass_number` to query earlier passes. The `UNIQUE` constraint stays intact.
**Warning signs:** If you see duplicate key errors on `wave_state_runs`, you've tried to re-insert instead of update.

### Pitfall 2: Re-Discovering Already-Known URLs
**What goes wrong:** Pass 2 re-runs discovery on institutions that already have `fee_schedule_url` set, wasting time and API calls.
**Why it happens:** The Stage 1 inventory query fetches ALL active institutions.
**How to avoid:** Narrow the inventory query on Pass 2+ to institutions without extracted fees (see D-09 section above). The existing `if not fee_url and website_url:` guard in Stage 2 already skips known URLs — but you still iterate over them in the loop.

### Pitfall 3: Knowledge File Bloat Across Many Passes
**What goes wrong:** After 3-5 passes × 50 states, knowledge `.md` files grow large and slow down `load_knowledge()`.
**Why it happens:** `write_learnings()` always appends, never truncates.
**How to avoid:** `pruner.py` already implements `should_prune_state()` and `prune_state()` — it runs at the end of each `run_state_agent()` call. Verify it handles multi-pass volume. No new code needed if pruner thresholds are appropriate.

### Pitfall 4: Early Stop Cutting Off Mid-Campaign
**What goes wrong:** A state hits 90% on pass 1 (lucky run), skips passes 2-3, then falls below 90% after re-crawls update data — user expects 3 entries per state but only gets 1.
**Why it happens:** Early stop is applied per-run, not globally.
**How to avoid:** ITER-01 requires at least 3 `agent_runs` entries per state. If early stop fires, the loop must still complete at minimum 3 passes (even if passes 2-3 are no-ops for institutions with fees). Alternatively: early stop prevents *additional* passes beyond 3, not the first 3.

### Pitfall 5: Resume-from-Failure Complexity with Multi-Pass
**What goes wrong:** If pass 2 crashes mid-state, `resume_wave()` re-runs the entire state (all passes), creating duplicate agent_runs rows.
**Why it happens:** `get_incomplete_states()` returns states with status != 'complete'. It doesn't track which pass failed.
**How to avoid:** Track `last_completed_pass` in `wave_state_runs`. On resume, start from `last_completed_pass + 1`. This requires adding a column to `wave_state_runs`.

---

## Code Examples

### Agent_runs INSERT with Pass Columns (VERIFIED: existing pattern in state_agent.py)
```python
# Modified INSERT in run_state_agent() — add pass_number and strategy
cur.execute(
    """INSERT INTO agent_runs
       (state_code, total_institutions, current_stage, pass_number, strategy)
       VALUES (%s, %s, 'inventory', %s, %s) RETURNING id""",
    (state_code, len(institutions), pass_number, strategy.name),
)
```

### Coverage Query (VERIFIED: crawl_targets schema in migrate-schema.sql)
```python
def _get_coverage_pct(conn, state_code: str) -> float:
    cur = conn.cursor()
    cur.execute(
        """SELECT
             COUNT(*) FILTER (WHERE fee_schedule_url IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0)
           FROM crawl_targets
           WHERE state_code = %s AND status = 'active'""",
        (state_code,),
    )
    row = cur.fetchone()
    return float(row[0] or 0.0)
```

### Per-Pass Inventory Narrowing (VERIFIED: existing Stage 1 query pattern)
```python
if pass_number == 1:
    cur.execute(
        "SELECT * FROM crawl_targets WHERE status = 'active' AND state_code = %s ORDER BY asset_size DESC NULLS LAST",
        (state_code,),
    )
else:
    # Only target institutions without successful fee extraction
    cur.execute(
        """SELECT ct.* FROM crawl_targets ct
           WHERE ct.status = 'active' AND ct.state_code = %s
             AND NOT EXISTS (
               SELECT 1 FROM extracted_fees ef
               WHERE ef.crawl_target_id = ct.id
                 AND ef.review_status != 'rejected'
             )
           ORDER BY ct.asset_size DESC NULLS LAST""",
        (state_code,),
    )
```

### Per-Pass Log Extension (VERIFIED: existing write_learnings() pattern in loader.py)
```python
# Extend write_learnings() to include pass metadata
block = f"\n## Run #{run_id} — Pass {pass_number} ({strategy}) — {date.today().isoformat()}\n"
block += f"Discovered: {stats.get('discovered', 0)} | Extracted: {stats.get('extracted', 0)} | "
block += f"Failed: {stats.get('failed', 0)} | Coverage: {coverage_pct:.1f}%\n"
```

### Discover.py Strategy Gating (VERIFIED: existing discover_url() structure)
```python
def discover_url(institution_name, website_url, knowledge="", strategy=TIER1):
    # ...
    # Strategy 1: AI-guided navigation — always active
    # Strategy 2: PDF link scanning — active on TIER2+
    if strategy.use_pdf_hunt:
        fee_pdfs = _score_pdf_links(all_pdf_links)
        # ...
    # Strategy 3: Common path probing — active on TIER2+
    if strategy.use_common_paths:
        for path in COMMON_PATHS:
            # ...
    # Strategy 3+: Keyword search (TIER3 only)
    if strategy.use_keyword_search:
        # new: Google/Bing search for "{institution_name} fee schedule filetype:pdf"
        # ...
```

---

## Runtime State Inventory

Step 2.5: SKIPPED — this is not a rename/refactor phase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| psycopg2 | DB writes for new columns | Assumed (used by state_agent.py today) | 2.9+ | — |
| playwright | Tier 2-3 discovery | Assumed (used by discover.py today) | 1.40+ | — |
| anthropic SDK | LLM calls in discover.py | Assumed (used today) | 0.40+ | — |
| DATABASE_URL | All DB operations | Must be set in environment | — | Hard failure (existing behavior) |

All dependencies are already proven in the running system. No new external dependencies.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest |
| Config file | `fee_crawler/tests/` directory |
| Quick run command | `python -m pytest fee_crawler/tests/ -x -q` |
| Full suite command | `python -m pytest fee_crawler/tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ITER-01 | 3 agent_run rows created per state after wave run | integration | `pytest fee_crawler/tests/test_iterative_deepening.py::test_three_passes_created -x` | No — Wave 0 |
| ITER-02 | Pass escalation: strategy field changes tier1→tier2→tier3 | unit | `pytest fee_crawler/tests/test_iterative_deepening.py::test_strategy_escalation -x` | No — Wave 0 |
| ITER-03 | Per-pass log includes coverage % and pass number | unit | `pytest fee_crawler/tests/test_iterative_deepening.py::test_per_pass_log -x` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `python -m pytest fee_crawler/tests/test_iterative_deepening.py -x -q`
- **Per wave merge:** `python -m pytest fee_crawler/tests/ -q`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `fee_crawler/tests/test_iterative_deepening.py` — covers ITER-01, ITER-02, ITER-03
- [ ] Test fixtures: mock psycopg2 connection, mock `run_state_agent()`, mock coverage query

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | `pass_number` is internal int, `strategy` is enum — no user input |
| V2 Authentication | no | Internal crawler, no auth surface |
| V4 Access Control | no | No new endpoints |
| V6 Cryptography | no | No secrets or crypto operations |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via state_code | Tampering | Parameterized queries (already enforced, see T-19-01 comment in models.py) |
| Runaway LLM spend on 5 passes × 50 states | Denial of Service (cost) | Daily circuit breaker already in place; keep MAX_PASSES=3 default |

---

## Open Questions (RESOLVED)

1. **Does discover.py currently support TIER3 keyword search at all?**
   - **RESOLVED:** TIER3 = site-internal aggressive search. Deeper crawling of institution's own website: search pages, PDF directories, document libraries. No external search API. Broader PDF scoring thresholds + longer common path list. User confirmed "site-internal aggressive search."

2. **Should `wave_state_runs.agent_run_id` store the last pass or the first pass?**
   - **RESOLVED:** Store the last pass's `agent_run_id`. It represents the final state of knowledge.

3. **`resume_wave()` pass-level tracking**
   - **RESOLVED:** Resume from last completed pass. User confirmed. Store `last_completed_pass` on wave_state_runs. If crash mid-pass, re-run that pass from scratch.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pruner.py` handles multi-pass volume adequately at default thresholds | Common Pitfalls #3 | Knowledge files may grow large; need to lower prune threshold or call prune more aggressively |
| A2 | TIER3 "keyword search" means site-internal search, not external search engine API | Open Questions #1 | Would need new API integration (SerpAPI, etc.) adding cost and a new dependency |
| A3 | All 3 environment dependencies (psycopg2, playwright, anthropic) are confirmed available in the Modal execution environment | Environment Availability | Fails at runtime; would need Modal image rebuild |

---

## Sources

### Primary (HIGH confidence)
- `fee_crawler/agents/state_agent.py` — full `run_state_agent()` flow, Stage 1-5, knowledge loading
- `fee_crawler/agents/discover.py` — all 3 existing strategy tiers, Playwright usage, strategy function boundaries
- `fee_crawler/wave/orchestrator.py` — `_run_single_state()`, `run_wave()`, `run_campaign()`, `HARD_FAILURES`
- `fee_crawler/wave/models.py` — `wave_state_runs` schema with `UNIQUE(wave_run_id, state_code)` constraint
- `fee_crawler/knowledge/loader.py` — `load_knowledge()`, `write_learnings()`, `get_run_count()`
- `src/lib/scout/agent-db.ts` — canonical `agent_runs` schema (all columns)
- `scripts/migrate-schema.sql` — production Postgres schema for all tables
- `supabase/migrations/20260407_wave_runs.sql` — migration pattern to follow for new columns

### Secondary (MEDIUM confidence)
- `.planning/phases/20-iterative-deepening/20-CONTEXT.md` — locked decisions and discretion areas
- `.planning/ROADMAP.md` — ITER-01/02/03 success criteria (source of requirement IDs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Python, no new dependencies, existing tools confirmed
- Architecture: HIGH — verified against actual table schemas and function signatures
- Pitfalls: HIGH — derived from reading UNIQUE constraints, existing skip logic, and wave resume code directly
- Open questions: MEDIUM — TIER3 scope and resume granularity require user/owner clarification

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable Python codebase; schema changes would invalidate)
