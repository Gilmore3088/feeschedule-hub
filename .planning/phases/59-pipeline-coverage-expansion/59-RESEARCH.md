# Phase 59: Pipeline Coverage Expansion - Research

**Researched:** 2026-04-10
**Domain:** Python crawler pipeline — Playwright stealth, PDF direct-link discovery, bot-detection handling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Discover PDF URLs via Google search (`site:bankname.com filetype:pdf fee schedule`) + common URL pattern probing (/fees.pdf, /fee-schedule.pdf, /personal-banking/fees.pdf). Prior batches showed 33% conversion from Google search, 16% from pattern probing.
- **D-02:** Process PDFs with pdfplumber first (fast, free text extraction). Fall back to tesseract OCR for scanned PDFs. Then send extracted text to LLM for fee extraction. pdfplumber and tesseract already in dependencies.
- **D-03:** Use playwright-stealth plugin (patches navigator properties, WebGL, canvas fingerprint) + rotating user agents per request + random delays (2-5s between page loads). Playwright already in dependencies.
- **D-04:** Detect Cloudflare challenges (cf-browser-verification, JS challenge pages) and mark as `cloudflare_blocked` status. Retry with stealth on next scheduled crawl. Don't waste LLM budget on challenge pages.
- **D-05:** Target biggest banks by assets that have zero extracted fees first. Largest institutions represent the most visible coverage gaps.
- **D-06:** Target all 116 previously failed institutions from prior batches. Comprehensive re-attempt using the new stealth + PDF capabilities.
- **D-07:** Extend existing `crawl` command with `--stealth` and `--pdf-probe` flags. Stealth mode uses Playwright fetcher by default. PDF probe discovers and fetches direct PDF URLs. Same review queue, same pipeline. No separate command.
- **D-08:** Same schedule, stealth as automatic fallback. Standard crawl runs first. If a target fails with 403/bot-detection, auto-retry with stealth mode in the same crawl run. No separate cron needed.

### Claude's Discretion

- accessibe.com blacklist pattern (prior memory: false positive from JS batch)
- Specific URL patterns to probe beyond the common ones
- Rate limiting between stealth requests to avoid IP bans
- Whether to store discovered PDF URLs in crawl_targets for future re-crawls

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COV-01 | The crawler successfully extracts fees from at least one major bank fee schedule delivered as a direct PDF URL that was previously inaccessible | PDF probe logic in `url_discoverer.py` + `extract_pdf.py` already handles pdfplumber extraction; need PDF URL discovery via Google search + pattern probing |
| COV-02 | At least one fee schedule page that previously returned a bot-detection failure (403 or Cloudflare challenge) is successfully accessed and extracted via Playwright stealth | `playwright_fetcher.py` already has Cloudflare challenge markers; need playwright-stealth plugin integration and auto-fallback in `_crawl_one` |
</phase_requirements>

---

## Summary

Phase 59 extends the existing Python crawler to handle two coverage gaps: JS-rendered pages blocked by Cloudflare/bot detection, and direct PDF fee schedules that are not linked from the institution's homepage. Both problems have established solutions in the Python ecosystem and the codebase is well-positioned for both integrations.

The `playwright_fetcher.py` file already contains the exact Cloudflare challenge markers needed for D-04 (`_CHALLENGE_MARKERS` list includes `"cloudflare"`, `"cf-browser-verification"`, `"checking your browser"`). The `download.py` already calls `needs_browser_fallback()` and `fetch_with_browser()` as an automatic fallback. Stealth integration is additive: the `playwright-stealth` package applies to the browser context before navigation. The `fetch_with_browser()` function's context creation is the precise insertion point.

For PDF discovery, the `url_discoverer.py` has a rich `COMMON_PATHS` list (100+ paths) that already includes PDF patterns like `/sites/default/files/fee-schedule.pdf`. The `google_discover.py` command implements Google scraping search. The two need to be connected: a new `pdf_probe()` method on `UrlDiscoverer` that tries PDF-specific common paths, and a `--pdf-probe` flag on the `crawl` command to trigger pre-crawl PDF URL discovery for institutions with no URL or a previously-failed URL.

**Primary recommendation:** Add playwright-stealth to `requirements.txt`, integrate it in `fetch_with_browser()` via `stealth.apply_stealth_sync(context)`, detect `cloudflare_blocked` status in `_crawl_one`, and add PDF URL probing as a pre-step in `crawl.py` when `--pdf-probe` is passed.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| playwright-stealth | 2.0.3 | Patches Playwright browser context to evade bot detection | Official PyPI package, MIT license, latest release April 4 2026 |
| pdfplumber | >=0.10 | PDF text extraction (already in requirements.txt) | Already used in `extract_pdf.py` via `_pipeline_extract_text` |
| playwright | >=1.40 | Browser automation (already in requirements.txt) | Already in `playwright_fetcher.py` as singleton browser |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| httpx | >=0.27 | Async HTTP for Google search scraping | Already used in `google_discover.py` |
| requests | >=2.31 | Synchronous HTTP for PDF probing | Already used in url_discoverer and download |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| playwright-stealth | tf-playwright-stealth | tf-playwright-stealth is a maintained fork but less documented; playwright-stealth 2.0.3 is current and well-known |
| playwright-stealth | undetected-playwright | Separate Chromium binary; much heavier; not appropriate for Modal serverless containers |
| Google scraping (httpx) | SerpAPI | SerpAPI costs money and requires a key; scraping is already implemented in `google_discover.py` |

**Installation:**
```bash
pip install playwright-stealth
```

**Version verification:** `playwright-stealth 2.0.3` released 2026-04-04. [VERIFIED: pypi.org/project/playwright-stealth/]

---

## Architecture Patterns

### Where Stealth Integrates in Existing Code

The integration point is `playwright_fetcher.py` → `fetch_with_browser()`, specifically the `browser.new_context()` call. The stealth plugin is applied to the context before a new page is opened.

```python
# Source: playwright-stealth 2.0.3 docs (pypi.org/project/playwright-stealth)
from playwright_stealth import Stealth

# Inside fetch_with_browser(), after browser.new_context():
context = browser.new_context(
    user_agent=_pick_random_user_agent(),
    java_script_enabled=True,
    ignore_https_errors=True,
    viewport={"width": 1280, "height": 800},
)
stealth = Stealth()
stealth.apply_stealth_sync(context)  # patches navigator, WebGL, canvas fingerprint
```

`apply_stealth_sync` patches: `navigator.webdriver`, `navigator.languages`, `WebGL vendor/renderer`, `chrome` runtime object, canvas fingerprinting noise. [VERIFIED: pypi.org/project/playwright-stealth]

### Stealth Flag Flow

The `--stealth` flag enables stealth mode. The `fetch_with_browser()` function needs a `stealth: bool = False` parameter. When `True`, it calls `stealth.apply_stealth_sync(context)` after context creation. `download_document()` in `download.py` also needs a `stealth: bool = False` parameter passthrough.

```
crawl --stealth
  → run() passes stealth=True to _crawl_one()
  → _crawl_one() passes stealth=True to download_document()
  → download_document() passes stealth=True to fetch_with_browser()
  → fetch_with_browser() calls stealth.apply_stealth_sync(context) when stealth=True
```

### Auto-Fallback to Stealth (D-08)

The existing `_crawl_one()` function already handles `403` errors by clearing the URL and recording `failure_reason = 'dead_url'`. The new pattern is:

1. First attempt: standard download (`download_document()`)
2. If the result status is `403` or the error contains `"403"` — AND stealth is available — retry with stealth Playwright fetch instead of clearing the URL
3. Set `crawl_strategy = 'stealth_html'` on success
4. Set `failure_reason = 'cloudflare_blocked'` if Cloudflare markers are detected even after stealth

```python
# In _crawl_one(), after dl["success"] is False with 403:
if "403" in error_msg and stealth_available:
    stealth_result = fetch_with_browser(url, stealth=True)
    if stealth_result["success"]:
        dl = stealth_result
        # continue pipeline with stealth content
    else:
        # check for cloudflare markers in stealth_result content
        _record_cloudflare_blocked(db, target_id, run_id, url)
        return result
```

### Cloudflare Detection

`playwright_fetcher.py` already has `_CHALLENGE_MARKERS` used inside `needs_browser_fallback()`. The same list should be applied to the stealth response: if stealth Playwright returns a page that still contains challenge markers, record `failure_reason = 'cloudflare_blocked'` instead of `'dead_url'` so `rediscover_failed` can differentiate them.

Status values to add:
- `crawl_results.status`: existing values are `success | failed | unchanged`. The `cloudflare_blocked` state maps to `failed` with `error_message = 'cloudflare_blocked'`.
- `crawl_targets.failure_reason`: add `'cloudflare_blocked'` as a new value (no migration needed — it is a TEXT column with no ENUM constraint).

### PDF Probe Pattern

**Two sub-strategies for PDF discovery:**

**Strategy A: Pattern probing** — extend `COMMON_PATHS` in `url_discoverer.py` or create a focused `PDF_PROBE_PATHS` list for direct PDF URL patterns. Check HEAD before GET to save bandwidth. The existing `_probe_url()` method already does HEAD-first probing.

```python
PDF_PROBE_PATHS = [
    "/fees.pdf",
    "/fee-schedule.pdf",
    "/personal-banking/fees.pdf",
    "/personal/fee-schedule.pdf",
    "/documents/fee-schedule.pdf",
    "/disclosure/fee-schedule.pdf",
    "/sites/default/files/fee-schedule.pdf",
    "/wp-content/uploads/fee-schedule.pdf",
    "/assets/pdf/fee-schedule.pdf",
    # ... (many already exist in COMMON_PATHS)
]
```

**Strategy B: Google search** — `google_discover.py` already implements `site:bankname.com filetype:pdf fee schedule` search. This can be invoked per institution when `--pdf-probe` is active.

### PDF Probe Integration in crawl.py

When `--pdf-probe` is True, a pre-step runs before the main crawl loop for institutions that have no `fee_schedule_url` OR have a previously failed URL with `failure_reason = 'cloudflare_blocked'`. The discovered PDF URL is stored back to `crawl_targets.fee_schedule_url` so the normal crawl pipeline picks it up. [ASSUMED - the exact trigger condition (no URL vs. failed URL) needs confirmation.]

### accessibe.com Blacklist

The `UrlDiscoverer._fetch()` method has no domain blacklist. The accessibe.com false positive occurs when Google search returns `accessibe.com/ada-widget` as a fee schedule URL (it is a third-party accessibility overlay that loads on many bank websites). It must be blocked at the URL scoring/filtering stage.

Pattern to add in `url_discoverer.py`:
```python
_BLACKLISTED_DOMAINS = {
    "accessibe.com",
    "ada.com",       # accessibility overlay
    "levelaccess.com",  # another overlay provider
}

def _is_blacklisted(self, url: str) -> bool:
    hostname = urlparse(url).hostname or ""
    return hostname.lower().rstrip(".") in _BLACKLISTED_DOMAINS
```

Apply in `_score_link()` and `_is_fee_pdf_url()` before returning True.

### Storing Discovered PDF URLs (Claude's Discretion)

The planner should store discovered PDF URLs back to `crawl_targets.fee_schedule_url` so future crawl runs use them directly. The existing pattern in `_crawl_one()` already reads `fee_schedule_url` from `crawl_targets`. The `google_discover.py` command does this via `UPDATE crawl_targets SET fee_schedule_url = ?`. The PDF probe step should do the same.

### Random Delays for Stealth (Claude's Discretion)

The existing `DomainRateLimiter` enforces per-domain delays. For stealth mode, add an explicit `random.uniform(2, 5)` sleep before each stealth page navigation inside `fetch_with_browser()` when `stealth=True`. This is separate from the domain rate limiter (which controls inter-request timing; the intra-request delay is about browser behavior fingerprinting).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Navigator/WebGL fingerprint patching | Custom Playwright CDP scripts | `playwright-stealth` 2.0.3 | Covers 10+ evasion vectors; maintained against current Chromium |
| PDF text extraction | Custom PDF parser | `pdfplumber` (already in requirements) | Handles tables, multi-column layouts; OCR fallback via existing `extract_pdf.py` |
| User agent rotation | Hardcoded UA list | `playwright-stealth` built-in + config | Stealth already patches navigator.userAgent consistently with UA |
| Google search scraping | New HTTP client | Reuse `google_discover.py` pattern with httpx | Already implemented for this exact purpose |

---

## Common Pitfalls

### Pitfall 1: Browser Singleton Breaks with Stealth on Multiple Pages
**What goes wrong:** The existing `_browser_instance` is shared across threads. If stealth patches are applied at context level (correct) vs. browser level (wrong), they are isolated per-context. No issue. But if `apply_stealth_sync()` is accidentally called on the page instead of context, it may not patch all properties.
**Why it happens:** The API has both `apply_stealth_sync(context)` and `apply_stealth_sync(page)` overloads. Calling on `page` is less effective.
**How to avoid:** Always call `stealth.apply_stealth_sync(context)` immediately after `browser.new_context()`, before `context.new_page()`.
**Warning signs:** Bot detection still fires after stealth is applied.

### Pitfall 2: Stealth Applied After `goto()` Has No Effect
**What goes wrong:** Applying stealth after `page.goto()` is too late — the browser already sent a non-stealthy initial request.
**Why it happens:** The order matters: context creation → stealth patch → page.goto().
**How to avoid:** The `apply_stealth_sync(context)` call must come before `context.new_page()`.

### Pitfall 3: `crawl_strategy` Column Missing from DB Schema
**What goes wrong:** The `crawl.py` code writes `crawl_strategy = ?` in UPDATE statements but there is no migration for this column in `db.py`. [VERIFIED: searched all ALTER TABLE statements in `fee_crawler/db.py`]
**Why it happens:** The column was added to `crawl.py` logic but the migration was not written.
**How to avoid:** Wave 0 must add `ALTER TABLE crawl_targets ADD COLUMN crawl_strategy TEXT` to `_MIGRATE_CRAWL_TARGETS` in `db.py`. Otherwise all `crawl.py` UPDATE statements that include `crawl_strategy =` will fail silently (SQLite ignores unknown columns in WHERE but raises for SET).
**Warning signs:** Crawl runs complete but `crawl_strategy` is never populated.

### Pitfall 4: 403 Auto-Clear Overwrites the URL Before Stealth Retry
**What goes wrong:** The existing `_crawl_one()` logic clears `fee_schedule_url = NULL` when it sees a `403` error (line 87-94 of crawl.py). If stealth retry is added AFTER this clear, the URL is already gone.
**Why it happens:** The URL clear happens immediately on download failure before any retry logic.
**How to avoid:** The stealth retry must be inserted BEFORE the existing 403 URL-clear block. The URL should only be cleared if stealth also fails.

### Pitfall 5: PDF Probe on Institutions That Already Have URLs
**What goes wrong:** Running `--pdf-probe` on institutions that already have working `fee_schedule_url` values wastes time and may overwrite working URLs with PDF variants.
**Why it happens:** No filter applied to the probe loop.
**How to avoid:** PDF probe should only run on institutions where `fee_schedule_url IS NULL` OR `failure_reason IN ('dead_url', 'cloudflare_blocked')`.

### Pitfall 6: accessibe.com URLs Appearing as Fee Schedule Candidates
**What goes wrong:** Google search returns `accessibe.com` accessibility widget URLs because they appear on bank websites. Without blacklisting, the discoverer scores them as fee schedule candidates.
**Why it happens:** The link text or URL path may contain "fees" or "schedule" in the widget configuration.
**How to avoid:** Add `accessibe.com` and similar accessibility overlay domains to a `_BLACKLISTED_DOMAINS` set checked before link scoring.

---

## Code Examples

### playwright-stealth Integration
```python
# Source: pypi.org/project/playwright-stealth/ (playwright-stealth 2.0.3)
# In playwright_fetcher.py, inside fetch_with_browser():

from playwright_stealth import Stealth

# After browser.new_context():
context = browser.new_context(
    user_agent=user_agent,
    java_script_enabled=True,
    ignore_https_errors=True,
    viewport={"width": 1280, "height": 800},
)

if stealth:
    _stealth = Stealth()
    _stealth.apply_stealth_sync(context)  # must be before new_page()

page = context.new_page()
```

### Detecting Cloudflare in Stealth Response
```python
# Source: existing _CHALLENGE_MARKERS in playwright_fetcher.py [VERIFIED]
# In _crawl_one(), after stealth fetch:

def _is_cloudflare_blocked(content: bytes) -> bool:
    try:
        html = content.decode("utf-8", errors="replace").lower()
    except Exception:
        return False
    cloudflare_markers = ["cf-browser-verification", "checking your browser",
                          "cloudflare", "challenge-platform"]
    return any(m in html[:4096] for m in cloudflare_markers)
```

### crawl_strategy Values (Extended)
```python
# Source: crawl.py _determine_crawl_strategy() [VERIFIED]
# Existing values:
# "static_html" | "playwright_html" | "direct_pdf" | "playwright_pdf"
#
# New values for phase 59:
# "stealth_html"    - Playwright with stealth plugin, HTML page
# "stealth_pdf"     - Playwright with stealth plugin, PDF via Playwright
# "probed_pdf"      - Direct PDF URL found via pattern probing
# "google_pdf"      - Direct PDF URL found via Google search
```

### PDF Probe Paths (Focused List)
```python
# Source: analysis of COMMON_PATHS in url_discoverer.py [VERIFIED]
# These PDF-specific paths are not already in COMMON_PATHS or are high-value:
PDF_DIRECT_PROBE_PATHS = [
    "/fees.pdf",
    "/fee-schedule.pdf",
    "/fee_schedule.pdf",
    "/schedule-of-fees.pdf",
    "/service-fees.pdf",
    "/personal-fees.pdf",
    "/personal/fees.pdf",
    "/personal/fee-schedule.pdf",
    "/checking/fees.pdf",
    "/disclosure/fee-schedule.pdf",
    "/pdfs/fee-schedule.pdf",
    "/pdf/fee-schedule.pdf",
    "/files/fee-schedule.pdf",
    "/docs/fees.pdf",
]
# Note: Many PDF paths already exist in COMMON_PATHS (e.g., /sites/default/files/fee-schedule.pdf)
# Cross-check before adding to avoid duplicates.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual user agent spoofing | playwright-stealth context patching | playwright-stealth 2.0+ | More comprehensive — patches canvas, WebGL, navigator.languages, not just UA |
| Separate stealth command | Auto-fallback on 403 in same crawl run | Phase 59 decision | No separate cron slot needed |
| Clear 403 URLs immediately | Stealth retry before clearing | Phase 59 | Preserves discovered URLs for stealth attempt |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PDF probe trigger condition: institutions with `fee_schedule_url IS NULL` OR `failure_reason IN ('dead_url', 'cloudflare_blocked')` | Architecture Patterns — PDF probe | If too narrow, misses institutions with other failure reasons; if too broad, overwrites working URLs |
| A2 | `crawl_strategy` column is missing from DB schema and needs a migration | Common Pitfalls | If the column already exists in a newer migration not present in the codebase, the migration would fail with "duplicate column" (SQLite silently ignores if using `IF NOT EXISTS` pattern) |

---

## Open Questions

1. **Does `crawl_strategy` need a DB migration?**
   - What we know: `crawl.py` writes `crawl_strategy` in UPDATE SET clauses. No ALTER TABLE migration exists in `db.py` for this column. [VERIFIED: searched all ALTER TABLE in db.py]
   - What's unclear: Whether the Postgres schema (Supabase) already has this column from a manual migration not tracked in `db.py`.
   - Recommendation: Wave 0 should add the migration defensively; SQLite will error on unknown SET column while Postgres will too.

2. **What specific 116 institutions need re-targeting?**
   - What we know: CONTEXT.md says "116 previously failed institutions from prior batches." These are identified by asset size + zero extracted fees + failure history.
   - What's unclear: How the plan identifies this set — by query (institutions with `consecutive_failures >= N AND extracted_fees_count = 0 ORDER BY asset_size DESC LIMIT 116`) or by a stored list.
   - Recommendation: Use a query-based approach: `WHERE consecutive_failures >= 3 AND asset_size_tier IN ('regional', 'large_regional', 'super_regional')` ordered by asset_size DESC.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| playwright | Stealth browser fetch | ✓ (in requirements.txt) | >=1.40 | None — required |
| playwright-stealth | D-03 stealth mode | ✗ (not installed, not in requirements.txt) | 2.0.3 | None — must add to requirements.txt |
| pdfplumber | D-02 PDF extraction | ✓ (in requirements.txt, verified importable) | >=0.10 | None — already present |
| tesseract | OCR fallback for scanned PDFs | [ASSUMED] system dependency, status unverified | — | Skip OCR fallback if unavailable |

**Missing dependencies with no fallback:**
- `playwright-stealth` — must be added to `fee_crawler/requirements.txt` before stealth features can be implemented.

**Missing dependencies with fallback:**
- tesseract — scanned PDF OCR is a fallback; pdfplumber handles most PDFs. OCR is already implemented in `extract_pdf.py` but depends on tesseract being installed on the Modal container.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest |
| Config file | `fee_crawler/tests/conftest.py` |
| Quick run command | `python -m pytest fee_crawler/tests/ -x -q` |
| Full suite command | `python -m pytest fee_crawler/tests/ -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COV-01 | PDF URL probe discovers and downloads a direct PDF URL | unit | `pytest fee_crawler/tests/test_pdf_probe.py -x` | ❌ Wave 0 |
| COV-02 | Stealth Playwright fetch succeeds where standard fetch returns 403 | unit | `pytest fee_crawler/tests/test_stealth_fetcher.py -x` | ❌ Wave 0 |
| COV-02 | Cloudflare challenge page is detected and recorded as `cloudflare_blocked` | unit | `pytest fee_crawler/tests/test_cloudflare_detection.py -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `python -m pytest fee_crawler/tests/ -x -q`
- **Per wave merge:** `python -m pytest fee_crawler/tests/ -v`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `fee_crawler/tests/test_pdf_probe.py` — unit tests for PDF URL pattern probing (mock HTTP responses)
- [ ] `fee_crawler/tests/test_stealth_fetcher.py` — unit tests for `fetch_with_browser(stealth=True)` (mock browser context)
- [ ] `fee_crawler/tests/test_cloudflare_detection.py` — unit tests for Cloudflare marker detection in `_is_cloudflare_blocked()`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A |
| V3 Session Management | no | N/A |
| V4 Access Control | no | N/A |
| V5 Input Validation | yes | URLs validated via existing `_is_safe_url()` SSRF protection in both `download.py` and `playwright_fetcher.py` |
| V6 Cryptography | no | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via user-supplied PDF URLs stored in crawl_targets | Tampering | Existing `_is_safe_url()` in `download.py` and `playwright_fetcher.py` — already blocks RFC 1918, link-local, cloud metadata |
| Malicious PDF content triggering pdfplumber exploit | Tampering | pdfplumber is sandboxed; no code execution; LLM only receives extracted text |
| Bot detection evasion (stealth) | Spoofing | Stealth is being used ethically to access publicly published fee schedules; institutions publish these for consumer access |

---

## Sources

### Primary (HIGH confidence)
- `fee_crawler/pipeline/playwright_fetcher.py` — full Playwright fetcher, challenge markers, browser singleton, `fetch_with_browser()` signature [VERIFIED: read directly]
- `fee_crawler/pipeline/download.py` — download pipeline, existing browser fallback pattern [VERIFIED: read directly]
- `fee_crawler/commands/crawl.py` — full crawl command, `_crawl_one()`, `run()` signature, crawl_strategy values, existing 403 handling [VERIFIED: read directly]
- `fee_crawler/agents/extract_pdf.py` — PDF extraction agent, LLM tool use, pdfplumber delegation [VERIFIED: read directly]
- `fee_crawler/pipeline/url_discoverer.py` — COMMON_PATHS, FEE_PDF_URL_KEYWORDS, NON_FEE_PDF_KEYWORDS, discovery methods [VERIFIED: read directly]
- `fee_crawler/db.py` — crawl_results schema (status values: `success | failed | unchanged`), crawl_targets schema, ALL ALTER TABLE migrations [VERIFIED: read directly]
- `fee_crawler/__main__.py` — current crawl command arguments (no `--stealth` or `--pdf-probe` exist yet) [VERIFIED: read directly]
- `fee_crawler/requirements.txt` — confirmed `playwright-stealth` NOT in requirements; pdfplumber IS present [VERIFIED: read directly]
- pypi.org/project/playwright-stealth/ — version 2.0.3, `apply_stealth_sync(context)` API [VERIFIED: WebFetch]

### Secondary (MEDIUM confidence)
- `fee_crawler/commands/google_discover.py` — Google search scraping pattern with httpx, existing fee keyword filter [VERIFIED: read directly]
- `fee_crawler/commands/rediscover_failed.py` — failure_reason values used in queries: `'no_dollar_amounts'`, `'too_few_fee_keywords'`, `'not_fee_related'`, `'dead_url'` etc. [VERIFIED: read directly]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against requirements.txt and PyPI
- Architecture: HIGH — integration points identified from direct code reading
- Pitfalls: HIGH — identified from actual code patterns (403 clear before retry, missing crawl_strategy migration)

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (playwright-stealth is active; check for new versions before implementing)
