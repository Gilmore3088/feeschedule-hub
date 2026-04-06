# Bank Fee Index — E2E Pipeline Test

## What This Is

An end-to-end test suite for the Bank Fee Index data pipeline. Verifies the full crawl-to-extract loop works correctly: seeding institutions from a random geography, discovering their fee schedule URLs, crawling and extracting fees via LLM, categorizing and validating results, and confirming a complete audit trail in the database. Targets 3-5 institutions per test run.

## Core Value

Prove the pipeline works end-to-end — from a cold start with a random geography to verified fees in the database with full audit trail — so regressions are caught before they reach production.

## Requirements

### Validated

Existing capabilities inferred from current codebase:

- ✓ FDIC API institution seeding with website URLs — existing
- ✓ NCUA bulk data credit union seeding — existing
- ✓ Cascading fee schedule URL discovery (sitemap, common paths, homepage links, deep crawl) — existing
- ✓ PDF extraction via pdfplumber with OCR fallback — existing
- ✓ Browser extraction via Playwright for JS-rendered content — existing
- ✓ LLM fee extraction via Claude Haiku with tool-use schema — existing
- ✓ Fee categorization into 9 families / 49 categories — existing
- ✓ Confidence-based validation and auto-staging (≥0.85 threshold) — existing
- ✓ Outlier detection (3+ std dev flagging) — existing
- ✓ Content-addressed document storage (SHA-256 to R2) — existing
- ✓ Immutable audit trail in fee_reviews table — existing
- ✓ Admin review UI at /admin/fees/catalog — existing

### Active

- [ ] E2E test: seed institutions from a random state/county/MSA
- [ ] E2E test: discover fee schedule URLs for seeded institutions
- [ ] E2E test: crawl and extract fees from discovered URLs
- [ ] E2E test: categorize and validate extracted fees
- [ ] E2E test: verify full audit trail (crawl_results + extracted_fees + fee_reviews records)
- [ ] E2E test: assert 3-5 institutions processed with non-zero fee extraction
- [ ] E2E test: runnable locally and on Modal
- [ ] E2E test: uses isolated test database (no production data contamination)
- [ ] E2E test: produces summary report of what was found, extracted, and any failures

### Out of Scope

- Admin UI testing (Cypress/Playwright browser tests) — separate concern, not this milestone
- SerpAPI discovery fallback — never used, skip
- Public API endpoint testing — downstream of extraction, not pipeline core
- Performance benchmarking — correctness first
- Fee change tracking / snapshot comparison — post-extraction concern

## Context

- Python pipeline lives in `fee_crawler/` with CLI entry point `python -m fee_crawler <command>`
- Modal workers scheduled at 2AM/3AM/4AM/6AM ET for discovery/extraction/post-processing
- SQLite for local dev (`data/crawler.db`), PostgreSQL (Supabase) in production
- Fee taxonomy must stay in sync between Python (`fee_analysis.py`) and TypeScript (`fee-taxonomy.ts`)
- Existing pytest suite: 60 tests in `fee_crawler/tests/` covering fee_analysis and validation
- Content-addressed storage on Cloudflare R2 (local fallback: `data/documents/`)
- Two FDIC ingestion paths exist: `seed_institutions.py` (directory) and `ingest_fdic.py` (financials)

## Constraints

- **Test isolation**: Must use a separate test database, never touch production or dev data
- **Rate limiting**: Respect robots.txt and concurrent_per_domain: 1 during discovery/crawl
- **Cost**: LLM extraction costs real money — limit to 3-5 institutions per run
- **Time**: Full pipeline run may take 5-10 minutes — acceptable for e2e, not unit tests
- **Determinism**: Random geography selection means results vary — test assertions must be flexible (non-zero counts, not exact values)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Test 3-5 institutions per run | Balance coverage vs cost/time | — Pending |
| Random geography selection | Ensures broad coverage over time | — Pending |
| Isolated test database | Prevent data contamination | — Pending |
| Run locally and on Modal | Test both execution environments | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-06 after initialization*
