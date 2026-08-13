---
created: 2026-04-19T18:00:00.000Z
title: Phase 62a/62b test suite has 38 failures + 12 errors against real Postgres schema
area: testing
files:
  - fee_crawler/tests/test_62b_migrations.py
  - fee_crawler/tests/test_backfill_and_freeze.py
  - fee_crawler/tests/test_knox_review_overrides.py
  - fee_crawler/tests/test_lineage_graph.py
  - fee_crawler/tests/test_promote_to_tier3.py
  - fee_crawler/tests/test_sc1_recent_agent_events.py
  - fee_crawler/tests/test_sc2_auth_log_coverage.py
  - fee_crawler/tests/test_sc5_budget_halt.py
  - fee_crawler/tests/test_tools_agent_infra.py
  - fee_crawler/tests/test_tools_crawl.py
  - fee_crawler/tests/test_tools_hamilton.py
  - fee_crawler/tests/test_tools_peer_research.py
---

## Problem

The `tests` GitHub Actions workflow (Postgres-service-container integration
suite) has been red since at least 2026-04-18 — **38 failed, 430 passed,
7 skipped, 2 xfailed, 12 errors** in 71.94s on commit `66e7f94`. None of
these failures were addressed by today's CI fixes (`d59a28b`, `3b75a53`),
which only unblocked the Unit Tests workflow.

Failure categories observed in the log for run 24635381196:

**1. jsonb encoding (multiple tests)**
```
asyncpg.exceptions._base.InternalClientError: no binary format encoder
for type jsonb (OID 3802)
```
Our asyncpg setup is missing the jsonb codec registration. Fix in the
connection-pool builder: `await conn.set_type_codec('jsonb', encoder=..., decoder=..., schema='pg_catalog', format='text')`.
Hits `test_sc1_recent_agent_events.py` and any other test that writes
jsonb columns.

**2. Reserved-word SQL (test_tools_agent_infra.py)**
```
asyncpg.exceptions.PostgresSyntaxError: syntax error at or near "window"
```
`window` is a SQL reserved word; a column or identifier is being
interpolated without quoting in `test_upsert_agent_budget_*`. Either
rename the column or wrap it in double quotes at the query site.

**3. Type coercion — string ID columns (10+ tests)**
```
DataError: invalid input for query argument $N: 1 (expected str, got int)
DataError: invalid input for query argument $N: '1' ('str' object cannot
be interpreted as an integer)
```
Tests are passing integer or string IDs to columns that expect the
opposite. Recent schema changed some ID columns from int to
varchar (or vice versa) and the fixture factories weren't updated.
Hits `test_tools_hamilton.py`, `test_tools_peer_research.py`,
`test_backfill_canonical.py` (already green after today's fix, but
the pattern is there).

**4. Missing required-NOT-NULL columns in fixtures (many tests)**
```
NotNullViolationError: null value in column "..." violates not-null
```
Columns added by Phase 62b migrations (`content_md`, `source_date`,
`title`, `wave_size`, `entity_id`, `charter_type`, `report_type`,
`model`, `fee_category`, `institution_id`) are not being populated by
test fixtures. Either the fixtures are stale or the migration landed
a NOT NULL the app code now respects but the tests don't know about.

**5. Foreign-key violations in fixture setup (4+ tests)**
```
ForeignKeyViolationError: Key (fee_id)=(1) is not present in
table "extracted_fees"
```
Fixtures are referencing rows that don't exist. Likely cascade-delete
order issue in conftest teardown, or tests creating references before
the parent row.

**6. Check-constraint violation (test_sc2)**
```
CheckViolationError: new row for relation "hamilton_priority_alerts"
violates check constraint "hamilton_priority_alerts_status_check"
```
Test is sending `status='unread'` but the column enforces a different
enum set. Either the check constraint shape changed or the test was
written against an old spec.

**7. Missing Knox override table (test_knox_review_overrides.py)**
```
test_knox_overrides_table_present FAILED
```
Table doesn't exist in the CI-applied schema. Migration wasn't shipped
or isn't in the `scripts/migrate-schema.sql` baseline the conftest
applies. Phase 62b expected it.

## Solution

This is not a single fix — it's a cleanup wave. Split into slices:

1. **Codec slice** — register jsonb codec on asyncpg pool construction
   in `conftest.py` and any production connection factory it mirrors.
   Unblocks jsonb-touching tests (`test_sc1_recent_agent_events`,
   others).

2. **Migration slice** — audit `supabase/migrations/*` vs the test
   baseline (`scripts/migrate-schema.sql`). Anything in migrations
   but not baseline is a test-time schema drift. Confirm the Knox
   override table migration is listed and being applied.

3. **Fixture slice** — walk the failing tests top-down, for each
   fixture factory fill in all NOT NULL columns introduced by Phase
   62a/62b. Probably 2–3 shared factories cover the bulk.

4. **ID-type slice** — find every test asserting string/int ID
   semantics and align with the schema. One-time sweep, then add a
   guard test that inspects `information_schema.columns` for ID
   columns and fails on drift.

5. **Reserved-word slice** — quote the `window` column in the
   agent-budget query; audit all identifiers against the Postgres
   reserved-word list.

Do these as separate PRs, land them in order 1 → 2 → 3 → 4 → 5, so
each one reduces failure count measurably. Expect the jsonb codec fix
alone to drop the failure count by 8–12.

## Context

- Phase 62a introduced the Postgres integration harness
  (`pytest-postgresql` + `asyncpg` + migration apply on `conftest`).
  The 38 failures suggest the harness landed before all downstream
  tests were brought up to its shape.
- Phase 62b added new tables / columns that production code writes to
  correctly, but tests weren't updated in the same commit.
- Today's session fixed conftest import (asyncpg missing from root
  requirements.txt) and agent-tool-types codegen drift. Those were
  pre-test-execution failures. The 38 here are in-test failures that
  need the slices above.
- Baseline run for tracking progress: run 24635381196 on commit
  `d59a28b` — 38 failed, 430 passed, 12 errors. Subsequent commits
  should drive the failure count down.
