---
title: "v3.0 National Coverage Push - Crawler Automation Pipeline"
category: crawl-pipeline
severity: n/a
component: fee_crawler
tags: [milestone, wave-orchestrator, iterative-deepening, knowledge-automation, wave-reporting, crawler]
date: 2026-04-08
phases: [19, 20, 21, 22]
resolution_time: "single session (~2 hours)"
---

# v3.0 National Coverage Push - Crawler Automation Pipeline

## Problem

The fee crawler required manual intervention at every step:
- Running state agents one at a time by hand
- No automatic re-crawling for coverage gaps
- Knowledge docs edited manually after each run
- No post-wave reports -- had to query the DB to see what changed

## Solution: 4-Phase Automation Pipeline

### Phase 19: Wave Orchestrator
- `python -m fee_crawler wave run` launches full campaign across all states
- Sequential execution (MAX_CONCURRENT_STATES=1) for reliability
- `wave recommend` previews ranked state list (worst coverage first)
- `wave resume <wave_id>` for crash recovery
- `--states WY,MT` override for targeted runs

### Phase 20: Iterative Deepening
- 3-pass escalation per state: Tier 1 (sitemap/common paths) -> Tier 2 (deep Playwright crawl) -> Tier 3 (aggressive PDF/keyword search)
- `StrategyTier` frozen dataclass controls which strategies activate per pass
- Pass-narrowed inventory: subsequent passes skip already-extracted institutions
- Early stop at 90% coverage after minimum 3 passes
- `--max-passes` CLI flag (default 3, max 10)
- Resume from last completed pass (not pass 1)

### Phase 21: Knowledge Automation
- `append_coverage_note()` writes "Coverage after pass: X% (+Y% delta)" into state knowledge files
- `promote_cross_state_patterns(min_states=3)` scans all state files, promotes patterns appearing in 3+ states to national.md
- `KnowledgeConfig` with configurable `token_budget_chars: 4000`
- `python -m fee_crawler knowledge prune --all` reduces files to budget
- `python -m fee_crawler knowledge status` shows file sizes and over-budget states

### Phase 22: Wave Reporting
- `WaveReport` dataclass with per-state before/after coverage, fees added, discoveries
- `render_wave_report()` produces scannable Markdown
- Auto-prints after `run_wave()` completes
- `python -m fee_crawler wave report <wave_id>` for past waves
- `--output PATH` for file save

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Sequential execution (MAX_CONCURRENT=1) | Reliability over speed for unattended multi-hour runs |
| Strategy tiers as frozen dataclass | Clean, testable, no accidental mutation |
| Pass-narrowed inventory via NOT EXISTS | Avoids re-extracting known fees on subsequent passes |
| Cross-state promotion at 3+ threshold | Balances signal vs noise in national knowledge |
| Token budget in config.yaml | Operator-tunable without code changes |
| Reporter exception guarding | print_wave_report() never interrupts run_wave() return |

## CLI Commands

```bash
# Full campaign
python -m fee_crawler wave run
python -m fee_crawler wave run --max-passes 5
python -m fee_crawler wave run --states WY,MT,TX

# Resume and report
python -m fee_crawler wave resume <wave_id>
python -m fee_crawler wave recommend
python -m fee_crawler wave report <wave_id> --output report.md

# Knowledge management
python -m fee_crawler knowledge prune --all
python -m fee_crawler knowledge prune --state KS
python -m fee_crawler knowledge status
```

## Files Created/Modified

### New Modules
- `fee_crawler/wave/orchestrator.py` -- Campaign runner with inner pass loop
- `fee_crawler/wave/reporter.py` -- Wave report generation
- `fee_crawler/wave/cli.py` -- CLI commands
- `fee_crawler/agents/strategy.py` -- StrategyTier (TIER1/TIER2/TIER3)
- `fee_crawler/knowledge/promoter.py` -- Cross-state pattern promotion

### Modified
- `fee_crawler/agents/state_agent.py` -- Parameterized with pass_number + strategy
- `fee_crawler/agents/discover.py` -- Strategy-gated discovery
- `fee_crawler/wave/models.py` -- last_completed_pass tracking
- `fee_crawler/knowledge/loader.py` -- Coverage notes, pass metadata
- `fee_crawler/knowledge/pruner.py` -- Configurable token budget
- `fee_crawler/config.py` -- KnowledgeConfig
- `fee_crawler/__main__.py` -- wave + knowledge subcommands

### Migrations
- `supabase/migrations/20260408_iterative_deepening.sql` -- pass_number, strategy, last_completed_pass columns

## Test Coverage

| Module | Tests |
|--------|-------|
| test_iterative_deepening.py | 18 |
| test_wave_orchestrator.py | 22 |
| test_wave_reporter.py | 12 |
| **Total** | **52** |

## Worktree Merge Lesson (repeated from v5.0)

Same issue as v5.0: worktree branches forked before planning files were committed delete those files on cherry-pick. The `fee_crawler/` directory is partially untracked by git, making it vulnerable to worktree operations that modify the working directory. Consider committing the full Python codebase to git to prevent future data loss scares.
