# CT Fee Schedule Knowledge


## Run #120 — 2026-04-07
Discovered: 29 | Extracted: 54 | Failed: 42

### New Patterns
- js_rendered pages with fee content discovered but extraction fails
- Discover skip strategy working well for PDF institutions
- Discover failures on comparison/account overview pages
- 403 Forbidden on third-party hosted PDFs
- Disclosure footer links reliably locate fee schedules

### Site Notes
- American Eagle Financial FCU and First County Bank: discovery correctly identified fee schedule links on JavaScript-rendered pages, but extraction returned zero fees despite successful classification. Suggests rendering may not be capturing dynamic content properly or extraction logic doesn't work on js_rendered output.
- Webster Bank NA, Union Savings, Connecticut State Employees FCU, Thomaston, Chelsea Groton, Ives, Sikorsky successfully skipped discovery and moved directly to PDF extraction with 100% success rate (8/8). These institutions consistently publish PDFs.
- Bankwell, Ion Bank, Fairfield County, Dime Bank all failed discovery when initial pages were account comparison or rates pages rather than fee schedule pages. Discovery logic needs secondary link-following strategy.
- Charter Oak FCU: discovered correct fee PDF URL (lpl.com domain) but extraction blocked by 403. Content exists but is access-restricted on third-party platform.
- First County Bank, Newtown Savings, Northwest Community Bank all had fee schedules found via 'Disclosures,' 'Schedule of Charges,' or 'Consumer Schedule of Charges' footer links. Newtown example extracted 53 fees from this pattern.

### Promoted to National
- js_rendered pages require validation that content is actually available post-render before extraction attempt
- Pre-identified institutions known to use PDF fee schedules can skip discovery phase entirely
- Account comparison pages are false positives; discovery should include footer/disclosure link crawling when main rates page lacks fee content
- Third-party PDF hosting (LPL, etc.) may block automated access; document as retrievable but access-restricted
- Standardized footer link patterns ('Disclosures,' 'Schedule of Charges,' 'Consumer Schedules') are high-confidence discovery signals

## Run #128 — 2026-04-07
Discovered: 0 | Extracted: 54 | Failed: 42

### New Patterns
- PDF documents are reliable for fee schedule extraction with high success rates across multiple institutions
- JS-rendered pages show mixed results - some extract successfully, others fail completely with no fees extracted
- HTML pages show variable extraction success independent of format choice alone
- External hosted PDFs (third-party links) may be blocked or inaccessible even when discoverable
- Comparison/feature pages are poor sources - contain fee references but lack complete fee schedules
- Credit unions show higher extraction success rates than banks in this state sample

### Site Notes
- Webster Bank, Thomaston Savings Bank, Ives Bank, Sikorsky Financial all successfully extracted from PDFs (29-47 fees each)
- Chelsea Groton Bank extracted 38 fees from js_rendered, but American Eagle Financial and First County Bank failed entirely from same content type
- Liberty Bank (2 fees) vs Connecticut State Employees FCU (25 fees) vs Newtown Savings Bank (53 fees) - all HTML but vastly different extraction results suggest page structure variation
- Charter Oak Federal Credit Union: PDF classified successfully but extraction failed with 403 Forbidden on lpl.com hosted document - suggests link discovery doesn't guarantee access
- Bankwell Bank and Fairfield County Bank discovered pages that show 'some fee information' but were inadequate for extraction - site architecture routes fees differently than expected
- 7 of 9 credit unions extracted successfully (78%) vs 9 of 14 banks (64%)

### Promoted to National
- Extraction variability within same content type (e.g., HTML range 2-53 fees) indicates page-level structure matters more than format - need content structure analysis, not just format classification

## Run #134 — 2026-04-07
Discovered: 0 | Extracted: 53 | Failed: 43

### New Patterns
- JS-rendered pages show mixed extraction results - some succeed (Chelsea Groton: 38 fees, Ascend: 5 fees, American Eagle: 0 fees, First County: 0 fees) suggesting JS rendering alone doesn't guarantee fee data extraction; content structure varies
- PDF-based fee schedules consistently extract high fee counts (Webster Bank: 47, Thomaston: 47, Ives: 42, Sikorsky: 41, Northwest: 30) - PDF format appears more reliable for structured fee data
- Charter Oak Federal Credit Union extract failed with 403 Forbidden on LPL Financial domain (https://www.lpl.com) - indicates third-party hosted fee documents may have access restrictions
- Discover failures on checking account pages (Bankwell, Ion, Fairfield County, Dime) show discovery logic incorrectly identifies comparison/feature pages as fee disclosure locations - suggests over-optimistic heuristics
- HTML pages show variable extraction: Liberty Bank (2 fees), Connecticut State Employees FCU (25 fees), Newtown Savings (52 fees) - wide variance suggests HTML fee disclosure structure is bank-specific with no standardized layout

### Site Notes
- American Eagle Financial and First County Bank both classified as js_rendered but failed extraction with 'no fees extracted' - may indicate fee data loaded dynamically or behind additional navigation not captured by standard extraction
- External PDF hosting (particularly on lpl.com) may require special handling or proxy access; worth investigating if pattern repeats across other institutions using LPL
- Multiple CT banks embed fee schedules deeper than checking account landing pages; discovery skipping strategy (14 institutions) may have avoided these false-positive traps

### Promoted to National
- PDF-hosted fee schedules are more reliable extraction targets than HTML or JS-rendered pages; prioritize PDF discovery in future workflows
- HTML-based fee schedules require more sophisticated parsing than PDFs; consider HTML as secondary extraction target after exhausting PDF sources
