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
