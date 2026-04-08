# FL Fee Schedule Knowledge


## Run #107 — 2026-04-07
Discovered: 33 | Extracted: 85 | Failed: 110

### New Patterns
- Help center pages with navigation links often misdirect discovery — when help pages contain banking topics/account management options but not fee schedules, they trigger false positives
- JavaScript-rendered pages with extraction failures indicate content may load dynamically but fees aren't being captured — suggests extraction logic doesn't handle dynamic fee table structures
- PDF-classified pages show high success rate when extraction succeeds but complete failures when it doesn't — no middle ground suggests PDF parsing is binary (works or completely fails)
- Security/access barriers (CAPTCHA, error pages, empty content) account for 4 discover failures but may be retry-able
- HTML-classified pages have better extraction success than js_rendered — suggests HTML pages contain static, well-structured fee tables
- Skipped discovery (pre-populated URLs) bypasses discovery validation — 14 of 33 discovered came from skipped discovery, suggesting pre-loaded institution URLs have high confidence

### Site Notes
- SouthState Bank and Ocean Bank discovery failed on help center pages; EverBank succeeded by finding direct fee schedule link after navigation
- BankUnited, Space Coast FCU, and Fairwinds FCU all js_rendered but extracted zero fees despite successful classification
- Amerant Bank PDF classified but extracted zero fees; contrast with Seacoast (69 fees), Bradesco (44), Banesco (57) all PDF with strong extraction
- Vystar FCU blocked by CAPTCHA; Emigrant Bank returned error page; Suncoast FCU showed empty content — all discoverable with session handling or delayed retry
- Capital City Bank (html, 58 fees) and Midflorida (html, 55 fees) outperformed js_rendered credit unions; First Federal (html) failed extraction despite classification success

### Promoted to National
- Improve discovery filters to distinguish help center navigation pages from actual fee schedule content pages
- JS-rendered pages need enhanced extraction patterns for dynamically populated fee tables
- PDF extraction failures warrant manual review — may indicate corrupted PDFs, scanned images, or layout anomalies affecting parser
- Skipped discovery validates institutional URL quality; maintain and expand pre-populated URL database

## Run #132 — 2026-04-07
Discovered: 4 | Extracted: 86 | Failed: 109

### New Patterns
- PDF-based fee schedules extract successfully at high rates; HTML-based schedules show inconsistent extraction results despite successful classification
- JS-rendered pages classified successfully but show mixed extraction outcomes (1-31 fees vs. complete failures)
- Discovery failures cluster around pages showing partial fee information without comprehensive schedule links
- CAPTCHA and loading errors block discovery entirely
- Extract failures despite successful classification occur on 4 institutions across different formats (js_rendered, pdf, html)

### Site Notes
- FL banks using PDFs (EverBank, Seacoast, Bradesco, Banesco, Campus USA) yielded 31-70 fees per extraction. HTML pages (Capital City, First Federal) failed extraction despite classification success.
- Raymond James (js_rendered) extracted only 1 fee; Fairwinds (js_rendered) failed extraction completely; EverBank classified as pdf extracted 31 fees
- SouthState, Ocean Bank, and Emigrant Bank discovery failed on pages displaying isolated fees ($15 maintenance, etc.) but no linked schedules. Different from CAPTCHA/loading failures.
- Vystar Federal Credit Union and Suncoast Federal Credit Union discovery failed due to bot detection and load failures respectively
- BankUnited, Amerant Bank, Fairwinds, Capital City, First Federal all classified correctly but yielded no fees. Suggests content exists but extraction logic fails on specific institution formats.

### Promoted to National
- Prioritize PDF discovery links in fee schedule discovery phase; HTML pages may require DOM parsing refinement or structured data extraction methods
- Distinguish between 'partial fee mention' discovery failures and access-blocking failures; may need secondary discovery attempt targeting fee schedule PDFs specifically

## Run #145 — 2026-04-07
Discovered: 0 | Extracted: 89 | Failed: 106

### New Patterns
- JS-rendered pages with fee schedule content show extraction failures despite successful classification
- PDF documents show highest extraction success rate when discoverable
- CAPTCHA protection and empty/dynamic content blocks discovery phase entirely
- 404 errors and help center pages indicate poor fee schedule discoverability structure
- HTML-based fee schedules extract reliably when content is static and accessible

### Site Notes
- BankUnited, Fairwinds FCU, Raymond James Bank all classified as js_rendered but extraction failed or succeeded inconsistently. Raymond James extracted 2 fees successfully; BankUnited and Fairwinds extracted nothing despite proper rendering.
- Seacoast National (69 fees), Banesco USA (57), Bradesco Bank (44), Grow Financial (39), Space Coast FCU (20) all extracted successfully from PDFs. Amerant Bank PDF failed extraction despite classification success.
- Vystar FCU (CAPTCHA), Suncoast FCU (empty page content) both failed discovery. These represent institutions with technical barriers rather than missing fee schedules.
- Emigrant Bank (404), Ocean Bank (help center with no fee data), SouthState Bank (only checking account page links referenced) all failed discovery despite being active institutions.
- City National Bank of Florida (5 fees), Capital City Bank (57 fees), Midflorida FCU (55 fees) all successfully extracted from HTML. First Federal Bank HTML classified but extraction failed.

### Promoted to National
- JS-rendered fee schedule pages may require post-rendering content validation before extraction attempt—rendering may not fully populate fee tables or structured data.
- PDF-based fee schedules are most reliable extraction source when located; prioritize PDF discovery paths.
- Institutions using CAPTCHA or heavy JS-dependent content loading require alternative discovery methods (API, cached pages, or manual research).
- Many institutions lack clear fee schedule landing pages; consider searching for account disclosure documents, terms of service, or product-specific pages as secondary discovery paths.
- HTML pages with tabular or list-structured fee data are reliable; extraction failures on HTML likely indicate poorly formatted tables or missing semantic markup.
