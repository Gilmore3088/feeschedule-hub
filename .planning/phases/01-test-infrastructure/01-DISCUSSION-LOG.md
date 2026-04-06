# Phase 1: Test Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 01-test-infrastructure
**Areas discussed:** DB isolation, Test geography, Fixture layering, Mock boundaries

---

## DB Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Temp file per session | Session-scoped tmp_path SQLite file | |
| In-memory :memory: | Fastest, zero disk I/O | |
| You decide | Claude picks based on pipeline architecture | ✓ |

**User's choice:** Claude's discretion
**Notes:** Database class already accepts Config with path — straightforward override

---

| Option | Description | Selected |
|--------|-------------|----------|
| Monkeypatch LOCK_FILE | Override module-level constant in conftest | |
| Config-driven lock | Refactor to read from Config | |
| You decide | Claude picks cleanest approach | ✓ |

**User's choice:** Claude's discretion
**Notes:** Lock file hardcoded at executor.py:18

---

## Test Geography

| Option | Description | Selected |
|--------|-------------|----------|
| Small fixed state | Default to WY, VT, AK | |
| Random each run | Pick random state each time | ✓ |
| Random from small pool | Random from 5-6 small states | |

**User's choice:** Random each run
**Notes:** User later clarified: use small states like Vermont or Rhode Island. Avoid Wyoming (active work). Aim for 80%+ coverage. Document learnings per state for compounding.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Pytest CLI option | Custom --geography flag | |
| Environment variable | E2E_GEOGRAPHY env var | |
| You decide | Claude picks most pytest-idiomatic | ✓ |

**User's choice:** Claude's discretion

---

## Fixture Layering

| Option | Description | Selected |
|--------|-------------|----------|
| Live APIs only | Hit real APIs every run | |
| Pre-baked fixtures | Store as JSON fixtures | |
| Live with fallback | Live first, cached fallback | |

**User's choice:** (Other) FDIC/NCUA seeding is one-time per state. First run seeds from live APIs, subsequent runs re-use already-seeded data. No re-fetching unless forced.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Session scope | One DB for whole test run | |
| Function scope | Fresh DB per test | |
| You decide | Claude picks based on architecture | ✓ |

**User's choice:** Claude's discretion

---

## Mock Boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Everything live | Real websites, real LLM | ✓ |
| Mock LLM only | Real crawling, mock extraction | |
| All live, cap cost | Real everything with budget guard | |

**User's choice:** Everything live — true e2e, not a mock test
**Notes:** User wants proof the real pipeline works. Cost accepted for Haiku calls.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Local tmp_path | Override document_storage_dir | |
| You decide | Claude picks cleanest approach | ✓ |

**User's choice:** Claude's discretion

---

## Claude's Discretion

- DB isolation approach (temp file vs :memory:)
- Lock file override strategy
- CLI geography override mechanism
- DB fixture scope (session vs function)
- R2 storage bypass approach

## Deferred Ideas

- Per-state compounding intelligence — Milestone 2
- VCR cassettes for offline CI — v2 requirement
