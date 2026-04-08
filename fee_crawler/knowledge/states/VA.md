# VA Fee Schedule Knowledge


## Run #108 — 2026-04-07
Discovered: 21 | Extracted: 68 | Failed: 84

### New Patterns
- JS-rendered pages with fee schedule content often fail extraction despite successful discovery
- PDF corruption or format issues cause extraction failures even when properly classified
- Skipped discovery (likely preset URL) correlates with high extraction success on PDFs
- Search algorithm returns unrelated pages (investment disclosures, credit card terms, help pages) instead of fee schedules
- Network/protocol errors on institution homepages prevent any discovery
- HTML pages with embedded fee schedule content require JS rendering to extract
- Some institutions host fee schedules on third-party financial service provider domains (LPL)

### Site Notes
- Virginia Federal Credit Union and The First Bank and Trust Company both discovered fee schedules on JS-rendered pages but extraction failed or returned minimal fees (5 vs expected higher count)
- Burke & Herbert Bank PDF returned 'No /Root object' error; State Department FCU and Apple FCU PDFs classified correctly but yielded zero fees
- 10 institutions with skipped discovery went directly to classified PDFs; 7 of 10 succeeded in extraction, suggesting preset URLs are generally reliable for PDF fee schedules
- HSBC returned investment page, First Community Bank returned cardholder agreement, Chartway returned help page—all failed discovery despite likely having fee schedules
- Pentagon Federal Credit Union failed with net::ERR_HTTP2_PROTOCOL_ERROR on homepage goto
- Navy Federal Credit Union and Bayport Federal Credit Union both HTML-classified but Bayport succeeded (42 fees) while Navy Federal failed extraction
- Blue Ridge Bank's PDF link discovered but returns 403 Forbidden (external LPL.com hosted content), indicating fee schedule hosted on third-party domain

### Promoted to National
- JS-rendered fee schedule pages need improved extraction logic; consider comparing rendered vs source HTML extraction strategies
- Implement pre-extraction PDF validation to detect corrupted files and flag for manual review before attempted extraction
- Maintain and expand curated URL lists for financial institutions with known fee schedule locations
- Improve discovery filters to exclude investment products, credit card terms, and support pages; target 'deposit account' or 'checking/savings' fee schedules specifically
- Implement HTTP/1.1 fallback or retry logic for institutions with HTTP/2 protocol issues
- Treat HTML fee schedules as requiring JS rendering; current extraction may not handle dynamically-loaded content
- Monitor for 403/permission errors on external domains; may indicate licensing or access restrictions requiring alternative discovery methods

## Run #125 — 2026-04-07
Discovered: 4 | Extracted: 71 | Failed: 81

### New Patterns
- Credit unions with js_rendered fee schedules often contain minimal fee data (2-3 items extracted)
- PDF files labeled as fee schedules may fail extraction due to structural issues unrelated to content
- Large bank homepages require product-level navigation to locate fee schedules
- HTTP/2 protocol errors prevent discovery on some institution homepages
- Institutions publishing fee schedules as investment/cardholder disclosures rather than banking service fee schedules create false positives

### Site Notes
- Virginia Federal Credit Union and The First Bank and Trust Company both classified as js_rendered but extracted minimal fees or failed entirely; suggests JavaScript-heavy pages may have fees in dynamic content not captured by extraction
- Burke & Herbert Bank shows '/Root object' PDF corruption error; Apple Federal, State Department FCU, and Blue Ridge Bank all fail extraction despite being correctly classified as PDFs—suggests malformed PDFs or access restrictions are common in VA financial institutions
- Capital One discovery failed because fee schedules are nested on specific banking product pages rather than centralized; suggests major banks distribute fee information across product silos
- Pentagon Federal Credit Union homepage failed with net::ERR_HTTP2_PROTOCOL_ERROR; indicates server-side protocol issues block initial discovery phase
- HSBC Bank USA discovery failed on investments page; Chartway FCU and First Community Bank discovery failed because pages contained credit card or service-specific agreements, not general fee schedules

### Promoted to National
- PDF extraction failures in credit unions warrant review—multiple VA credit unions show /Root errors or zero-fee extraction despite successful classification; may indicate industry-wide PDF formatting or protection patterns

## Run #138 — 2026-04-07
Discovered: 0 | Extracted: 71 | Failed: 81

### New Patterns
- PDF files classified as extractable but yielding no fees indicate corrupted, image-only, or fee-absent PDFs need secondary validation before extraction attempt
- HTML-classified documents from credit unions (Navy Federal, Bayport) show divergent extraction outcomes despite same format—indicates HTML fee disclosure structure varies significantly by institution
- JS-rendered pages show low fee counts (TowneBank=1, Virginia Federal=6, First Bank=failed) suggesting dynamic content either sparse in fees or extraction missing dynamically-loaded elements
- Credit unions with skipped discovery (Navy Federal, Pentagon Federal, Atlantic Union, etc.) still proceeded to classification/extraction, suggesting discovery=skipped does not indicate missing data but rather discovery step bypass
- Zero discoveries across 35 institutions despite 71 successful extractions indicates discovery mechanism is not primary bottleneck—extraction success driven by pre-existing URLs or manual seed lists

### Site Notes
- Apple Federal, State Department Federal, Blue Ridge Bank classified as PDF but extract=failed with 'no fees extracted'. Burke & Herbert Bank failed with PDF root object error. Pattern suggests classification success ≠ extractable content.
- Navy Federal (html, extract=failed) vs Bayport Federal (html, extract=ok, 50 fees). Both credit unions, both HTML, opposite results. Suggests extraction rules may need institution-specific HTML selectors.
- Three js_rendered classifications: 1 success with 1 fee, 1 success with 6 fees, 1 failed completely. May indicate JavaScript execution timing issues or incomplete DOM waiting.
- Multiple institutions show discover=skipped followed by successful classification and extraction, particularly credit unions. Discover failures were primarily banks (Capital One, HSBC, Pentagon Federal, Chartway, First Community, Citizens and Farmers).
- 0 discover=ok results but 71 extracted fees suggests discovery step is bypassed or seeded externally. High discover=failed and discover=skipped rates mask that actual fee extraction proceeds successfully regardless.

### Promoted to National
- Implement post-classification validation: sample PDF pages for text layer presence and fee keyword frequency before full extraction to reduce wasted processing on non-extractable documents
- HTML extraction may require institution-level template tuning; consider building selector libraries per credit union format rather than generic HTML parsing
- JS-rendered fee pages may require longer DOM settlement waiting or post-render validation; current approach appears to capture incomplete datasets
- Bank discovery pages appear more prone to navigation complexity; credit unions may have more standardized disclosure page locations, enabling skip-to-classification approach for known institutional types
- Validate whether discovery step is functional or redundant in current pipeline; extraction success implies URLs already known through other means

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 60% (83/138 addressable)
- Total institutions: 152 (excluded: 14)
- Institutions with URL but no fees: needs investigation
