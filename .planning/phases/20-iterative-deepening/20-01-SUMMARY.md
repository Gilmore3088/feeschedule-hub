---
phase: 20-iterative-deepening
plan: "01"
subsystem: fee-crawler-pipeline
tags: [iterative-deepening, strategy-tiers, state-agent, db-migration, tdd]
requirements: [ITER-01, ITER-02]

dependency_graph:
  requires:
    - fee_crawler/agents/discover.py
    - fee_crawler/agents/state_agent.py
    - fee_crawler/wave/models.py
    - fee_crawler/knowledge/loader.py
  provides:
    - fee_crawler/agents/strategy.py (StrategyTier, TIER1, TIER2, TIER3, tier_for_pass)
    - supabase/migrations/20260408_iterative_deepening.sql
  affects:
    - fee_crawler/agents/state_agent.py (parameterized)
    - fee_crawler/agents/discover.py (strategy-gated)
    - fee_crawler/wave/models.py (WaveStateRun + new functions)
    - fee_crawler/knowledge/loader.py (pass metadata in output)

tech_stack:
  added: []
  patterns:
    - frozen dataclass for immutable strategy configuration
    - strategy parameter defaulting to None for backward compat
    - pass_number column on agent_runs for multi-pass audit trail
    - NOT EXISTS subquery for pass 2+ inventory narrowing

key_files:
  created:
    - fee_crawler/agents/strategy.py
    - supabase/migrations/20260408_iterative_deepening.sql
    - fee_crawler/tests/test_iterative_deepening.py
  modified:
    - fee_crawler/agents/discover.py
    - fee_crawler/agents/state_agent.py
    - fee_crawler/wave/models.py
    - fee_crawler/knowledge/loader.py

decisions:
  - "D-07: extend agent_runs table (not new table) — simpler, backward compatible"
  - "D-08: StrategyTier parameter to run_state_agent(), derived from pass_number when None"
  - "D-09: pass 2+ narrows to NOT EXISTS (extracted_fees) — avoids re-work on covered institutions"
  - "TIER3 keyword search is site-internal only — no external search API (T-20-02)"
  - "strategy=None in discover_url() preserves legacy behavior (all strategies active)"

metrics:
  duration_seconds: 717
  tasks_completed: 2
  files_created: 3
  files_modified: 4
  tests_added: 18
  tests_passing: 18
  completed_date: "2026-04-08"
---

# Phase 20 Plan 01: Iterative Deepening Foundation Summary

**One-liner:** Frozen StrategyTier dataclass (TIER1/TIER2/TIER3) with tier_for_pass() mapper, strategy-gated discover_url(), parameterized run_state_agent() with pass-narrowed inventory, and DB migration adding pass_number/strategy/last_completed_pass columns.

## What Was Built

### Task 1: StrategyTier Module + Strategy-Gated Discovery

**fee_crawler/agents/strategy.py** — new module defining the three discovery tiers:

- `StrategyTier` frozen dataclass with five bool flags: `use_sitemap`, `use_common_paths`, `use_deep_crawl`, `use_pdf_hunt`, `use_keyword_search`
- `TIER1` (pass 1): fast — sitemap + common paths only
- `TIER2` (pass 2): medium — adds deep Playwright crawl (15-page budget) + aggressive PDF scoring
- `TIER3` (pass 3+): exhaustive — adds site-internal keyword search on the institution's own domain
- `tier_for_pass(n)` mapper: 1→TIER1, 2→TIER2, 3+→TIER3
- `DEFAULT_MAX_PASSES = 3`, `EARLY_STOP_COVERAGE_PCT = 90.0` constants

**fee_crawler/agents/discover.py** — modified:

- New signature: `discover_url(institution_name, website_url, knowledge="", strategy=None)`
- `strategy=None` preserves full backward compatibility (all paths active)
- PDF hunt gated by `strategy.use_pdf_hunt`
- Common path probing gated by `strategy.use_common_paths`
- TIER2+ increases page budget from 8 to 15 (`max_pages`)
- TIER3 adds `_site_internal_keyword_search()` — probes `/search?q=fee+schedule` patterns on the institution's own domain only (no external API per T-20-02)

### Task 2: DB Schema Extension + Parameterized State Agent

**supabase/migrations/20260408_iterative_deepening.sql**:
```sql
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS pass_number INTEGER DEFAULT 1;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT 'tier1';
ALTER TABLE wave_state_runs ADD COLUMN IF NOT EXISTS last_completed_pass INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS agent_runs_state_pass_idx ON agent_runs (state_code, pass_number);
```

**fee_crawler/agents/state_agent.py** — modified:
- New signature: `run_state_agent(state_code, pass_number=1, strategy=None)`
- Derives strategy from `tier_for_pass(pass_number)` when not provided
- Pass 1 inventory: all active institutions in state
- Pass 2+ inventory: `NOT EXISTS (SELECT 1 FROM extracted_fees WHERE ... review_status != 'rejected')` — skips already-covered institutions
- agent_runs INSERT includes `pass_number` and `strategy.name`
- `discover_url()` call passes `strategy=strategy`
- Return dict includes `pass_number` and `strategy` keys
- `stats` dict extended with `pass_number` and `strategy` keys before `write_learnings()`

**fee_crawler/wave/models.py** — modified:
- `WaveStateRun.last_completed_pass: int = 0` field added
- `update_wave_state_pass(conn, wave_run_id, state_code, last_completed_pass, agent_run_id=None)` — updates resume tracker
- `get_last_completed_pass(conn, wave_run_id, state_code) -> int` — returns 0 if not found
- `ensure_tables()` bootstraps new columns with `ADD COLUMN IF NOT EXISTS`

**fee_crawler/knowledge/loader.py** — modified:
- `write_learnings()` block header now includes pass info and coverage %:
  ```
  ## Run #42 -- Pass 2 (tier2) — 2026-04-08
  Discovered: 5 | Extracted: 3 | Failed: 2 | Coverage: 45.5%
  ```
- Backward compatible: when `pass_number` not in stats, header format unchanged

## Test Coverage

18 tests added in `fee_crawler/tests/test_iterative_deepening.py`:

| Class | Tests | Covers |
|-------|-------|--------|
| TestStrategyTierDefinitions | 1 | All tier flag values |
| TestTierForPassMapping | 1 | pass→tier mapping including edge cases |
| TestStrategyTierFrozen | 1 | Immutability of frozen dataclass |
| TestDiscoverUrlStrategySignature | 2 | strategy kwarg exists, defaults to None |
| TestStateAgentDefaultParams | 2 | Default INSERT uses pass_number=1, strategy='tier1'; return dict keys |
| TestStateAgentPass2NarrowsInventory | 2 | Pass 2 uses NOT EXISTS; pass 1 does not |
| TestWriteLearningsIncludesPassInfo | 3 | Pass info, coverage %, backward compat |
| TestWaveStateRunLastCompletedPass | 6 | Field, new functions, UPDATE/SELECT behavior |

All 18 pass. Combined with 25 existing wave tests (43 total) — all green.

## Deviations from Plan

**1. [Rule 2 - Missing functionality] Added signature tests for discover_url()**

The plan specified only 3 tests for Task 1 (tier definitions, pass mapping, frozen check). Added 2 additional tests verifying the `strategy` kwarg exists and defaults to `None` — these are required correctness assertions for the backward-compat contract.

**2. [Rule 1 - Bug] Fixed TIER3 keyword search return path**

The plan's pseudocode for `_site_internal_keyword_search()` returned `None` on failure but the call site had `pages_checked = found["pages_checked"] if found else pages_checked` which would fail if `found` was `None` (AttributeError on None dict access). Fixed by returning `None` explicitly and guarding the call site correctly.

## Known Stubs

None — all data flows are wired. Strategy tier flags control real code paths in discover_url(). The `coverage_pct` key in stats is expected to be populated by the wave orchestrator (Plan 02) when it calls `run_state_agent()` in the pass loop; until then, `write_learnings()` gracefully omits the coverage line when `coverage_pct` is absent from stats.

## Threat Flags

No new network endpoints or auth paths introduced. The TIER3 site-internal keyword search constructs URLs from `base_url` (already trusted — derived from `website_url` which comes from `crawl_targets.website_url` in the DB). URL construction uses string concatenation of hardcoded search path patterns — no user input reaches the URL construction. T-20-02 accepted.

## Self-Check: PASSED

**Created files exist:**
- FOUND: fee_crawler/agents/strategy.py
- FOUND: supabase/migrations/20260408_iterative_deepening.sql
- FOUND: fee_crawler/tests/test_iterative_deepening.py

**Commits exist:**
- FOUND: 9438944 feat(20-01): StrategyTier module and strategy-gated discover_url()
- FOUND: 17a730d feat(20-01): extend DB schema and parameterize run_state_agent()
