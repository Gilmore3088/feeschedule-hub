# SQLite Call-Site Audit — Phase 62a Plan 11

**Date:** 2026-04-16
**Decisions:** CONTEXT.md D-13..D-16 (eliminate SQLite; rewrite db.py Postgres-only; rewrite modal_preflight.py; CI grep guard).

## Before-state inventory

The authoritative list of every SQLite call site at the start of Plan 62A-11
execution. Every row below is addressed by a subsequent task in this plan.

Produced by running:

```bash
git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- fee_crawler/ src/ \
  ':(exclude)fee_crawler/**/__pycache__' \
  ':(exclude)src/**/node_modules/**' \
  ':(exclude)fee_crawler/SQLITE_AUDIT.md'
```

| File | Line | Pattern match | Disposition |
|------|------|---------------|-------------|
| fee_crawler/commands/crawl.py | 600 | comment `# Convert sqlite3.Row objects to plain dicts` | Rewritten in Task 2 — "RealDictRow rows" |
| fee_crawler/commands/discover_urls.py | 257 | comment `# Convert sqlite3.Row objects to plain dicts` | Rewritten in Task 2 — "RealDictRow rows" |
| fee_crawler/db.py | 16 | `import sqlite3` | Rewritten in Task 2 — module now psycopg2+asyncpg only |
| fee_crawler/db.py | 540 | `sqlite3.connect(...)` | Rewritten in Task 2 — Database wraps psycopg2 |
| fee_crawler/db.py | 541 | `sqlite3.Row` | Rewritten in Task 2 — RealDictCursor returns dict rows |
| fee_crawler/db.py | 618 | `sqlite3.OperationalError` | Rewritten in Task 2 — replaced by psycopg2 equivalents |
| fee_crawler/db.py | 657 | `sqlite3.OperationalError` | Rewritten in Task 2 — replaced by psycopg2 equivalents |
| fee_crawler/db.py | 672 | `sqlite3.OperationalError` | Rewritten in Task 2 — replaced by psycopg2 equivalents |
| fee_crawler/db.py | 680 | `sqlite3.Cursor` in signature | Rewritten in Task 2 — signatures widened to `Any` |
| fee_crawler/db.py | 683 | `sqlite3.Cursor` in signature | Rewritten in Task 2 — signatures widened to `Any` |
| fee_crawler/db.py | 689 | `sqlite3.Row` in signature | Rewritten in Task 2 — signatures widened to `dict` |
| fee_crawler/db.py | 692 | `sqlite3.Row` in signature | Rewritten in Task 2 — signatures widened to `dict` |
| fee_crawler/modal_preflight.py | 31 | `PREFLIGHT_DB_PATH = "/tmp/preflight_test.db"` | Removed in Task 3 |
| fee_crawler/modal_preflight.py | 186 | `DatabaseConfig(path=PREFLIGHT_DB_PATH)` | Removed in Task 3 |
| fee_crawler/tests/test_transition_fee_status.py | 3 | `import sqlite3` | Rewritten in Task 4 — uses db_schema fixture |
| fee_crawler/tests/test_transition_fee_status.py | 17 | `sqlite3.connect(":memory:")` | Rewritten in Task 4 — asyncpg + per-test schema |
| fee_crawler/tests/test_transition_fee_status.py | 18 | `sqlite3.Row` | Rewritten in Task 4 — asyncpg + per-test schema |

**Total:** 17 matches across 5 files. `fee_crawler/tests/e2e/conftest.py` does not
exist in the current tree (the legacy e2e harness was removed earlier in Phase 62a);
Task 4 therefore only addresses `test_transition_fee_status.py`.

## After-state expectation

After Tasks 2-6 complete:
- `git grep -nE 'better-sqlite3|sqlite3|DB_PATH' -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns ZERO lines.
- `bash scripts/ci-guards.sh sqlite-kill` exits 0.
- CI workflow no longer uses `continue-on-error: true` on the guard step.
- `pytest fee_crawler/tests/` runs green against the db_schema Postgres fixture.

## Notes

- Phase 60.1 retired the pipeline-tables-on-SQLite path (`require_postgres()` was the gate). Phase 62a completes the elimination.
- D-13 preserves the `fee_crawler/db.py` module path — all existing `from fee_crawler import db` imports still succeed; the module is rewritten not renamed.
- `fee_crawler/config.py` drops the sqlite-branch of DatabaseConfig. DATABASE_URL is required in every environment (local dev uses docker-compose postgres:5433 per Plan 62A-01).
- This file is the auditor's record; keep it for the lifetime of the phase.

## After-state verification

Verified 2026-04-16:
- `bash scripts/ci-guards.sh sqlite-kill` returns 0 (zero matches in fee_crawler/ or src/)
- `git grep -nE "better-sqlite3|sqlite3|DB_PATH" -- fee_crawler/ src/ ':(exclude)fee_crawler/SQLITE_AUDIT.md'` returns 0 lines
- `pytest fee_crawler/tests/ --ignore=fee_crawler/tests/e2e` green (250 passed, 48 skipped without DATABASE_URL_TEST, 1 xfailed)
- `fee_crawler.db` imports succeed: `Database`, `PostgresDatabase` alias, `get_db`, `get_worker_db`, `close_worker_db`, `require_postgres`, `get_async_pool`, `close_async_pool`, `DatabaseConfig`
- `fee_crawler.modal_preflight.preflight` symbol exists (modal.Function wrapper)
- `.github/workflows/test.yml` sqlite-kill step runs without `continue-on-error`
- 30 e2e test errors are pre-existing (missing `test_db`/`test_db_path`/`test_config` fixtures from deleted e2e conftest) — see `.planning/phases/62A-agent-foundation-data-layer/deferred-items.md`. Phase 63 rebuilds the e2e harness.

TIER-06 acceptance: PASS.
