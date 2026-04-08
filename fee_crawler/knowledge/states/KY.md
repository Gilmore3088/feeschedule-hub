# KY Fee Schedule Knowledge


## Run #36 — 2026-04-07
Discovered: 23 | Extracted: 49 | Failed: 125

### New Patterns
- FAQ and informational pages are commonly mistaken for fee schedule pages during discovery; banks often lack direct fee schedule links from homepage
- Banks with 'Tools & Resources' or similar utility pages often don't contain fee schedules, despite semantic similarity
- Extract failures occur on PDFs and JS-rendered pages despite successful classification, suggesting OCR/parsing limitations
- HTML and properly rendered documents show 100% extract success when discovery succeeds, while PDFs and JS-rendered show high failure rates
- Some small banks explicitly do not publish fee schedules online despite having checking account pages
- 404 errors and page not found responses indicate dead links in institution discovery data

### Site Notes
- Central Bank & Trust Co., American Bank & Trust Company, Inc., L & N Federal Credit Union all showed FAQ/disclosure pages without fee schedules
- Traditional Bank, Inc. used 'Tools & Resources' page structure that contained no fee data
- Republic Bank & Trust Company, Planters Bank Inc., Heritage Bank Inc., The Farmers National Bank of Danville all classified correctly but extracted zero or no fees
- Community Trust Bank, South Central Bank, Park Federal Credit Union (HTML/JS_rendered with content) extracted successfully; contrast with PDF failures
- Stock Yards Bank, Independence Bank of Kentucky, The Cecilian Bank, Whitaker Bank show no fee schedule links from primary pages
- The Paducah Bank and Trust Company returned 404 during discovery

### Promoted to National
- Discovery process should recognize FAQ, forms, and general disclosure pages as false positives and implement deeper site search strategies
- Navigation page templates (Tools, Resources, Center pages) should be deprioritized in discovery logic
- Classification success does not predict extraction success; implement validation checks on extracted fee counts and investigate PDF/JS rendering quality issues
- Prioritize HTML native formats in discovery; investigate PDF parsing library accuracy and JS rendering consistency
- Maintain negative list of institutions confirmed to not publish online to avoid repeated discovery attempts
- Implement validation of institution URLs in source data before running discovery pipeline

## Run #43 — 2026-04-07
Discovered: 9 | Extracted: 59 | Failed: 115

### New Patterns
- Discovery failures often occur when fee schedules are embedded in checking account product pages rather than linked from homepage. Sites describe account features but don't explicitly link to fee documents.
- JavaScript-rendered pages (js_rendered classification) consistently fail at extraction stage despite successful classification
- PDF documents with complex layouts or non-standard table structures fail extraction despite successful discovery and classification
- HTML-classified institutions show highest success rate (6/6 extractions successful with varying volumes). Credit unions and community banks more likely to publish in HTML format.
- Institutions with 'skipped' discovery (pre-known URLs used) have 100% extraction success rate vs. 7.8% for discovery attempts

### Site Notes
- Central Bank & Trust Co., Whitaker Bank, The Paducah Bank and Trust Company: fee schedules exist on account pages but discovery algorithm missed them due to lack of explicit 'fee schedule' or 'disclosure' anchor text
- Heritage Bank, Inc. and The Farmers National Bank of Danville both classified as js_rendered but extracted zero fees
- Planters Bank, Inc.: PDF classified correctly but no fees extracted, suggesting parsing/OCR issue with specific PDF format
- South Central Bank, Park Federal Credit Union: HTML format allowed extraction of 49-50 fees per institution
- 9 institutions discovered, only 1 successful discovery (American Bank & Trust Company) with marginal confidence
- Stock Yards Bank, Independence Bank of Kentucky, The Cecilian Bank: homepage-only discovery failed; these institutions likely publish fee schedules only on internal account pages or not online

### Promoted to National
- Improve discovery heuristics to crawl checking/savings account product pages as secondary source when homepage links fail
- JavaScript-rendered fee schedule PDFs may require additional processing; current extraction pipeline may not handle dynamically loaded content correctly
- Implement fallback OCR or manual review flag for PDFs that classify successfully but yield zero extracted fees
- HTML-formatted fee schedules are more reliably parseable; prioritize discovery of HTML formats over PDFs when available
- Kentucky institutions resist standard homepage-based discovery; maintain curated lists of known fee disclosure URLs as primary strategy
- Some institutions may not publish comprehensive fee schedules online; flag for manual verification after 2 failed automated discovery attempts

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 41% (70/169 addressable)
- Total institutions: 174 (excluded: 5)
- Institutions with URL but no fees: needs investigation
