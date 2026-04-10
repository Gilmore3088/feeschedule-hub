# Phase 59: Pipeline Coverage Expansion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-10
**Phase:** 59-pipeline-coverage-expansion
**Areas discussed:** PDF direct-link strategy, Playwright stealth approach, Coverage prioritization, Pipeline integration

---

## PDF Direct-Link Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Google search + URL probing | site:bank filetype:pdf + pattern probing | Y |
| Manual curation | Hand-pick top 50 bank PDFs | |
| You decide | Claude picks discovery strategy | |

**User's choice:** Google search + URL probing

| Option | Description | Selected |
|--------|-------------|----------|
| pdfplumber + LLM fallback | Text extract first, OCR fallback, then LLM | Y |
| LLM-only with PDF upload | Send PDF to Claude vision API | |
| You decide | Claude picks | |

**User's choice:** pdfplumber + LLM fallback

## Playwright Stealth Approach

| Option | Description | Selected |
|--------|-------------|----------|
| playwright-stealth + rotating UAs | Stealth plugin + UA rotation + random delays | Y |
| Full residential proxy rotation | Stealth + residential proxies (monthly cost) | |
| You decide | Claude picks | |

**User's choice:** playwright-stealth + rotating user agents

| Option | Description | Selected |
|--------|-------------|----------|
| Detect and skip with retry later | Mark cloudflare_blocked, retry next crawl | Y |
| Solve challenges with browser | Wait for JS challenge to resolve | |
| You decide | Claude picks | |

**User's choice:** Detect and skip with retry later

## Coverage Prioritization

| Option | Description | Selected |
|--------|-------------|----------|
| Biggest banks by assets without fees | Query by total_assets desc, zero fees | Y |
| Highest complaint-rate institutions | Most CFPB complaints, no fee data | |
| You decide | Claude triages | |

**User's choice:** Biggest banks by assets

| Option | Description | Selected |
|--------|-------------|----------|
| Top 50 missing big banks | Focus on 50 largest | |
| Top 100 | More ambitious | |
| All 116 previously failed | Re-attempt all failures | Y |

**User's choice:** All 116 previously failed

## Pipeline Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing crawl command | Add --stealth and --pdf-probe flags | Y |
| Separate stealth-crawl command | New command with own cron | |
| You decide | Claude picks | |

**User's choice:** Extend existing crawl command

| Option | Description | Selected |
|--------|-------------|----------|
| Same schedule, stealth as fallback | Auto-retry with stealth on 403 | Y |
| Separate late-night schedule | 1am ET stealth crawl | |
| You decide | Claude picks | |

**User's choice:** Same schedule, stealth as fallback

## Claude's Discretion
- accessibe.com blacklist, URL patterns, rate limiting, PDF URL storage

## Deferred Ideas
None
