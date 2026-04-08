# NV Fee Schedule Knowledge


## Run #143 — 2026-04-07
Discovered: 8 | Extracted: 10 | Failed: 18

### New Patterns
- PDF documents discovered but extraction fails despite successful classification
- JS-rendered pages with fee schedule links sometimes fail extraction
- Credit union PDFs skipped in discovery show successful extraction when classified
- Terms & Conditions pages incorrectly identified as containing fee schedules
- Missing website_url prevents discovery attempts entirely
- Direct fee schedule links on homepages are most reliable discovery method

### Site Notes
- One Nevada Federal Credit Union, Valley Bank of Nevada, Sierra Pacific Federal Credit Union all have PDFs that classify successfully but yield zero fees. May indicate PDFs with fee-related labels that lack actual fee data or use non-standard formatting.
- Wells Fargo National Bank West and Lexicon Bank both have discoverable fee schedule links on JS-rendered pages but extract=failed. Suggests JavaScript rendering issues or dynamic content that loads but doesn't populate expected fee fields.
- Greater Nevada, Farm Bureau Bank, Great Basin, Elko, Weststar, Sierra Pacific all skipped discovery but 5 of 6 extracted successfully. These were likely pre-identified from external sources or earlier runs.
- GBank and GenuBank searches landed on T&C pages instead of fee schedules. Homepage navigation alone insufficient for these institutions.
- Clark County Federal Credit Union, Silver State Schools FCU, Boulder Dam FCU, Eaglemark Savings Bank, Financial Horizons FCU, Plus FCU all failed with no website_url. These represent data quality gaps in institution registry.
- Beal Bank USA, Wells Fargo National Bank West, Nevada Bank and Trust Company all had discoverable homepage links. Nevada Bank and Trust (HTML, direct link) achieved 34 fees extracted — highest in state.

### Promoted to National
- PDF classification success does not guarantee extractable fee content; implement secondary validation to detect empty or mislabeled fee documents before extraction attempt.
- JS-rendered fee schedules require validation that content actually loaded post-render; check for placeholder elements or lazy-load failures.
- Maintain parallel discovery method for credit unions; direct PDF links may be more reliable than homepage navigation for this institution type.
- Implement site-specific link patterns for fee schedule location; T&C pages are distinct from fee schedules and should be filtered out.
- Validate institution records have website URLs before running discovery; incomplete registry prevents coverage.
- Homepage-level fee schedule links correlate with successful extraction; prioritize institutions with visible fee disclosures.

## Run #146 — 2026-04-07
Discovered: 1 | Extracted: 11 | Failed: 17

### New Patterns
- JS-rendered pages with fee schedules present extraction challenges even after rendering
- PDF-based fee schedules show mixed extraction reliability
- Pages mixing account info with fee details without dedicated fee schedule fail discovery
- Terms & Conditions pages commonly mistaken for fee schedules in discovery phase
- Form library pages do not contain fee schedules
- Credit unions more reliable for fee schedule publication than community banks

### Site Notes
- Wells Fargo National Bank West and Lexicon Bank both classified as js_rendered but extraction failed despite successful rendering, suggesting fee content may be dynamically loaded or structured in ways that evade extraction logic
- Valley Bank of Nevada and Sierra Pacific Federal Credit Union both returned PDF format but extraction failed, while other PDFs (Toyota, Farm Bureau) succeeded—indicates PDF structure/layout variations affect extraction success
- First Security Bank of Nevada identified as having 'account information with some fee details but no links to comprehensive fee schedule'—indicates institutions embedding fees in account pages rather than publishing standalone schedules
- GenuBank and GBank both failed discovery when landing on T&C pages; suggests institutions publishing T&C but not dedicated fee schedules, requiring discovery logic to distinguish between legal terms and fee disclosures
- Meadows Bank discovery failed on forms library page—confirms that banking form repositories are distinct from fee schedule locations
- 7 of 8 credit union extraction attempts succeeded (87.5%); community/regional banks show lower success rate—credit unions may have more standardized fee disclosure practices

### Promoted to National
- Many institutions (5+ in NV) lack active website URLs in data sources, blocking discovery entirely—data quality issue affecting all states

## Run #148 — 2026-04-07
Discovered: 0 | Extracted: 11 | Failed: 17

### New Patterns
- PDF-based fee schedules extract successfully more often than JS-rendered pages
- JS-rendered pages show inconsistent extraction outcomes
- Many discover failures attributed to missing website_url field rather than actual discovery method failures
- Landing pages with Terms & Conditions or account opening forms lack fee schedule links
- HTML-classified pages (non-PDF, non-JS) show moderate success

### Site Notes
- Greater Nevada FCU (52 fees), Farm Bureau Bank (34), Sierra Pacific FCU and Valley Bank (both PDFs but extraction failed despite PDF classification)
- Beal Bank USA extracted 8 fees successfully from JS-rendered content, but Wells Fargo National Bank West and Lexicon Bank both failed despite JS-rendered classification
- Clark County FCU, Silver State Schools FCU, Boulder Dam FCU, Eaglemark Savings Bank, Financial Horizons FCU, Plus FCU all failed discovery due to no website_url, suggesting data quality issue upstream
- Meadows Bank, GBank, GenuBank, First Security Bank of Nevada all discovered on pages showing account details/T&Cs but no fee links - suggests institutions embed fee info differently or don't publish separately
- Great Basin FCU (22 fees), Weststar FCU (34 fees), Nevada Bank and Trust (36 fees) all extracted successfully from basic HTML
- Valley Bank of Nevada, Sierra Pacific FCU classified as PDF but extraction returned no fees - indicates PDF parsing may be missing content or extraction rules need refinement

### Promoted to National
- Extraction failures on successfully-classified PDFs warrant investigation into extraction logic

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 55% (12/22 addressable)
- Total institutions: 28 (excluded: 6)
- Institutions with URL but no fees: needs investigation
