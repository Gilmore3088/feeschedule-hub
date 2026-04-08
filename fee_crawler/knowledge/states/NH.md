# NH Fee Schedule Knowledge


## Run #15 — 2026-04-06
Discovered: 8 | Extracted: 13 | Failed: 16

### New Patterns
- JS-rendered pages with fee schedule content discoverable but extraction fails
- PDF classification consistently successful; HTML/js_rendered shows variable extraction outcomes
- Skipped discover phase with successful downstream extraction
- 404 errors on PDF resources despite prior discovery success
- Low-fee extractions from HTML pages may indicate incomplete capture
- Discovery failures on pages with generic banking language

### Site Notes
- Bank of New Hampshire and Lighthouse Federal Credit Union: discovered fee schedule content on js_rendered pages but zero fees extracted, suggesting dynamic content rendering issues or fee data embedded in non-standard formats
- NH run: 6 PDFs = 5 successful extractions (83%); 3 HTML = 2 successful (67%); 2 js_rendered = 0 successful (0%). PDFs at SFCU, Franklin Savings, St. Mary's, Holy Rosary all extracted 19-41 fees
- Triangle Federal, Granite State FCU, Claremont, Sugar River: skipped discovery but classify/extract proceeded. Triangle and Claremont succeeded; Granite State failed on 404 (broken PDF link), suggesting skip decisions may mask underlying URL validity issues
- Granite State Federal Credit Union: classified as PDF and extraction attempted, but URL returned 404. Suggests discover phase may have cached or inferred URL incorrectly
- Meredith Village (1 fee) and Merrimack County (1 fee) both HTML, successfully validated but suspiciously low counts vs. PDF peers (19-41 fees). May indicate partial HTML parsing or single-fee-type pages
- Mascoma, Bank of New England, Primary Bank, Bellwether: discovery failed on pages containing phrases like 'little or no fees,' 'service charges,' or generic account descriptions without explicit fee schedule links. Pattern suggests vague reference language defeats current discovery heuristics

### Promoted to National
- JS-rendered fee schedules may require enhanced DOM parsing or post-render content analysis; current extraction logic may miss fees in dynamically-loaded tables or interactive elements
- PDF documents remain most reliable format for fee schedule extraction; prioritize PDF discovery for efficiency gains
- Skipped discovery should trigger URL validation check to catch broken resource links before classification
- Implement URL freshness validation between discovery and extraction phases, especially for PDF resources
- Single-digit fee extractions from institutional pages warrant secondary verification; may signal extraction coverage gaps or institution-specific limited fee disclosures
- Discovery algorithm should recognize indirect fee references ('service charges,' 'account fees,' 'pricing') as discovery signals, not just explicit 'fee schedule' links

## Run #218 — 2026-04-07
Discovered: 3 | Extracted: 13 | Failed: 16

### New Patterns
- JS-rendered pages with fee schedule content often fail extraction despite successful discovery and classification
- PDF-based fee schedules show significantly higher extraction success rates
- Broken/moved PDF links cause silent extraction failures with 404 errors
- HTML pages yield variable results (1-39 fees); inconsistent structuring across institutions
- Discovery skip pattern suggests pre-known working URLs, but extract failures indicate data staleness

### Site Notes
- Bank of New Hampshire and Lighthouse Federal Credit Union both classify as js_rendered with discovered fee content, but extraction returns zero fees. May indicate dynamic content loading issues or fee data in non-standard DOM structure.
- Service Federal Credit Union (30 fees), St. Mary's Bank (43 fees), Franklin Savings Bank (37 fees), and Triangle Federal Credit Union (37 fees) all delivered substantial extractions from PDFs. Zero PDF extract failures in this run.
- Granite State Federal Credit Union classified successfully as PDF but extract failed with 404 on URL ending in 'Consumer-' (likely truncated filename). URL structure problem rather than content issue.
- Meredith Village (1 fee) and Merrimack County (1 fee) vs. Sugar River Bank (39 fees) and Claremont Savings (34 fees) suggest some banks publish minimal fee info in HTML while others provide comprehensive tables.
- Multiple institutions skipped discovery (likely cached URLs) but New Hampshire Federal Credit Union has no further records—possible incomplete data or institution with no published online fees.

### Promoted to National
- JS-rendered fee schedules require validation of actual DOM content after rendering; discovery success doesn't guarantee extractable structured data
- PDF documents remain most reliable format for fee schedule extraction; prioritize PDF discovery paths
- Implement redirect-following and URL validation before extraction attempt; 404s on classified PDFs indicate indexing/link decay
- HTML extraction quality varies by bank's fee table markup; consider institution-specific parsing rules
- Skipped discoveries need periodic re-validation; URLs may become stale or institutions may change publishing practices

## Run #219 — 2026-04-07
Discovered: 1 | Extracted: 13 | Failed: 16

### New Patterns
- js_rendered documents consistently fail extraction despite successful classification
- PDF format shows strongest extraction success rate in this run
- Generic homepage link text leads to failed discovery
- 404 errors on classified PDFs suggest broken document references

### Site Notes
- Bank of New Hampshire, Lighthouse Federal Credit Union, Merrimack County Savings Bank (succeeded), and Bellwether Community Federal Credit Union all classified as js_rendered but most extract=failed or minimal data
- Service Federal Credit Union (28 fees), St. Mary's Bank (42 fees), Franklin Savings Bank (39 fees), Triangle Federal Credit Union (37 fees), Holy Rosary Federal Credit Union (28 fees) all PDFs with successful extractions
- Mascoma Bank (links to general banking services), Primary Bank (mentions 'little or no fees'), First Seacoast Bank (links to account types), Salem Co-operative Bank and Bank of New England (no links found) all discovery=failed
- Granite State Federal Credit Union: PDF classified but 404 error on https://www.gscu.org/content/docs/Consumer- indicates incomplete or moved URLs
- Bellwether Community Federal Credit Union: discover=ok found 'Fee Free Services' link but extract=failed with no fees, suggesting link text doesn't match actual content structure

### Promoted to National
- js_rendered fee schedules may require post-rendering content stabilization or different extraction templates than static HTML/PDF
- Prioritize PDF discovery and extraction as most reliable format for banking fee schedules
- Need more sophisticated link detection for banking sites that don't use explicit 'fee schedule' terminology
- Validate PDF URLs before or after classification step; broken references are wasting extraction attempts
- Successful discovery doesn't guarantee extractable content; validate page content matches discovery expectations

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 55% (16/29 addressable)
- Total institutions: 29 (excluded: 0)
- Institutions with URL but no fees: needs investigation
