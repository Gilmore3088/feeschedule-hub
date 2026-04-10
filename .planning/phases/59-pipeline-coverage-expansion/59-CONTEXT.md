# Phase 59: Pipeline Coverage Expansion - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the crawler to extract fees from big bank PDF fee schedules and JS-rendered pages that currently fail due to bot detection. Target all 116 previously failed institutions. Add stealth Playwright mode as automatic fallback and PDF direct-link discovery via Google search + URL probing.

</domain>

<decisions>
## Implementation Decisions

### PDF Direct-Link Strategy
- **D-01:** Discover PDF URLs via Google search (`site:bankname.com filetype:pdf fee schedule`) + common URL pattern probing (/fees.pdf, /fee-schedule.pdf, /personal-banking/fees.pdf). Prior batches showed 33% conversion from Google search, 16% from pattern probing.
- **D-02:** Process PDFs with pdfplumber first (fast, free text extraction). Fall back to tesseract OCR for scanned PDFs. Then send extracted text to LLM for fee extraction. pdfplumber and tesseract already in dependencies.

### Playwright Stealth Approach
- **D-03:** Use playwright-stealth plugin (patches navigator properties, WebGL, canvas fingerprint) + rotating user agents per request + random delays (2-5s between page loads). Playwright already in dependencies.
- **D-04:** Detect Cloudflare challenges (cf-browser-verification, JS challenge pages) and mark as 'cloudflare_blocked' status. Retry with stealth on next scheduled crawl. Don't waste LLM budget on challenge pages.

### Coverage Prioritization
- **D-05:** Target biggest banks by assets that have zero extracted fees first. Largest institutions represent the most visible coverage gaps.
- **D-06:** Target all 116 previously failed institutions from prior batches. Comprehensive re-attempt using the new stealth + PDF capabilities.

### Pipeline Integration
- **D-07:** Extend existing `crawl` command with `--stealth` and `--pdf-probe` flags. Stealth mode uses Playwright fetcher by default. PDF probe discovers and fetches direct PDF URLs. Same review queue, same pipeline. No separate command.
- **D-08:** Same schedule, stealth as automatic fallback. Standard crawl runs first. If a target fails with 403/bot-detection, auto-retry with stealth mode in the same crawl run. No separate cron needed.

### Claude's Discretion
- accessibe.com blacklist pattern (prior memory: false positive from JS batch)
- Specific URL patterns to probe beyond the common ones
- Rate limiting between stealth requests to avoid IP bans
- Whether to store discovered PDF URLs in crawl_targets for future re-crawls

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Crawl Pipeline
- `fee_crawler/pipeline/playwright_fetcher.py` -- Full Playwright fetcher with SSRF protection, browser singleton, resource blocking
- `fee_crawler/agents/extract_js.py` -- JS-rendered extraction agent using Playwright + LLM
- `fee_crawler/pipeline/download.py` -- Standard HTTP fetcher (requests-based)
- `fee_crawler/commands/crawl.py` -- Main crawl command with stage-based pipeline
- `fee_crawler/agents/strategy.py` -- Crawl strategy agent (decides extraction approach per institution)

### PDF Extraction
- `fee_crawler/agents/extract_pdf.py` -- Existing PDF extraction agent (pdfplumber + LLM)
- `fee_crawler/pipeline/r2_store.py` -- R2 storage for downloaded PDFs/HTML

### Prior Batch Results (Memory)
- 250 large banks re-extracted: 17 improved, 116 failed (bot-blocking)
- JS-rendered batch 1-250: 2.4% success, accessibe.com false positive needs blacklist
- Google URL research for 276 big banks: 90 extracted (33% conversion)
- Pattern-based URL probing for 500 banks: 78 found (16%), 28 extracted

### Modal Infrastructure
- `fee_crawler/modal_app.py` -- Cron schedule (2am discovery, 3am PDF, 4am browser, 5am Roomba, 6am post-processing)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `playwright_fetcher.py`: Complete stealth-capable fetcher -- just needs playwright-stealth plugin integration
- `extract_pdf.py`: PDF extraction agent with pdfplumber already works -- just needs direct-link PDF URL support
- `extract_js.py`: JS rendering agent already uses Playwright -- needs stealth flag passthrough
- `url_discoverer.py`: URL discovery pipeline -- extend with PDF probing logic

### Established Patterns
- Stage-based extraction: strategy agent decides approach -> dispatch to html/pdf/js agent
- crawl_results table tracks success/failure status per institution per crawl run
- Modal cron at specific hours (2am-6am ET)

### Integration Points
- `crawl.py` command needs `--stealth` and `--pdf-probe` flags
- `strategy.py` needs to route 403/bot-detected failures to stealth retry
- `playwright_fetcher.py` needs stealth plugin integration
- `download.py` needs Cloudflare challenge detection
- accessibe.com domain needs blacklisting in URL validation

</code_context>

<specifics>
## Specific Ideas

- Stealth mode should be invisible to the rest of the pipeline -- same output format as standard fetch, just a different fetcher under the hood
- PDF probe should store discovered URLs back in crawl_targets.fee_schedule_url so future crawls use the direct link
- The 116 previously failed institutions should be re-queued automatically, not requiring manual intervention
- accessibe.com overlay pages are a known false positive -- blacklist the domain pattern in URL validation

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 59-pipeline-coverage-expansion*
*Context gathered: 2026-04-10*
