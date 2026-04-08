# SC Fee Schedule Knowledge


## Run #94 — 2026-04-07
Discovered: 24 | Extracted: 38 | Failed: 51

### New Patterns
- JS-rendered pages with fee schedules often fail extraction despite successful discovery/classification
- Skipped discovery step correlates with 100% extraction success in this dataset
- Inline/comparison-tab fee disclosure defeats discovery heuristics
- About Us sections sometimes contain fee schedule links
- HTML-classified pages show high extraction success; JS-rendered show mixed results
- High fee counts (60+) extracted suggest comprehensive structured tables
- Failed discoveries on checking account pages with 'basic information' suggest narrative/inline fee disclosure format

### Site Notes
- United Community Bank (js_rendered) hit 403 Forbidden on extraction; South Atlantic Bank, Palmetto Citizens, First Capital Bank (all js_rendered discovers) extracted zero fees despite classification success
- 10 institutions with skipped discovers all successfully extracted fees (credit unions: South Carolina Federal, SRP, S.C. State, Sharonview, Allsouth; banks: Anderson Brothers, Security Federal, The Conway National, Coastal Carolina). Suggests pre-identified institution list bypassed problematic discovery phase
- First Palmetto Bank, First Community Bank, Safe Federal Credit Union discovery marked as failed because fees were embedded in account comparison tables or inline content rather than linked schedules
- Palmetto Citizens Federal Credit Union: 'Rates & Fees' link found in About Us section — non-standard location that may be missed by typical navigation crawlers
- HTML: 9/10 extractions successful (Anderson Brothers, SRP Federal, Conway National, Security Federal, Allsouth, S.C. State, Sharonview, Rev Federal extract ok). JS-rendered: 3/6 failed (United Community Bank, South Atlantic Bank, First Capital Bank)
- Security Federal Bank extracted 63 fees, Rev Federal Credit Union 100 fees — both HTML-classified, suggesting well-structured fee tables versus sparse/narrative fee descriptions elsewhere
- Coastal States Bank, Safe Federal Credit Union, Bank of Travelers Rest discovery failures coincide with descriptions mentioning navigation/account info pages rather than dedicated fee schedules

### Promoted to National
- JS-rendered fee schedule pages require either improved extraction logic or alternative crawling strategy — simple rendering may not expose fee tables
- Consider maintaining pre-curated institution lists to bypass unreliable homepage discovery
- Discovery patterns should account for embedded fee disclosures in account comparison/feature pages, not just dedicated fee schedule links
- HTML pages are more reliably extractable than JS-rendered; prioritize or retry JS-rendered extractions with alternative methods

## Run #103 — 2026-04-07
Discovered: 1 | Extracted: 39 | Failed: 50

### New Patterns
- Discovery failures on product pages (checking accounts, rates pages) suggest these pages contain fee references but lack direct links to dedicated fee schedules; discovery agent needs to recognize inline fee mentions and follow to full disclosures
- JS-rendered pages show higher extraction success rates (Rev Federal Credit Union: 100 fees, United Community Bank: 15, South Carolina Federal Credit Union: 49) compared to mixed html results; rendering appears critical for fee schedule discovery
- Extract failures with 'no fees extracted' occur on both html and js_rendered classified pages (South Atlantic Bank, Palmetto Citizens Federal Credit Union, Coastal Carolina National Bank, First Capital Bank), suggesting classification success doesn't guarantee extractable content; pages may have fee structure info in non-tabular formats
- Discover skipped entries (11 institutions) represent pre-identified URLs bypassing discovery; this accounts for most successful extractions (6 of 7 successful discovers were skipped discover stage)
- Credit unions show mixed results despite similar webpage structures; some (Srp Federal Credit Union: 41, S.C. State Federal Credit Union: 39, Sharonview: 29) extract well while others (Palmetto Citizens, Coastal Carolina) fail completely - suggests institution-specific page structure variations even within same institution type
- FAQ and About Us pages mentioned in discovery failures as potential fee schedule locations but flagged as uncertain - these secondary pages warrant targeted discovery rules

### Site Notes
- Southern First Bank, First Community Bank, Safe Federal Credit Union, Bank of Travelers Rest, First Palmetto Bank all failed discovery on product pages with partial fee information
- South Atlantic Bank (js_rendered) and First Capital Bank (js_rendered) failed extraction despite successful classification - content exists but extraction logic doesn't match page structure
- Credit union fee schedules not standardized; cannot apply uniform extraction rules across credit union sector
- Coastal States Bank (FAQ section), First Reliance Bank (About us pages) - discovery agent correctly identified but didn't extract

### Promoted to National
- Prioritize JS rendering in fee schedule discovery pipeline; non-rendered html may miss dynamically-loaded fee tables
- Manual URL curation for known fee schedule locations significantly improves extraction success; develop pre-populated institution fee schedule URL database

## Run #106 — 2026-04-07
Discovered: 2 | Extracted: 40 | Failed: 49

### New Patterns
- JS-rendered pages show mixed extraction outcomes despite successful classification
- Discover failures cluster on account-type pages rather than dedicated fee schedules
- HTML-classified pages show consistently successful extraction (no failures)
- Extract failures with successful classification indicate content recognition vs. parsing gap

### Site Notes
- First Community Bank and First Capital Bank: discover succeeded but extract failed despite js_rendered classification, while Rev Federal Credit Union (js_rendered) extracted 100 fees successfully. Indicates page structure/content variation within same rendering type.
- Founders Federal Credit Union, Southern First Bank, Coastal States Bank, Safe Federal Credit Union, Bank of Travelers Rest all failed discover on account pages. These pages prioritize account features over fee details.
- Security Federal Bank (62 fees), Allsouth Federal Credit Union (38), S.C. State Federal Credit Union (40), Sharonview Federal Credit Union (29), The Conway National Bank (16) all succeeded. Zero extract failures in HTML category.
- South Atlantic Bank, Palmetto Citizens Federal Credit Union, Coastal Carolina National Bank: all classified successfully but reported 'no fees extracted'. Suggests discovery found fee pages but extraction logic failed to identify fee patterns.

### Promoted to National
- JS-rendered classification alone is insufficient predictor of successful fee extraction. Need secondary content structure validation before extraction attempt.
- Account comparison/product pages frequently lack fee schedule links. Direct search for 'fees', 'schedule', 'charges' terms on homepage may be more reliable than following account navigation paths.
- Static HTML fee pages are more reliably parseable than JS-rendered or dynamically loaded content. Consider prioritizing HTML-classified institutions.
- Failed extractions from successfully-classified pages warrant post-classification content inspection step to identify parsing rule mismatches before extraction attempt.

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 49% (42/86 addressable)
- Total institutions: 89 (excluded: 3)
- Institutions with URL but no fees: needs investigation
