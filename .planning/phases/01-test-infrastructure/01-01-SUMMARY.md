---
phase: 01-test-infrastructure
plan: "01"
subsystem: test-infrastructure
tags: [pytest, markers, geography, conftest, test-isolation]
dependency_graph:
  requires: []
  provides: [pytest-markers, geography-fixture, knowledge-stubs]
  affects: [fee_crawler/tests/]
tech_stack:
  added: [pytest-timeout>=2.3]
  patterns: [pytest_addoption hook, session fixture, filterwarnings escalation]
key_files:
  created:
    - pyproject.toml
    - conftest.py
    - fee_crawler/tests/conftest.py
    - fee_crawler/tests/knowledge/VT.md
    - fee_crawler/tests/knowledge/RI.md
  modified:
    - requirements.txt
decisions:
  - "conftest.py placed at rootdir (project root) not fee_crawler/tests/ — pytest_addoption must be in rootdir conftest for argument parsing to work before test collection"
  - "pytest-timeout added to requirements.txt — required for timeout=600 config option in pyproject.toml"
metrics:
  duration: "245s"
  completed: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 6
requirements_satisfied: [INFRA-01, INFRA-02]
---

# Phase 1 Plan 01: Pytest Markers and Geography Fixture Summary

**One-liner:** Registered e2e/llm/slow pytest markers with PytestUnknownMarkWarning escalation and --geography CLI option with session fixture and VT/RI knowledge stubs.

## What Was Built

Established the pytest test infrastructure foundation for the Bank Fee Index e2e pipeline tests:

1. **pyproject.toml** — Created with `[tool.pytest.ini_options]` registering three markers (e2e, llm, slow), `testpaths`, `timeout=600`, and `filterwarnings` that elevates `PytestUnknownMarkWarning` to an error.

2. **conftest.py (rootdir)** — `pytest_addoption` hook registering `--geography` (default `state=VT`) and `geography` session fixture that parses `state=XX` format, enforces WY exclusion guard, and returns `{'type': ..., 'code': ...}`.

3. **fee_crawler/tests/conftest.py** — Package-level conftest with documentation explaining why `pytest_addoption` must not be redefined here.

4. **Knowledge stubs** — `fee_crawler/tests/knowledge/VT.md` and `RI.md` with institution counts, FDIC filter strings, coverage targets (D-05), and placeholder sections for post-run population (D-06).

## Verification Results

- `pytest -m e2e` — 0 tests collected, 42 deselected (marker recognized, no error)
- `pytest -m slow` — 0 tests collected, 42 deselected
- `pytest -m "not llm"` — 42 tests collected
- `pytest --geography state=VT` — 42 tests collected, no error
- `pytest --geography state=RI` — 42 tests collected, no error
- WY guard logic verified (raises `ValueError: state=WY is excluded...`)
- All 42 existing unit tests pass without regression

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] conftest.py placed at rootdir instead of fee_crawler/tests/**

- **Found during:** Task 2 implementation
- **Issue:** The plan specified `fee_crawler/tests/conftest.py` as the location for `pytest_addoption`, but pytest requires `pytest_addoption` to be in a conftest.py at or above the rootdir for argument parsing. Running `pytest --geography state=RI` produced `error: unrecognized arguments: --geography` because the subdirectory conftest wasn't loaded before argument parsing.
- **Fix:** Created `conftest.py` at the project root (rootdir = where `pyproject.toml` lives). Kept `fee_crawler/tests/conftest.py` as a package-level file with documentation explaining the constraint.
- **Files modified:** Created `conftest.py` (root), `fee_crawler/tests/conftest.py` (doc-only stub)
- **Commit:** 23295be

**2. [Rule 3 - Missing Dependency] Added pytest-timeout to requirements.txt**

- **Found during:** Task 1 verification
- **Issue:** `pyproject.toml` specified `timeout = 600` but `pytest-timeout` was not installed, causing `PytestConfigWarning: Unknown config option: timeout` on every pytest run.
- **Fix:** Installed `pytest-timeout` and added `pytest-timeout>=2.3` to `requirements.txt`.
- **Files modified:** `requirements.txt`
- **Commit:** 1b8b4a2

## Known Stubs

The following files are intentional stubs per D-06 (knowledge population deferred to Milestone 2):

| File | Stub Content | Reason |
|------|-------------|--------|
| `fee_crawler/tests/knowledge/VT.md` | Known Institutions table empty | Populated after first seed run |
| `fee_crawler/tests/knowledge/RI.md` | Known Institutions table empty | Populated after first seed run |

These stubs do not block the plan goal — the knowledge directory structure is established for Phase 2+ to populate.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

All created files verified on disk. All commits found in git log.

| Check | Result |
|-------|--------|
| pyproject.toml | FOUND |
| conftest.py (root) | FOUND |
| fee_crawler/tests/conftest.py | FOUND |
| fee_crawler/tests/knowledge/VT.md | FOUND |
| fee_crawler/tests/knowledge/RI.md | FOUND |
| commit 1b8b4a2 | FOUND |
| commit 23295be | FOUND |
