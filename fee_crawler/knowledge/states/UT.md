# UT Fee Schedule Knowledge


## Run #141 — 2026-04-07
Discovered: 25 | Extracted: 37 | Failed: 59

### New Patterns
- PDF documents with explicit 'fee schedule' or 'Bank fee schedule' references in filenames/descriptions have high discovery success but variable extraction rates
- JavaScript-rendered pages show mixed results: SoFi Bank successfully extracted 4 fees, but Goldenwest Federal Credit Union and BMW Bank extracted 0 despite js_rendered classification
- Several institutions fail at discover phase due to homepage load failures or empty page content (Synchrony Bank HTTP2 error, Sunwest Bank empty resource page, Merrick Bank timeout)
- Skipped discover phase (no URL provided) prevents assessment of 5 institutions, but several succeeded in extraction anyway via classify-ok paths (Ally Bank, SoFi Bank, Mountain America)
- HTML-classified pages show strong extraction performance (Bank of Utah 47 fees, State Bank of Southern Utah 15, Green Dot Bank 30) vs PDF pages with discovery success but extraction failure (Zions, Sallie Mae, Optum)
- 60% failure rate (59 failed of ~100 total attempts) concentrated in discover phase (24+ institutions) and extraction phase despite successful discovery/classification

### Site Notes
- America First Federal Credit Union and Optum Bank both had fee-related PDFs discovered via CMS links, but only America First successfully extracted (36 fees vs 0). Suggests extraction logic struggles with certain PDF layouts despite successful discovery.
- SoFi Bank (js_rendered) succeeded where others failed, suggesting some institutions render fee data differently or extraction doesn't wait for dynamic content stabilization
- Technical failures (net::ERR_HTTP2_PROTOCOL_ERROR, timeout) prevent discovery on otherwise viable targets; these are not institutional refusals to publish
- Pre-classified documents (already identified URLs) bypass discover but then face extraction failures (Ally, Mountain America) or success (SoFi). Suggests inconsistent extraction readiness despite known document locations.
- HTML-rendered fee tables extract reliably; PDFs discovered via CMS links frequently fail extraction despite appearing relevant. Sallie Mae's Terms and Conditions links contained no extractable fees.
- UT has disproportionately high discover failures compared to 25 discoveries, with many institutional websites lacking visible fee schedule links or navigation

### Promoted to National
- Standardize PDF extraction pipeline to handle fee tables in CRA public files and disclosure PDFs separately from general Terms & Conditions
- Investigate SoFi Bank's page structure for replicable JS rendering patterns; consider longer waits for dynamic fee table population
- Implement retry logic with protocol fallbacks and extended timeouts for discover phase; separate technical failures from intentional non-publication
- When discover is skipped, ensure extraction pipeline is calibrated for that document type; current pipeline may have classify-ok → extract path issues
- HTML table extraction is production-ready; PDF extraction from discovery phase needs debugging—likely document format/layout variance not handled
- Consider targeted outreach to failed institutions or alternative discovery methods (regulatory filings, cached versions) for institutions with empty resource pages or hidden disclosures

## Run #158 — 2026-04-07
Discovered: 1 | Extracted: 36 | Failed: 60

### New Patterns
- PDF documents with access restrictions (403 Forbidden) are discoverable but not extractable
- HTML-based fee schedules significantly outperform PDF extraction
- JavaScript-rendered pages show mixed results - some succeed, most fail
- Skipped discoveries on subsequent runs suggest institutions have fee content already cached/known
- Network/timeout errors during discovery phase correlate with institutional infrastructure issues
- Institutions without dedicated disclosures pages rarely publish fee schedules online

### Site Notes
- America First Federal Credit Union has fee schedule PDF at /documents/busi* but returns 403 Forbidden - indicates document exists but extraction pipeline cannot access it
- Bank of Utah (HTML, 42 fees extracted) and Green Dot Bank (HTML, 30 fees extracted) vastly exceeded PDF-based institutions; HTML parsing yields complete data while PDFs frequently fail with 'no fees extracted'
- SoFi Bank (js_rendered, 6 fees) succeeded while BMW Bank and Goldenwest (both js_rendered) failed extraction - suggests js_rendered classification alone doesn't predict success; content complexity/structure varies
- Many institutions marked 'discover=skipped' with no explanation moved directly to classify/extract - indicates prior knowledge of fee locations, reducing discovery overhead for repeat runs
- Synchrony Bank (HTTP2 protocol error) and Merrick Bank (20s timeout) appear to have server-side stability issues unrelated to fee schedule availability
- Morgan Stanley (no website_url), American Express (no links), Celtic Bank (no links), WEX Inc (corporate page), Medallion Bank (current borrowers page) - absence of formal disclosures page correlates with discovery failure

### Promoted to National
- HTML-based fee presentation should be prioritized in extraction templates; PDF parsing logic needs debugging as 5 of 7 PDF extractions failed

## Run #171 — 2026-04-07
Discovered: 0 | Extracted: 36 | Failed: 60

### New Patterns
- PDF documents with access restrictions (403 Forbidden) indicate fee schedules exist but require authentication or special permissions
- JavaScript-rendered pages show higher extraction success rates than static HTML/PDF when fee information is dynamically loaded
- Large fee counts (30+) in single extractions indicate consolidated fee schedules with multiple account types or service categories
- Homepage load failures (HTTP/2 protocol errors, timeouts, empty page states) correlate with institutions that may not have public fee disclosure online
- National banks and corporate-focused websites (WEX Bank, Medallion Bank) frequently misclassify or lack fee disclosure pages
- 404 and missing disclosures indicate institutions may have removed or relocated fee schedule URLs without proper redirects

### Site Notes
- America First Federal Credit Union blocks PDF access at https://www.americafirst.com/documents/busi - document exists but not publicly accessible
- SoFi Bank (js_rendered) extracted 6 fees successfully; contrast with Sallie Mae Bank (html) which failed extraction despite successful classification
- Green Dot Bank extracted 30 fees, Bank of Utah extracted 44 fees - both successfully classified as html/html, suggesting well-structured fee tables
- Synchrony Bank (HTTP/2 error), Merrick Bank (timeout), Sunwest Bank (empty page), Comenity Capital Bank (no content) all failed discovery - potential non-disclosure
- WEX Bank labeled as corporate payment solutions site; Medallion Bank returned company overview instead of fee schedule
- Cache Valley Bank returned 404 error on disclosures URL - document previously indexed but now absent

### Promoted to National
- Access-denied errors on fee documents suggest need for authenticated crawling or manual retrieval processes for credit unions
- Prioritize JS rendering for banks with dynamically-loaded fee schedules; standard HTML parsing insufficient
- Single-page consolidated fee schedules are more reliably extractable than multi-page or scattered disclosures
- Homepage inaccessibility warrants manual verification; some institutions may deliberately not publish fee schedules online
- Corporate vs. consumer banking distinction matters - institutions serving businesses may not publish retail fee schedules
- Tracking URL changes and maintaining fallback discovery methods needed for institutions that reorganize disclosure locations

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 51% (43/84 addressable)
- Total institutions: 96 (excluded: 12)
- Institutions with URL but no fees: needs investigation
