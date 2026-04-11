---
phase: 59-pipeline-coverage-expansion
verified: 2026-04-10T20:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Run crawl with --stealth flag against a known bot-blocking bank and verify fee extraction succeeds"
    expected: "Previously 403'd institution now returns content and fees are extracted"
    why_human: "Requires network access to real bank websites and bot-detection varies by site"
  - test: "Run crawl with --pdf-probe flag on institutions with no fee_schedule_url and verify PDF discovery"
    expected: "At least some institutions gain fee_schedule_url from probed PDF paths or Google fallback"
    why_human: "Requires network access, real DNS resolution, and HEAD requests to external servers"
---

# Phase 59: Pipeline Coverage Expansion Verification Report

**Phase Goal:** The crawler extracts fees from a meaningfully larger share of big bank and JS-rendered fee schedule pages -- coverage gaps visible in the admin are reduced
**Verified:** 2026-04-10T20:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Stealth Playwright mode bypasses bot detection on 403 pages | VERIFIED | `fetch_with_browser(stealth=True)` applies `playwright_stealth.Stealth().apply_stealth_sync(context)` at context level, rotates UA from 7-entry list, adds 2-5s random delay. Wired into `_crawl_one()` as auto-retry on 403 before URL-clear. |
| 2 | Cloudflare challenge pages are detected and differentiated from dead URLs | VERIFIED | `_is_cloudflare_blocked()` scans first 4096 bytes for 4 markers (cf-browser-verification, checking your browser, cloudflare, challenge-platform). Records `failure_reason='cloudflare_blocked'` distinct from `dead_url`. |
| 3 | PDF URL probing discovers fee schedules via pattern matching | VERIFIED | `probe_pdf_urls()` tries 14 PDF path patterns via HEAD requests, breaks on first success, falls back to Google search. Wired into crawl command as `--pdf-probe` pre-step that queries institutions with NULL/failed URLs ordered by asset_size DESC. |
| 4 | Accessibility overlay domains are blacklisted from URL discovery | VERIFIED | `_BLACKLISTED_DOMAINS` contains accessibe.com, ada.com, levelaccess.com, userway.org. `_is_blacklisted()` checks hostname + subdomains. Wired into `_score_link()` and Google fallback filtering. |
| 5 | CLI flags (--stealth, --pdf-probe) pass through entire crawl chain | VERIFIED | `__main__.py` defines both flags. `--stealth` passes through `run()` -> `_run_serial()`/`_run_concurrent()` -> `_crawl_one()` -> `download_document(stealth=True)`. `--pdf-probe` triggers pre-step in `run()` before main crawl loop. `crawl_strategy` column migration added in db.py V4. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `fee_crawler/pipeline/playwright_fetcher.py` | Stealth mode in fetch_with_browser | VERIFIED | 486 lines. stealth param, Stealth().apply_stealth_sync(), USER_AGENT_LIST (7 entries), _is_cloudflare_blocked() |
| `fee_crawler/pipeline/download.py` | Stealth passthrough to browser | VERIFIED | 259 lines. download_document() accepts stealth param, passes to fetch_with_browser() |
| `fee_crawler/pipeline/url_discoverer.py` | PDF probing + blacklist | VERIFIED | probe_pdf_urls(), PDF_DIRECT_PROBE_PATHS (14), _BLACKLISTED_DOMAINS (4), _is_blacklisted(), _google_search_pdf_fallback() |
| `fee_crawler/commands/crawl.py` | 403 stealth retry + PDF probe pre-step + stealth flag chain | VERIFIED | _crawl_one() retries 403 with stealth before URL-clear. run() has pdf_probe pre-step. stealth flows through run->serial/concurrent->_crawl_one->download_document |
| `fee_crawler/__main__.py` | --stealth and --pdf-probe CLI flags | VERIFIED | Both flags defined with argparse, passed via getattr() to cmd_crawl() |
| `fee_crawler/db.py` | crawl_strategy column migration | VERIFIED | _MIGRATE_CRAWL_TARGETS_V4 with ALTER TABLE ADD COLUMN crawl_strategy TEXT |
| `fee_crawler/requirements.txt` | playwright-stealth dependency | VERIFIED | playwright-stealth>=2.0.3 present |
| `fee_crawler/tests/test_stealth_fetcher.py` | Stealth unit tests | VERIFIED | 4 tests passing |
| `fee_crawler/tests/test_cloudflare_detection.py` | Cloudflare detection tests | VERIFIED | 7 tests passing |
| `fee_crawler/tests/test_pdf_probe.py` | PDF probe unit tests | VERIFIED | 11 tests passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| crawl.py _crawl_one() | playwright_fetcher.py | `from fee_crawler.pipeline.playwright_fetcher import fetch_with_browser, _is_cloudflare_blocked` | WIRED | Import + call on 403 retry path |
| download.py | playwright_fetcher.py | `from fee_crawler.pipeline.playwright_fetcher import needs_browser_fallback, fetch_with_browser` | WIRED | Import + call with stealth param |
| crawl.py run() | url_discoverer.py | `discoverer.probe_pdf_urls()` | WIRED | Called in pdf_probe pre-step block |
| __main__.py | crawl.py | `cmd_crawl(stealth=, pdf_probe=)` via getattr() | WIRED | Both flags forwarded |
| crawl.py run() | _run_serial/_run_concurrent | `stealth=stealth` kwarg | WIRED | Full chain through to _crawl_one |
| db.py | crawl_targets table | _MIGRATE_CRAWL_TARGETS_V4 | WIRED | Added to migration list in _run_migrations() |

### Data-Flow Trace (Level 4)

Not applicable -- this phase modifies the crawler pipeline (Python CLI tool), not a UI component that renders dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CLI shows --stealth flag | `python -m fee_crawler crawl --help` | --stealth flag present with description | PASS |
| CLI shows --pdf-probe flag | `python -m fee_crawler crawl --help` | --pdf-probe flag present with description | PASS |
| All 22 phase tests pass | `pytest test_stealth_fetcher.py test_cloudflare_detection.py test_pdf_probe.py` | 22 passed in 0.23s | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COV-01 | 59-01, 59-02 | Not defined in REQUIREMENTS.md | ? ORPHANED | Referenced in summaries but not present in REQUIREMENTS.md (which covers v7.0 Hamilton only). Phase 22 in ROADMAP references COV-01 for Wave Reporting. |
| COV-02 | 59-01, 59-02 | Not defined in REQUIREMENTS.md | ? ORPHANED | Referenced in summaries but not present in REQUIREMENTS.md. No definition found. |

Note: Phase 59 is not present in ROADMAP.md. This appears to be an ad-hoc phase outside the tracked milestone structure. COV-01/COV-02 are referenced in the summaries but have no formal definition in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns found in phase files |

No TODO/FIXME/placeholder/stub patterns detected in any modified files.

### Human Verification Required

### 1. Stealth Crawl Against Bot-Blocking Bank

**Test:** Run `python -m fee_crawler crawl --stealth --limit 5` targeting institutions known to return 403
**Expected:** At least some previously-blocked institutions return content and proceed to extraction
**Why human:** Requires network access to real bank websites; bot detection behavior varies by site and changes over time

### 2. PDF Probe Discovery

**Test:** Run `python -m fee_crawler crawl --pdf-probe --limit 10` on institutions with no fee_schedule_url
**Expected:** At least some institutions discover PDF URLs via pattern probing or Google fallback
**Why human:** Requires live network access, DNS resolution, and HEAD requests to external bank servers

### Gaps Summary

No code-level gaps found. All artifacts exist, are substantive (no stubs), are wired into the pipeline, and 22 unit tests pass.

Two items require human verification: the stealth mode and PDF probe features need real-world network testing to confirm they achieve the stated goal of extracting fees from "a meaningfully larger share" of big bank pages. The code is correctly implemented but the actual coverage improvement can only be measured by running against live bank websites.

---

_Verified: 2026-04-10T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
