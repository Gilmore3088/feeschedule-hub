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
