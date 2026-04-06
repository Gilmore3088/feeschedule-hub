---
phase: 11-modal-pre-flight
plan: "01"
subsystem: modal-preflight
tags: [modal, preflight, pipeline, sqlite, isolation]
dependency_graph:
  requires:
    - fee_crawler/modal_app.py
    - fee_crawler/config.py
    - fee_crawler/db.py
    - fee_crawler/commands/seed_institutions.py
    - fee_crawler/commands/discover_urls.py
    - fee_crawler/commands/crawl.py
    - fee_crawler/commands/categorize_fees.py
    - fee_crawler/commands/backfill_validation.py
  provides:
    - fee_crawler/modal_preflight.py
  affects: []
tech_stack:
  added: []
  patterns:
    - Modal @app.function + @modal.fastapi_endpoint dual decoration
    - os.environ.pop/restore pattern for DATABASE_URL isolation
    - socket.setdefaulttimeout for network stage timeouts
    - Config(database=DatabaseConfig(path=PREFLIGHT_DB_PATH)) isolation
key_files:
  created:
    - fee_crawler/modal_preflight.py
  modified: []
decisions:
  - "New file (modal_preflight.py) rather than adding to modal_app.py — separation of concerns, preflight is on-demand vs cron"
  - "DATABASE_URL pop/restore pattern: temporarily removes DATABASE_URL from os.environ before opening Database() to prevent psycopg2 path even when bfi-secrets bundle is present"
  - "TARGET_COUNT=3 (vs test suite's 5) — tighter budget for ops health check"
  - "daily_budget_usd=1.0 — cap LLM spend for a pre-flight run"
  - "_run_preflight_stages helper extracted to keep preflight_e2e under 60 lines"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-06"
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 11 Plan 01: Modal Pre-Flight Summary

**One-liner:** Modal `preflight_e2e` function running the full 5-stage pipeline in `/tmp` SQLite with DATABASE_URL isolation and structured pass/fail JSON return.

## What Was Built

`fee_crawler/modal_preflight.py` — a Modal function that:

1. Pops `DATABASE_URL` from `os.environ` before any DB connection (T-11-01 mitigation)
2. Constructs an isolated `Config` with `database.path="/tmp/preflight_test.db"`
3. Runs all 5 pipeline stages: seed → discover → extract → categorize → validate
4. Returns `{"status": "pass"|"fail", "institutions": int, "fees_extracted": int, "duration_s": float, "errors": list[str]}`
5. Restores `DATABASE_URL` in a `finally` block regardless of stage failures
6. Is also exposed as an HTTP POST endpoint via `@modal.fastapi_endpoint`

## Verification Results

All acceptance criteria passed at commit `0470141`:

```
import OK
```

```
grep -n "DATABASE_URL" fee_crawler/modal_preflight.py
155: # ISOLATION: this function deliberately ignores DATABASE_URL
156: _saved = os.environ.pop("DATABASE_URL", None)
190: os.environ["DATABASE_URL"] = _saved
```

```
grep -n "preflight_test.db" fee_crawler/modal_preflight.py
18: PREFLIGHT_DB_PATH = "/tmp/preflight_test.db"
```
(Config constructor uses `PREFLIGHT_DB_PATH` constant at line 173)

All 5 return dict keys present: `status`, `institutions`, `fees_extracted`, `duration_s`, `errors`.

`@app.function` + `@modal.fastapi_endpoint` decorators present. No `psycopg2` import.

Line count: 202 (marginally over 200 target; helper already extracted as `_run_preflight_stages`).

## Deviations from Plan

None — plan executed exactly as written.

The DATABASE_URL pop/restore pattern was specified in the plan (T-11-01 mitigation) and implemented as specified. The `_run_preflight_stages` helper was extracted per style rules to keep `preflight_e2e` under 60 lines.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-11-01 | `os.environ.pop("DATABASE_URL", None)` before `Database()`, restored in `finally` |
| T-11-03 | `daily_budget_usd=1.0` in preflight Config caps LLM spend |

## Checkpoint Status

Plan paused at Task 2 (`checkpoint:human-verify`). Task 1 is complete and committed.

Awaiting human verification of steps 1-4 (and optionally step 5 — modal run).

## Self-Check

- [x] `fee_crawler/modal_preflight.py` exists
- [x] Commit `0470141` exists in git log
- [x] Import check passes
- [x] All acceptance criteria verified via grep

## Self-Check: PASSED
