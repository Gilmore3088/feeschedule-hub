---
date: 2026-04-06
problem_type: architecture_design
severity: critical
tags: [state-agent, discovery, extraction, playwright, modal, compounding-knowledge]
states_tested: [WY, MT]
---

# State Agent E2E Pipeline — Learnings from WY + MT Pilot

## What We Built

5-stage state agent running on Modal with Playwright:
1. **Inventory** — load institutions from DB, categorize by data availability
2. **Discover** — AI + Playwright finds fee schedule URLs (3-strategy cascade)
3. **Classify** — detect document type (PDF / HTML / JS-rendered)
4. **Extract** — specialist sub-agent per doc type → Claude tool use for fee extraction
5. **Validate** — Claude reviews extracted fees for quality

## Results

| State | Institutions | Before | After | Coverage |
|-------|-------------|--------|-------|----------|
| WY | 43 | 11 (26%) | 25 (58%) | +127% |
| MT | 77 | 16 (21%) | 36 (47%) | +125% |

## Key Bugs Found & Fixed

### 1. `crawl_results.crawl_run_id` NOT NULL constraint
**Symptom:** `_write_fees()` crashed inserting crawl_results without a crawl_run_id.
**Fix:** Removed crawl_results insert from agent — it's not needed. Agent only writes to extracted_fees and updates crawl_targets timestamps.
**Lesson:** Don't mirror the existing pipeline's DB writes. The agent has its own tracking tables (agent_runs, agent_run_results).

### 2. `fee_reviews` foreign key constraint
**Symptom:** DELETE FROM extracted_fees failed because fee_reviews references it.
**Fix:** Delete fee_reviews first, then extracted_fees (for non-approved fees only).
**Lesson:** Always check FK constraints before bulk deletes. The existing pipeline has this same pattern in `llm_batch_worker.py`.

### 3. psycopg2 transaction state after errors
**Symptom:** After an extraction error, all subsequent DB queries failed with "InFailedSqlTransaction".
**Fix:** Added `conn.rollback()` in every exception handler before writing error records.
**Lesson:** psycopg2 requires explicit rollback after any failed query. Add rollback to ALL error handlers in the orchestrator.

### 4. Modal `@web_endpoint` renamed to `@fastapi_endpoint`
**Symptom:** "invalid function call" when calling Modal endpoint.
**Fix:** Renamed decorator, added `fastapi[standard]` to Modal images, used Pydantic models instead of `dict` for request bodies.
**Lesson:** Modal's API changes — always check deprecation warnings in deploy output.

### 5. Modal free tier limited to 5 cron jobs
**Symptom:** Deploy failed with "reached limit of 5 cron jobs".
**Fix:** Merged `ingest_daily` and `ingest_weekly` into single `ingest_data` function that checks weekday internally.
**Lesson:** Count your cron jobs before adding new Modal functions.

## Discovery Strategy — What Works

### 3-Strategy Cascade (in order):
1. **AI-guided navigation** (7 page loads max) — Claude reads links, navigates to promising pages
2. **PDF link scanning** — collect all PDF URLs from every page visited, score by fee-related keywords
3. **Common path probing** — try 30+ known paths (/fee-schedule, /disclosures, /rates, etc.)

### Discovery Improvements That Helped:
- **Direct link detection** before asking Claude — scan link text for "fee schedule", "schedule of fees", etc.
- **Disclosures page scanning** — navigate to /disclosures specifically and scan all PDFs there
- **Page content detection** — check if a navigated page IS the fee schedule (3+ fee keywords)
- **Aggressive AI prompt** — "NEVER give up on the first page, always navigate at least once"
- **More common paths** — credit union patterns (/members/fees), CMS patterns (/content/fee-schedule)

### What Doesn't Work:
- **Keyword-only discovery** (the old UrlDiscoverer) — misses JS-rendered sites entirely
- **Basic HTTP fetch** — ~40% of bank sites are JS-rendered (Kentico, WordPress with React, custom SPAs)
- **Giving up after 5 pages** — many fee schedules are 3-4 clicks deep
- **Google search via Playwright** — gets CAPTCHAs, unreliable

### The Remaining ~40% That Fail:
- Small community banks/CUs with minimal websites (no disclosures page at all)
- Sites where fee schedule is truly not published online (in-branch only)
- Trust companies and specialty banks (no consumer fee schedule)
- Sites behind login walls

## Extraction — What Works

### PDF Specialist:
- pdfplumber for text extraction, Claude Haiku for fee parsing
- Tool use with `extract_fees` tool — structured output, reliable
- 12K char limit (was 8K, increased for larger PDFs)
- Broader system prompt listing all common fee categories

### HTML Specialist:
- BeautifulSoup, strip nav/header/footer, send text to Claude
- Works well for static HTML fee schedule pages

### JS Specialist (key innovation):
- Playwright renders the page fully
- If page has fee content (3+ keywords) → extract directly
- If page is a link index (like Space Coast) → follow sub-links to actual fee content
- Can follow PDF links from JS-rendered pages

### Extraction Failures:
- Empty PDFs (scanned images without OCR)
- Pages that are "about fees" but not actual fee schedules (articles, blog posts)
- Very thin content (1-2 fees when the institution has 20+)

## Architecture Decisions

### Why Modal, Not Vercel:
- Playwright needs real browser runtime
- 77 institutions × 2-3 min each = 30+ min (beyond Vercel's 300s limit)
- Modal has Python environment + all dependencies already
- Progress written to DB, UI polls — no long-lived connections

### Why Not the Existing Crawl Pipeline:
- No JS-rendering detection (basic HTTP only)
- No AI-powered discovery (keyword heuristics only)
- Linear pipeline with no recovery (fails silently)
- No per-institution progress tracking

### DB Design:
- `agent_runs` — one row per state run, tracks aggregate progress
- `agent_run_results` — one row per institution per stage, stores detail JSON
- Writes to existing `extracted_fees` and `crawl_targets` tables (no new fee tables)
- Progress updated after each institution (crash-safe)

## Next Steps (Captured as Architecture Vision)

1. **Knowledge compounding** — state-level + national-level knowledge docs that improve with each run
2. **National orchestrator** — manages 50 state agents
3. **Admin UI improvements** — "needs manual review" list per state, agent progress dashboard
4. **Efficiency** — skip institutions with valid URLs on subsequent runs, only re-extract
