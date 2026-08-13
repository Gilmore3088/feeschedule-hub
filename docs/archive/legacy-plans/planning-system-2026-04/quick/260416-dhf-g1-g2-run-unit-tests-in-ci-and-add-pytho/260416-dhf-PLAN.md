---
id: 260416-dhf
title: G1+G2 — Run unit tests in CI + add taxonomy parity tripwire tests
mode: quick
status: in_progress
---

# Plan: G1 + G2

Closes two gaps identified by audit `260416-d9t`:

- **G1:** `test_never_merge.py` is not run in CI — no pytest marker, existing workflow filters by marker only. Any alias expansion could ship a regulatory-category merge undetected.
- **G2:** No unit test asserts the Python `CANONICAL_KEY_MAP` count matches the TS `CANONICAL_KEY_COUNT`. Both currently have 173 entries but could drift silently.

## Tasks

### Task 1: G1 — Unit tests CI workflow

- **File:** `.github/workflows/unit-tests.yml` (new)
- **Action:** Create workflow that runs on `push` to `main` and on every `pull_request`, executing `pytest -m "not e2e and not llm and not slow"` against `fee_crawler/tests/`. No system deps, no API keys.
- **Verify:** Workflow file is valid YAML and references pytest markers that exclude e2e/llm/slow.
- **Done when:** `test_never_merge.py`'s 24 tests run on every push/PR, failing the build if NEVER_MERGE pairs are violated.

### Task 2: G2-TS — Tripwire assertion in TS

- **File:** `src/lib/fee-taxonomy.test.ts` (edit)
- **Action:** Add test asserting `CANONICAL_KEY_COUNT === 173` and `TAXONOMY_COUNT === 49`. Comment the tripwire intent.
- **Verify:** `npx vitest run src/lib/fee-taxonomy.test.ts` passes.
- **Done when:** Any change to TS `CANONICAL_KEY_MAP` size breaks the test, forcing a paired update on both sides.

### Task 3: G2-PY — Tripwire assertion in Python

- **File:** `fee_crawler/tests/test_backfill_canonical.py` (edit — add sibling test)
- **Action:** Add test asserting `len(CANONICAL_KEY_MAP) == 173` and 49 base categories. Comment the tripwire intent. This test runs under G1's new CI job.
- **Verify:** `pytest fee_crawler/tests/test_backfill_canonical.py` passes.
- **Done when:** Any change to Python `CANONICAL_KEY_MAP` size breaks the test.

## Tripwire design

Both sides hard-code the expected count. Adding a key on only one side breaks one test, which signals to the engineer: update the other side too. Simpler than a shared fixture; achieves the same practical parity guarantee.

## Out of scope

- G3 (operator verification of prod backfill execution)
- G4 (operator verification of Roomba flagging in prod)
- G5 (SQLite schema drift — deferred per `project_kill_sqlite.md`)
- Any changes to CANONICAL_KEY_MAP entries themselves
