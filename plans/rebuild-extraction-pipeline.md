# Rebuild Extraction Pipeline

## Current State
- 2,939 fee URLs (1,075 PDF, 1,864 HTML)
- Only 43 documents stored in R2
- 645 institutions with URLs but no fees
- 16% extraction success rate
- Pipeline explored thoroughly — all code paths documented

## Three Independent Extraction Paths

### Path 1: PDF (1,075 institutions)
download → R2 store → pdfplumber → OCR fallback → LLM → validate → fees

### Path 2: Static HTML (estimated ~800 institutions)
download → R2 store → BeautifulSoup → check for embedded PDF links → LLM → validate → fees

### Path 3: JS-Rendered (estimated ~1,064 institutions)
Playwright → R2 store → BeautifulSoup → LLM → validate → fees

## Key Changes Needed

1. **Force R2 storage** — make R2 upload mandatory, not best-effort
2. **Re-crawl all 2,896** institutions missing R2 documents
3. **Split Modal extraction** into PDF worker (cheap, fast) and browser worker (expensive, slow)
4. **Embedded PDF detection** — when HTML page has no fee text, find and follow PDF links
5. **Browser context reuse** — one browser per Modal container, contexts per page

## Implementation Tasks

### Task 1: Make R2 storage mandatory in download.py
### Task 2: Add re-crawl command (clear hashes, force re-download)
### Task 3: Split Modal into PDF-only and browser workers
### Task 4: Improve embedded PDF link extraction
### Task 5: Add browser context reuse in playwright_fetcher.py
### Task 6: Run full re-crawl of all 2,939 institutions

## Files to Modify
- fee_crawler/pipeline/download.py — force R2
- fee_crawler/pipeline/playwright_fetcher.py — browser reuse
- fee_crawler/commands/crawl.py — embedded PDF improvements
- fee_crawler/modal_app.py — split workers
- fee_crawler/commands/recrawl.py — new command for bulk re-crawl
