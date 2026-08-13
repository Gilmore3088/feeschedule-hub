---
phase: 21-knowledge-automation
plan: 02
subsystem: infra
tags: [python, cli, argparse, knowledge-base, config, pydantic]

# Dependency graph
requires:
  - phase: 21-knowledge-automation
    provides: knowledge/pruner.py with prune_file, prune_state, prune_national functions
provides:
  - KnowledgeConfig Pydantic model with token_budget_chars, prune_state_every, prune_national_every
  - knowledge: section in config.yaml (default token_budget_chars=4000)
  - prune_file/prune_state/prune_national accept token_budget_chars parameter
  - python -m fee_crawler knowledge prune --state XX / --all CLI command
  - python -m fee_crawler knowledge status CLI command
affects: [21-knowledge-automation, wave-orchestrator, state-agent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - KnowledgeConfig added to Config class following existing section pattern (DatabaseConfig, FREDConfig, etc.)
    - knowledge subcommand uses nested subparsers matching wave subcommand pattern exactly
    - cmd_knowledge_prune / cmd_knowledge_status functions placed before main() alongside other cmd_* functions

key-files:
  created: []
  modified:
    - fee_crawler/config.py
    - fee_crawler/config.yaml
    - fee_crawler/knowledge/pruner.py
    - fee_crawler/__main__.py

key-decisions:
  - "token_budget_chars defaults to 4000 chars (~1K tokens) — keeps state files compact as agent context"
  - "prune_file skips files <= budget (not < 500 as before) so budget is the single source of truth"
  - "PRUNE_STATE_EVERY / PRUNE_NATIONAL_EVERY module constants preserved for backward compatibility with state_agent.py"
  - "Path traversal mitigated by calling .upper() on --state arg and using it only as a Path stem inside KNOWLEDGE_DIR/states/"

patterns-established:
  - "Config sections follow Pydantic BaseModel pattern — add class, add field to Config, add section to config.yaml"
  - "CLI subcommands use nested argparse subparsers (dest='knowledge_command', required=True) matching wave pattern"

requirements-completed:
  - KNOW-01
  - KNOW-02

# Metrics
duration: 15min
completed: 2026-04-07
---

# Phase 21 Plan 02: Knowledge CLI Registration and Configurable Prune Budget Summary

**`python -m fee_crawler knowledge prune/status` CLI registered with configurable token_budget_chars via config.yaml KnowledgeConfig**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-07T00:00:00Z
- **Completed:** 2026-04-07T00:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- KnowledgeConfig Pydantic model added to config.py and wired into Config class; config.yaml gets a `knowledge:` section defaulting to 4000 chars
- prune_file / prune_state / prune_national updated to accept and forward `token_budget_chars`; skip-guard changed from `< 500` to `<= token_budget_chars`
- `knowledge prune --state XX` and `knowledge prune --all` CLI commands operational; `knowledge status` shows 52 state files, 309K total chars, 44 states over budget

## Task Commits

Each task was committed atomically:

1. **Task 1: Add KnowledgeConfig to config.py and config.yaml, update pruner to accept budget** - `69c07f3` (feat)
2. **Task 2: Register knowledge subcommand in __main__.py** - `ba4b33d` (feat)

## Files Created/Modified
- `fee_crawler/config.py` - Added KnowledgeConfig class; added `knowledge` field to Config
- `fee_crawler/config.yaml` - Added `knowledge:` section with token_budget_chars, prune_state_every, prune_national_every
- `fee_crawler/knowledge/pruner.py` - prune_file accepts token_budget_chars; budget-check replaces 500-char guard; prune_state/prune_national forward parameter; PRUNE_STATE_EVERY/PRUNE_NATIONAL_EVERY comment updated
- `fee_crawler/__main__.py` - cmd_knowledge_prune, cmd_knowledge_status functions added; knowledge subparser registered with prune and status sub-subcommands

## Decisions Made
- Used 4000 chars as default budget (~1K tokens at 4:1 ratio) — keeps state files compact without over-pruning
- Budget check uses `<=` so files exactly at budget are not pruned unnecessarily
- Module-level `PRUNE_STATE_EVERY` / `PRUNE_NATIONAL_EVERY` constants preserved for backward compatibility; comment notes they are superseded by config when CLI is used
- `--state` arg uppercased and used only as path stem to prevent directory traversal (T-21-04 mitigation)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. All changes are pure Python config and CLI wiring.

## Next Phase Readiness
- `python -m fee_crawler knowledge prune --all` can now be run to bring all 44 over-budget state files within the 4000-char budget before the next wave campaign
- Token budget is operator-tunable via config.yaml without code changes
- Wave orchestrator can read `config.knowledge.prune_state_every` to auto-prune on schedule

## Self-Check: PASSED

- FOUND: fee_crawler/config.py
- FOUND: fee_crawler/config.yaml
- FOUND: fee_crawler/knowledge/pruner.py
- FOUND: fee_crawler/__main__.py
- FOUND: .planning/phases/21-knowledge-automation/21-02-SUMMARY.md
- FOUND commit: 69c07f3 (Task 1)
- FOUND commit: ba4b33d (Task 2)

---
*Phase: 21-knowledge-automation*
*Completed: 2026-04-07*
