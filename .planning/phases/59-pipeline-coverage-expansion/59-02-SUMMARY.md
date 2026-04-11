---
phase: 59-pipeline-coverage-expansion
plan: 02
subsystem: fee_crawler/commands
tags: [cli, stealth, pdf-probe, crawl-strategy, migration]
dependency_graph:
  requires: [59-01]
  provides: [crawl-stealth-flag, crawl-pdf-probe-flag, crawl-strategy-migration]
  affects: [crawl-pipeline, cli-interface, db-schema]
tech_stack:
  added: []
  patterns: [cli-flag-passthrough, pre-step-pipeline, parameterized-migration]
key_files:
  created: []
  modified:
    - fee_crawler/db.py
    - fee_crawler/__main__.py
    - fee_crawler/commands/crawl.py
decisions:
  - PDF probe pre-step runs before main crawl loop, not as a separate command
  - Probe query uses parameterized LIMIT (not f-string) for safety
  - Stealth flag passes through entire call chain (run -> _run_serial/_run_concurrent -> _crawl_one -> download_document)
  - crawl_strategy migration added as V4 migration list (follows existing V1/V2/V3 pattern)
metrics:
  duration: 7m
  completed: 2026-04-11T05:25:00Z
  tasks_completed: 1
  tasks_total: 1
  tests_added: 0
  files_modified: 3
  files_created: 0
requirements_completed: [COV-01, COV-02]
---

# Phase 59 Plan 02: Wire Stealth + PDF Probe into Crawl CLI Summary

CLI integration of stealth Playwright mode and PDF URL probing into the crawl command, with crawl_strategy column migration for tracking extraction approach per institution.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add crawl_strategy migration + --stealth/--pdf-probe CLI flags + PDF probe pre-step | c7366b0 | db.py, __main__.py, crawl.py |

## What Was Built

### crawl_strategy Migration (db.py)

- Added `_MIGRATE_CRAWL_TARGETS_V4` with `ALTER TABLE crawl_targets ADD COLUMN crawl_strategy TEXT`
- Follows existing idempotent migration pattern (try/except on OperationalError)
- Column was already written to by crawl.py (_determine_crawl_strategy) but had no migration

### CLI Flags (__main__.py)

- `--stealth`: Forces Playwright stealth mode for all initial fetches in the crawl run
- `--pdf-probe`: Runs PDF URL probing pre-step before main crawl loop
- Both flags passed through cmd_crawl() to run() via getattr() pattern (matches existing convention)

### PDF Probe Pre-Step (crawl.py)

- Runs after crawl run record creation, before target query
- Queries institutions with `website_url IS NOT NULL AND (fee_schedule_url IS NULL OR failure_reason IN ('dead_url', 'cloudflare_blocked'))`
- Ordered by `asset_size DESC NULLS LAST` (biggest banks first, per D-05)
- Uses UrlDiscoverer.probe_pdf_urls() from Plan 01 with DomainRateLimiter(min_delay=1.0)
- Stores first discovered PDF URL back to crawl_targets.fee_schedule_url, sets document_type='pdf', clears failure_reason
- Respects --limit flag (caps probe set size per T-59-08)

### Stealth Flag Passthrough (crawl.py)

- Full chain: run() -> _run_serial()/_run_concurrent() -> _crawl_one() -> download_document(stealth=True)
- When --stealth is active, ALL initial fetches use Playwright stealth (not just 403 retries)
- Auto-fallback (403 -> stealth retry) continues to work without --stealth flag (Plan 01 behavior preserved)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `python -m fee_crawler crawl --help` shows --stealth and --pdf-probe flags
- All 7 acceptance criteria grep checks pass
- 162 unit tests pass (pytest, excluding e2e which requires ANTHROPIC_API_KEY)
- E2E test failure is pre-existing (needs API key + network), not related to changes

## Self-Check: PASSED
