---
phase: 59-pipeline-coverage-expansion
plan: 01
subsystem: fee_crawler/pipeline
tags: [stealth, playwright, cloudflare, pdf-probe, bot-detection, url-discovery]
dependency_graph:
  requires: []
  provides: [stealth-fetcher, cloudflare-detection, pdf-probe, accessibe-blacklist]
  affects: [crawl-pipeline, url-discovery]
tech_stack:
  added: [playwright-stealth-2.0.3]
  patterns: [stealth-context-patching, ua-rotation, pdf-pattern-probing, google-search-fallback]
key_files:
  created:
    - fee_crawler/tests/test_stealth_fetcher.py
    - fee_crawler/tests/test_cloudflare_detection.py
    - fee_crawler/tests/test_pdf_probe.py
  modified:
    - fee_crawler/requirements.txt
    - fee_crawler/pipeline/playwright_fetcher.py
    - fee_crawler/pipeline/download.py
    - fee_crawler/commands/crawl.py
    - fee_crawler/pipeline/url_discoverer.py
decisions:
  - playwright-stealth applied at context level (not page) per library docs
  - Stealth retry inserted BEFORE 403 URL-clear to preserve discovered URLs
  - PDF probe uses break-on-first-success to minimize HEAD requests
  - Google search fallback limited to first result to avoid noise
metrics:
  duration: 7m
  completed: 2026-04-11T05:06:35Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 22
  files_modified: 5
  files_created: 3
requirements_completed: [COV-01, COV-02]
---

# Phase 59 Plan 01: Stealth Fetcher + PDF Probe Summary

Playwright-stealth integration with UA rotation for bot-detection bypass, Cloudflare challenge detection, auto-fallback on 403 in crawl pipeline, PDF URL probing via HEAD-first pattern matching with Google search fallback, and accessibe.com domain blacklisting.

## Task Completion

| Task | Name | Commit(s) | Files |
|------|------|-----------|-------|
| 1 | Stealth fetcher + Cloudflare detection + 403 auto-fallback | 002728e (RED), 8569679 (GREEN) | playwright_fetcher.py, download.py, crawl.py, requirements.txt, test_stealth_fetcher.py, test_cloudflare_detection.py |
| 2 | PDF probe + Google fallback + blacklist | e6c98af (RED), 8108003 (GREEN) | url_discoverer.py, test_pdf_probe.py |

## What Was Built

### Task 1: Stealth Fetcher + Cloudflare Detection

- Added `playwright-stealth>=2.0.3` to requirements.txt
- `fetch_with_browser()` accepts `stealth: bool = False` parameter
- When `stealth=True`: applies `Stealth().apply_stealth_sync(context)` BEFORE `context.new_page()`, selects random UA from `USER_AGENT_LIST` (7 entries), adds 2-5s random delay before navigation
- `_is_cloudflare_blocked(content: bytes)` detects challenge pages by scanning first 4096 bytes for markers: cf-browser-verification, checking your browser, cloudflare, challenge-platform
- `_crawl_one()` in crawl.py retries with stealth Playwright on 403 BEFORE clearing the URL (fixes Pitfall 4 from research)
- Cloudflare-blocked results recorded with `failure_reason='cloudflare_blocked'` (differentiates from dead_url)
- `download_document()` passes `stealth` flag through to `fetch_with_browser()`
- 11 tests: UA list validation, stealth context patching, non-stealth default, UA rotation, 7 Cloudflare detection scenarios

### Task 2: PDF URL Probe + Google Fallback + Blacklist

- `PDF_DIRECT_PROBE_PATHS`: 14 PDF-specific URL paths (/fees.pdf, /fee-schedule.pdf, etc.)
- `_BLACKLISTED_DOMAINS`: accessibe.com, ada.com, levelaccess.com, userway.org
- `_is_blacklisted()` checks hostname and subdomains (www.accessibe.com also blocked)
- `probe_pdf_urls()` does HEAD-first pattern probing across 14 paths, breaks on first PDF found, falls back to Google search when probing finds nothing
- `_google_search_pdf_fallback()` uses existing `_search_google()` from google_discover.py, filters blacklisted domains from results
- Blacklist wired into `_score_link()` in URL discovery pipeline
- 11 tests: path list validation, blacklist checks (5 cases), probe behavior (4 cases), Google fallback with blacklist filtering

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

```
22 tests passing across 3 new test files
All acceptance criteria grep checks passing
Key integrations verified present in source
```

## Self-Check: PASSED

All 8 files verified present. All 4 commits verified in git log.
