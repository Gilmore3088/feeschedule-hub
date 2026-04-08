# RI Fee Schedule Knowledge


## Run #13 — 2026-04-06
Discovered: 3 | Extracted: 7 | Failed: 13

### New Patterns
- Discover phase failures often occur when fee schedules are on /disclosures or require navigation beyond homepage; /disclosures should be a default crawl target
- JS-rendered pages consistently fail at extraction stage even after successful classification; indicates rendering captures page structure but not fee table data
- PDF format consistently succeeds (100% extraction rate when discovered); HTML and JS-rendered formats have mixed results
- Credit unions with skipped discovery but successful extraction indicate fee schedules exist at predictable URLs not being discovered through homepage navigation
- Discover failures with 'Terms and Conditions' reasoning (Ocean State FCU) or form pages (Rhode Island FCU) indicate incorrect page classification during discovery

### Site Notes
- Centreville Bank succeeded by having fee PDF on /disclosures; BankNewport and Citizens Bank failed due to no homepage links
- Washington Trust Company, Coastal1 FCU, and Community & Teachers FCU all classify as js_rendered but only Community & Teachers extracted successfully—inconsistent behavior suggests timing or selector issues
- All successfully extracted PDFs (Centreville, Shoreham, Cranston Municipal Employees); credit unions with HTML/JS-rendered formats show 50% extraction failure
- 6 of 16 credit unions skipped discovery but 4 extracted successfully (Peoples FCU: 37 fees, Community & Teachers: 31 fees, Blackstone River: 25 fees), suggesting direct URL patterns work
- Multiple failures cite wrong page types being selected; discovery logic needs tighter validation

### Promoted to National
- Add /disclosures to standard discovery paths for all institutions
- JS-rendered fee schedule extraction needs debugging; may require explicit wait for specific DOM elements or different parsing approach
- Prioritize PDF discovery paths and consider format-specific extraction strategies
- Develop institution-type-specific URL patterns for credit unions (e.g., /fees, /fee-schedule, /service-charges) to bypass homepage discovery

## Run #204 — 2026-04-07
Discovered: 0 | Extracted: 8 | Failed: 12

### New Patterns
- PDF-based fee schedules show consistent extraction success across credit unions
- JS-rendered pages frequently fail extraction despite successful classification
- Banks with 404 errors and generic navigation pages require manual intervention
- Skipped discoveries suggest pre-populated institution list with known URLs

### Site Notes
- Navigant FCU, Centreville Bank, Greenwood FCU, The Peoples FCU, Shoreham Bank all successfully extracted from PDFs (6-64 fees each)
- The Washington Trust Company and Coastal1 FCU classified as js_rendered but yielded zero fees; Community & Teachers FCU succeeded with same format (31 fees)
- BankNewport, Independence Bank, and Cumberland Municipal Employees FCU all returned 404-like or generic nav pages with no fee schedule links
- 12 of 20 institutions skipped discovery phase, indicating workflow using pre-vetted website URLs rather than homepage link discovery
- Two institutions (Pawtucket Municipal Employees FCU, Natco Employees FCU) had no website_url in source data, preventing any discovery attempt

### Promoted to National
- Prioritize PDF discovery paths for credit unions; PDFs appear more reliably structured than HTML/JS-rendered pages
- JS-rendered classification alone is insufficient predictor of extraction success; rendering quality/content variation is high
- Discover failures on institution homepages may indicate sites requiring direct URL knowledge or site search functionality
- Rhode Island run relied on institutional knowledge rather than homepage link crawling; effectiveness limited by database completeness
- Data quality issue: verify all institutions have website URLs populated before discovery workflow initiation

## Run #205 — 2026-04-07
Discovered: 0 | Extracted: 7 | Failed: 13

### New Patterns
- JS-rendered pages with fee information frequently fail extraction despite successful classification
- Account detail pages behind secondary navigation are missed by homepage discovery
- Credit unions with PDF fee schedules show high extraction success rate
- Banks without website URLs in source data cannot be discovered
- Institutional landing pages without direct fee links require contextual navigation hints
- HTML-classified pages show mixed results but lower failure rate than js_rendered

### Site Notes
- The Washington Trust Company, Coastal1 FCU, Blackstone River FCU, Community & Teachers FCU all classify as js_rendered but extraction fails for first three despite Community & Teachers succeeding - suggests inconsistent page structure or missing selectors for some institutions
- BankNewport requires clicking 'View Benefits' links on account detail pages to access fee information - homepage discovery strategy insufficient for this pattern
- Navigant FCU, Centreville Bank, Greenwood FCU, Peoples FCU, Shoreham Bank all extracted successfully from PDF format with no validation failures
- Pawtucket Municipal Employees FCU and Natco Employees FCU marked discover=failed due to missing website_url field
- Multiple discover=failed results include helpful contextual notes ('Rates pages contain fee schedules', 'Checking account pages typically contain fee information') suggesting AI identified correct paths but extraction strategy didn't execute them
- Westerly Community FCU classified as html extracted successfully (2 fees) with no failures

### Promoted to National
- Multi-step navigation paths (homepage → account type → fees) require recursive crawling or secondary page discovery strategy
- PDF documents are reliable extraction source - prioritize PDF discovery in classification strategy
- Data quality issue - ensure all institution records include valid website URLs before discovery phase
- Discovery failures with contextual hints indicate viable alternative paths exist - implement multi-path discovery for common institutional layouts

## Run #206 — 2026-04-07
Discovered: 0 | Extracted: 6 | Failed: 14

### New Patterns
- JS-rendered pages consistently fail extraction despite successful classification
- PDF documents show mixed extraction success (some perfect, some fail entirely)
- Discovery failures cite checking account pages and rates pages as expected locations but fail to locate fee schedules
- HTML and PDF formats show higher success rates than js_rendered or skipped discovery

### Site Notes
- The Washington Trust Company, Coastal1 FCU, and Blackstone River FCU all classify as js_rendered but yield zero fees. Suggests rendering may not be capturing dynamic fee content or content structure differs post-render.
- Centreville Bank, Greenwood FCU, Peoples FCU, and Shoreham Bank extracted successfully from PDFs (15-40 fees), but Cranston Municipal Employees FCU and Navigant FCU failed despite PDF classification
- BankNewport, Rhode Island FCU, and Wave FCU all have checking account pages that mention fees conceptually but lack direct links to fee schedule documents
- Community & Teachers FCU successfully extracted 31 fees from js_rendered content, contradicting the broader js_rendered failure pattern
- 4 of 6 successful extractions came from PDF/HTML sources; only 1 from js_rendered (Community & Teachers). Westerly Community FCU extracted 2 fees from HTML.

### Promoted to National
- JS-rendered fee schedules need enhanced extraction logic — standard patterns may not apply to dynamically loaded fee tables
- PDF extraction consistency issue — may indicate OCR/parsing failures on certain PDF layouts or font encoding problems
- Banks increasingly embed fee information in account comparison tables rather than standalone documents — discovery logic should prioritize table extraction
- JS-rendered extraction success is possible but not guaranteed — needs investigation into what structural differences enabled this success
- Prioritize HTML/PDF discovery pathways over JavaScript rendering for fee schedule location
