# MA Fee Schedule Knowledge


## Run #190 — 2026-04-07
Discovered: 35 | Extracted: 113 | Failed: 105

### New Patterns
- HTML-formatted fee schedules have highest extraction success rate; js_rendered pages show mixed results (50% success); PDF format varies significantly
- PDF classification succeeds but extraction frequently fails without specific content
- 403 Forbidden errors on direct file access indicate restricted PDF endpoints
- js_rendered pages with fee data exist but extraction fails to identify content structure
- Credit unions show lower extraction success than banks (4 failed, 0 succeeded among federal/state credit unions in this run)

### Site Notes
- MA: Salem Five Cents, Cambridge Savings, Needham Bank, Institution for Savings in Newburyport all used simple HTML with strong extraction (42-49 fees). Contrast with js_rendered failures (Digital Federal, Rockland Trust, Leader Bank succeeded but others failed).
- MA: State Street Bank and Middleware Savings classified as PDF but yielded zero fees. Middlesex Savings Bank and PeoplesBank both PDF but succeeded (33, 24 fees). Suggests PDF parsing requires targeted extraction patterns rather than generic approach.
- Eastern Bank returned 403 on /sites/default/files path—suggests Drupal site with access restrictions on downloadable assets. File may exist but requires navigation through web interface rather than direct URL.
- Beacon Bank (js_rendered, 14 fees) and Leader Bank (js_rendered, 38 fees) succeeded; Digital Federal and Rockland Trust (js_rendered) failed with 'no fees extracted'. Indicates rendering is available but extraction logic doesn't recognize fee table schemas on some sites.
- Digital Federal, Rockland Federal, Metro Federal all credit unions—all PDF format, all extraction failures. Banking institutions (mutual savings, federal banks) had 11/15 success.

### Promoted to National
- Extraction success correlates strongly with content format: HTML > PDF > js_rendered. Prioritize HTML scraping strategies.
- PDF fee schedules need format-specific extraction logic; blanket PDF processing fails ~50% of time
- Direct file URL discovery insufficient for some institutions; require full page crawl to find accessible fee schedule links
- JavaScript rendering alone insufficient—need multiple fee table pattern matchers for dynamic content
- Credit union fee schedules may use non-standard formatting or be stored in restricted access locations; warrant separate extraction strategy

## Run #200 — 2026-04-07
Discovered: 35 | Extracted: 116 | Failed: 102

### New Patterns
- HTML-classified documents show highest extraction success rate (5/6 successful) compared to PDF (3/7) and js_rendered (2/5)
- js_rendered classification combined with 'no fees extracted' failure suggests fee tables may be dynamically loaded but not properly rendered or parsed
- 403 Forbidden errors indicate access-controlled fee documents requiring authentication or special handling
- Database timeout errors ('canceling statement due to statement timeout') occur on larger extractions, suggesting either complex document parsing or extraction logic performance issues
- Low fee counts (2-14 fees) from js_rendered documents may indicate incomplete rendering or pagination issues

### Site Notes
- Salem Five Cents, Cambridge Savings, Institution for Savings in Newburyport, and Hingham Institution all succeeded with HTML classification
- Rockland Trust, Digital Federal Credit Union, and Northern Bank & Trust all failed extraction despite successful js_rendered classification
- Eastern Bank blocks direct PDF access at /sites/default/f path - may need authenticated session or alternative URL discovery
- Middlesex Savings Bank and Needham Bank both failed with database deletion context errors during extraction
- Beacon Bank (14 fees) and Rockland Federal Credit Union (2 fees) succeeded but with suspicious low counts relative to typical bank fee schedules

### Promoted to National
- PDF documents with embedded text show more reliable extraction than dynamically rendered pages, but authentication/access controls are a significant blocker for financial institutions

## Run #211 — 2026-04-07
Discovered: 2 | Extracted: 121 | Failed: 97

### New Patterns
- PDF-based fee schedules show mixed extraction success - some PDFs extract well (Middlesex Savings, PeoplesBank) while others fail completely (State Street, Rockland Federal Credit Union, Metro Federal Credit Union). Suggests PDF structure/OCR quality varies significantly.
- JavaScript-rendered pages with extraction failures (Digital Federal CU, Rockland Trust) may have fees embedded in dynamic content not captured by standard extraction - requires investigation of rendering depth
- Access/permission barriers appear institution-specific - Eastern Bank returned 403 Forbidden on PDF URL, indicating potential anti-scraping or restricted CDN configuration
- HTML-based fee schedules show consistently high extraction success rate (Salem Five, Cambridge Savings, Needham Bank, Institution for Savings in Newburyport all extracted 21-45 fees). HTML remains most reliable format for fee extraction.
- Cape Cod Five Cents Savings Bank extracted only 2 fees despite successful HTML classification - may indicate partial fee disclosure or multiple separate fee documents not consolidated
- 11 of 12 successfully extracted institutions (92%) passed validation - extraction quality is high when it succeeds, suggesting false negatives (extraction failures) rather than false positives (bad extractions)

### Site Notes
- State Street Bank PDF classified successfully but yielded zero fees on extraction - likely image-based PDF or non-standard fee table format
- Rockland Trust Company: js_rendered classified but no fees extracted suggests fee data loaded post-render or in inaccessible elements
- Eastern Bank: 403 error on /sites/default/f suggests permissions issue or URL structure preventing automated access - not a general discovery failure
- Unusually low extraction count suggests institution may split fee schedules across multiple pages or this represents only one product line

### Promoted to National
- Institutions publishing fees as structured HTML tables should be prioritized in discovery workflows - significantly higher success rate than other formats
- When extraction succeeds in MA run, data quality is reliable - focus remediation on improving discovery/classification rather than validation
