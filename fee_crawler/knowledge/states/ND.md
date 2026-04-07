# ND Fee Schedule Knowledge


## Run #21 — 2026-04-06
Discovered: 24 | Extracted: 20 | Failed: 70

### New Patterns
- PDF discovery from /disclosures pages is reliable
- JS-rendered pages with minimal fee extraction
- URL construction errors in automation
- Regulation E disclosures contain variable fee information
- Direct fee schedule links on homepage are most reliable discovery path
- Institutions with no online fee schedules confirmed
- HTML-classified pages show consistent extraction success

### Site Notes
- North Star Community Federal Credit Union: /disclosures page yielded fee schedule PDF successfully
- Capital Federal Credit Union discovered fee schedule link but extraction failed despite js_rendered classification. Starion Bank succeeded with same classification. May indicate dynamic content loading issues or page structure variation.
- Choice Financial Group failed at discovery with malformed URL (https://http//WWW). Indicates double-protocol prefix in URL handling.
- Dakota Heritage Bank: Regulation E disclosure PDF discovered but extraction returned zero fees despite document type suggesting fee content
- Gate City Bank and Capital Federal Credit Union both found direct fee schedule links on homepage/prominent pages and achieved successful classification
- 70 failed discoveries across ND suggest significant portion of institutions don't publish fee schedules online (Bell Bank, Alerus Financial, Bravera Bank, First Community Federal Credit Union identified as likely offline-only)
- Cornerstone Bank, Bank Forward, Town And Country Federal Credit Union all classified as HTML and achieved successful extraction

### Promoted to National
- Add /disclosures to standard discovery paths for financial institutions
- JS-rendered pages require validation that content fully loads before extraction; discovery success doesn't guarantee extraction success
- Validate URL format before navigation attempts to prevent net::ERR_NAME_NOT_RESOLVED failures
- Regulation E PDFs should be revisited with alternative extraction methods; format may differ from standard fee schedules
- Prioritize homepage link extraction before navigating to nested account pages
- Document institutions confirmed to not publish fee schedules publicly; avoid repeated discovery attempts
- HTML-rendered fee schedules have higher extraction success than JS-rendered alternatives
