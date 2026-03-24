# Smart Crawler Architecture

> **Problem:** Current pipeline has 8/50 success rate. One-size-fits-all crawler fails on JS pages, bot protection, and embedded PDFs.
>
> **Fix:** Agent-based crawler that identifies source type, selects the right extraction strategy, and maintains per-institution notes.

---

## The Three-Phase Flow

```
Phase 1: DISCOVER       Phase 2: IDENTIFY         Phase 3: EXTRACT
─────────────────       ──────────────────         ─────────────────
Find fee_schedule_url   Classify the source        Use the right tool

- Path probing          - Direct PDF link?         → pdfplumber + LLM
- Google search         - HTML page (static)?      → BeautifulSoup + LLM
- Playwright scan       - JS-rendered page?        → Playwright + LLM
                        - Bot-protected?           → Playwright + stealth
                        - Embedded PDF in page?    → Playwright → extract PDF link → download PDF
                        - PDF behind login wall?   → Skip (note: requires auth)
                        - Scanned PDF?             → OCR (tesseract) + LLM
```

## Per-Institution Crawl Notes

New columns on `crawl_targets`:

```sql
ALTER TABLE crawl_targets ADD COLUMN crawl_strategy TEXT;
-- Values: 'direct_pdf' | 'static_html' | 'js_rendered' | 'playwright_pdf' | 'ocr_pdf' | 'bot_protected' | 'requires_auth' | 'unknown'

ALTER TABLE crawl_targets ADD COLUMN crawl_notes TEXT;
-- Free-form notes updated after each crawl attempt
-- Example: "2026-03-24: Incapsula challenge detected. Switched to Playwright.
--           Page loads fee table in React component. 47 fees extracted."

ALTER TABLE crawl_targets ADD COLUMN crawl_attempts_log JSONB DEFAULT '[]';
-- Structured log of each attempt:
-- [{"date": "2026-03-24", "strategy": "requests", "result": "empty_html", "bytes": 212},
--  {"date": "2026-03-24", "strategy": "playwright", "result": "success", "fees": 47}]
```

## Source Identification Logic

```python
def identify_source(url: str, response: requests.Response) -> str:
    content = response.content
    content_type = response.headers.get('content-type', '')

    # Direct PDF
    if 'application/pdf' in content_type or url.endswith('.pdf'):
        if len(content) < 1000:
            return 'empty_pdf'  # might be a redirect page
        # Check if scanned (no extractable text)
        text = extract_text_from_pdf(content)
        if len(text.strip()) < 50:
            return 'ocr_pdf'  # scanned, needs tesseract
        return 'direct_pdf'  # good to go

    # HTML responses
    html = content.decode('utf-8', errors='replace')

    # Bot protection
    if any(sig in html.lower() for sig in ['incapsula', 'cloudflare', 'captcha', 'challenge']):
        return 'bot_protected'

    # Thin HTML shell (JS-rendered)
    if len(html) < 2000 and '<script' in html:
        return 'js_rendered'

    # HTML page with embedded PDF link
    if '.pdf' in html and ('fee schedule' in html.lower() or 'fee-schedule' in html.lower()):
        return 'html_with_pdf_link'

    # Full static HTML
    if len(html) > 2000 and ('$' in html or 'fee' in html.lower()):
        return 'static_html'

    return 'unknown'
```

## Extraction Strategy per Source Type

| Source Type | Tool | Expected Success |
|---|---|---|
| `direct_pdf` | pdfplumber → LLM | 90%+ |
| `static_html` | BeautifulSoup → LLM | 85%+ |
| `js_rendered` | Playwright → BeautifulSoup → LLM | 70%+ |
| `bot_protected` | Playwright (stealth) → LLM | 50%+ |
| `html_with_pdf_link` | Playwright → find PDF link → download PDF → pdfplumber → LLM | 80%+ |
| `ocr_pdf` | tesseract OCR → LLM | 60%+ |
| `requires_auth` | Skip (log for manual review) | 0% |

## Geographic Organization

Process by state, then county within state. This enables:
- Per-state rate limiting (don't hammer all banks in TX simultaneously)
- Geographic coverage reporting ("We have 45% of Ohio banks")
- State-level competitive analysis (product feature)

```sql
-- Queue crawl jobs by state
INSERT INTO jobs (queue, entity_id, priority, payload)
SELECT 'crawl',
       id::TEXT,
       COALESCE(asset_size, 0) / 1000000,
       jsonb_build_object('state', state_code, 'strategy', crawl_strategy)
FROM crawl_targets
WHERE fee_schedule_url IS NOT NULL
AND crawl_strategy IS NOT NULL
ORDER BY state_code, asset_size DESC NULLS LAST;
```

## Running Notes Architecture

After each crawl attempt, the agent appends to `crawl_notes`:

```
2026-03-24 03:15 UTC | Strategy: requests | Result: empty_html (212 bytes)
  → Detected Incapsula challenge page. Switching to playwright.
2026-03-24 03:16 UTC | Strategy: playwright | Result: success (47 fees)
  → Fee table rendered via React component at div.fee-schedule-content
  → PDF link also found: /documents/fee-schedule-2024.pdf
  → Note: Use direct PDF next time for faster extraction.
```

This gives human reviewers and future crawler runs context about each institution.
