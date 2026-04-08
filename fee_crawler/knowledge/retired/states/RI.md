
## Pruned 2026-04-07

## Run #13 — 2026-04-06
## Run #204 — 2026-04-07
## Run #205 — 2026-04-07
## Run #206 — 2026-04-07
## Run #220 -- Pass 1 (tier1) — 2026-04-07
### New Patterns
### Promoted to National
### Site Notes
- 12 of 20 institutions skipped discovery phase, indicating workflow using pre-vetted website URLs rather than homepage link discovery
- 4 of 6 successful extractions came from PDF/HTML sources; only 1 from js_rendered (Community & Teachers). Westerly Community FCU extracted 2 fees from HTML.
- 6 of 16 credit unions skipped discovery but 4 extracted successfully (Peoples FCU: 37 fees, Community & Teachers: 31 fees, Blackstone River: 25 fees), suggesting direct URL patterns work
- Account detail pages behind secondary navigation are missed by homepage discovery
- Add /disclosures to standard discovery paths for all institutions
- All successfully extracted PDFs (Centreville, Shoreham, Cranston Municipal Employees); credit unions with HTML/JS-rendered formats show 50% extraction failure
- BankNewport requires clicking 'View Benefits' links on account detail pages to access fee information - homepage discovery strategy insufficient for this pattern
- BankNewport, Independence Bank, and Cumberland Municipal Employees FCU all returned 404-like or generic nav pages with no fee schedule links
- BankNewport, Rhode Island FCU, and Wave FCU all have checking account pages that mention fees conceptually but lack direct links to fee schedule documents
- Banks increasingly embed fee information in account comparison tables rather than standalone documents — discovery logic should prioritize table extraction
- Banks with 404 errors and generic navigation pages require manual intervention
- Banks without website URLs in source data cannot be discovered
- Centreville Bank succeeded by having fee PDF on /disclosures; BankNewport and Citizens Bank failed due to no homepage links
- Centreville Bank, Greenwood FCU, Peoples FCU, and Shoreham Bank extracted successfully from PDFs (15-40 fees), but Cranston Municipal Employees FCU and Navigant FCU failed despite PDF classification
- Community & Teachers FCU successfully extracted 31 fees from js_rendered content, contradicting the broader js_rendered failure pattern
- Credit unions show higher success rate (6 of 12 extracted) vs banks (1 of 3), with PDF credit unions nearly 100% success
- Credit unions with PDF fee schedules show high extraction success rate
- Credit unions with skipped discovery but successful extraction indicate fee schedules exist at predictable URLs not being discovered through homepage navigation
- Data quality issue - ensure all institution records include valid website URLs before discovery phase
- Data quality issue: verify all institutions have website URLs populated before discovery workflow initiation
- Develop institution-type-specific URL patterns for credit unions (e.g., /fees, /fee-schedule, /service-charges) to bypass homepage discovery
- Discover failures on institution homepages may indicate sites requiring direct URL knowledge or site search functionality
- Discover failures with 'Terms and Conditions' reasoning (Ocean State FCU) or form pages (Rhode Island FCU) indicate incorrect page classification during discovery
- Discover phase failures often occur when fee schedules are on /disclosures or require navigation beyond homepage; /disclosures should be a default crawl target
- Discovery failures cite checking account pages and rates pages as expected locations but fail to locate fee schedules
- Discovery failures with contextual hints indicate viable alternative paths exist - implement multi-path discovery for common institutional layouts
- Discovery heuristics for 'Rates' pages and T&C pages producing false positives without fee content
- HTML and PDF formats show higher success rates than js_rendered or skipped discovery
- HTML extraction logic may have institution-specific dependencies or whitespace/table structure sensitivity — needs debugging on consistent HTML extraction approach
- HTML-based fee schedules show mixed results; one success (Westerly Community FCU: 2 fees) but most classified as HTML fail extraction
- HTML-classified pages show mixed results but lower failure rate than js_rendered
- Improve discovery validation: confirm page contains actual fee/charge tables, not just structural similarity to fee schedule pages
- Institution type and preferred fee disclosure format are correlated; consider format-specific extraction tuning
- Institutional landing pages without direct fee links require contextual navigation hints
- JS-rendered classification alone is insufficient predictor of extraction success; rendering quality/content variation is high
- JS-rendered extraction success is possible but not guaranteed — needs investigation into what structural differences enabled this success
- JS-rendered fee schedule extraction needs debugging; may require explicit wait for specific DOM elements or different parsing approach
- JS-rendered fee schedules need enhanced extraction logic — standard patterns may not apply to dynamically loaded fee tables
- JS-rendered pages consistently fail at extraction stage even after successful classification; indicates rendering captures page structure but not fee table data
- JS-rendered pages consistently fail extraction despite successful classification
- JS-rendered pages frequently fail extraction despite successful classification
- JS-rendered pages with fee information frequently fail extraction despite successful classification
- Multi-step navigation paths (homepage → account type → fees) require recursive crawling or secondary page discovery strategy
- Multiple RI institutions lack website URLs (Pawtucket Municipal EE FCU, Natco EE FCU) causing discovery skips, suggesting potential data quality issue in institution dataset for RI.
- Multiple discover=failed results include helpful contextual notes ('Rates pages contain fee schedules', 'Checking account pages typically contain fee information') suggesting AI identified correct paths but extraction strategy didn't execute them
- Multiple failures cite wrong page types being selected; discovery logic needs tighter validation
- Navigant FCU, Centreville Bank, Greenwood FCU, Peoples FCU, Shoreham Bank all extracted successfully from PDF format with no validation failures
- Navigant FCU, Centreville Bank, Greenwood FCU, The Peoples FCU, Shoreham Bank all successfully extracted from PDFs (6-64 fees each)
- PDF documents are reliable extraction source - prioritize PDF discovery in classification strategy
- PDF documents show mixed extraction success (some perfect, some fail entirely)
- PDF extraction consistency issue — may indicate OCR/parsing failures on certain PDF layouts or font encoding problems
- PDF format consistently succeeds (100% extraction rate when discovered); HTML and JS-rendered formats have mixed results
- PDF-based fee schedules extract successfully; JS-rendered pages frequently fail extraction despite successful classification
- PDF-based fee schedules show consistent extraction success across credit unions
- Pawtucket Municipal Employees FCU and Natco Employees FCU marked discover=failed due to missing website_url field
- Prioritize HTML/PDF discovery pathways over JavaScript rendering for fee schedule location
- Prioritize PDF discovery paths and consider format-specific extraction strategies
- Prioritize PDF discovery paths for credit unions; PDFs appear more reliably structured than HTML/JS-rendered pages
- RI credit unions using PDF format achieved 100% extraction success. Banks predominantly use JS-rendered interfaces with 0% extraction success.
- RI shows stark contrast: PDF documents (Centreville Bank, Greenwood FCU, Peoples FCU, Shoreham Bank) all extracted fees successfully. JS-rendered pages (Citizens Bank, Washington Trust, Coastal1 FCU, Rhode Island FCU, Blackstone River FCU) classified correctly but extraction failed completely.
- Rhode Island FCU discovery succeeded with 'Rates' link mention but extract failed. Ocean State FCU and Cumberland Municipal EE FCU discovery messages reference T&C pages but failed — suggests discovery pattern matching URLs/text without validating actual fee schedule presence.
- Rhode Island run relied on institutional knowledge rather than homepage link crawling; effectiveness limited by database completeness
- Skipped discoveries suggest pre-populated institution list with known URLs
- The Washington Trust Company and Coastal1 FCU classified as js_rendered but yielded zero fees; Community & Teachers FCU succeeded with same format (31 fees)
- The Washington Trust Company, Coastal1 FCU, Blackstone River FCU, Community & Teachers FCU all classify as js_rendered but extraction fails for first three despite Community & Teachers succeeding - suggests inconsistent page structure or missing selectors for some institutions
- The Washington Trust Company, Coastal1 FCU, and Blackstone River FCU all classify as js_rendered but yield zero fees. Suggests rendering may not be capturing dynamic fee content or content structure differs post-render.
- Two institutions (Pawtucket Municipal Employees FCU, Natco Employees FCU) had no website_url in source data, preventing any discovery attempt
- Validate website_url field completeness in state institution rosters before running discovery
- Washington Trust Company, Coastal1 FCU, and Community & Teachers FCU all classify as js_rendered but only Community & Teachers extracted successfully—inconsistent behavior suggests timing or selector issues
- Westerly Community FCU (HTML) extracted 2 fees successfully, but other HTML-classified institutions still failed extraction despite correct format identification.
- Westerly Community FCU classified as html extracted successfully (2 fees) with no failures
- When classification identifies JS-rendered content, apply secondary HTML parsing or text extraction strategy after rendering, as current extraction pipeline may not be processing JS-rendered fee tables correctly
Discovered: 0 | Extracted: 6 | Failed: 14
Discovered: 0 | Extracted: 7 | Failed: 13
Discovered: 0 | Extracted: 8 | Failed: 12
Discovered: 3 | Extracted: 7 | Failed: 13

