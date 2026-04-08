# MD Fee Schedule Knowledge


## Run #117 — 2026-04-07
Discovered: 19 | Extracted: 42 | Failed: 49

### New Patterns
- PDF documents discovered but extraction fails despite successful classification - suggests PDF parsing issues with certain formatting or structures
- JavaScript-rendered pages with fee schedule content visible but extraction yields zero results
- Discovery success does not guarantee extraction success - found fee schedule pages that contain no extractable fees
- Credit unions with minimal fees (1-4 extracted) may indicate incomplete extraction or legitimate sparse fee schedules
- EagleBank and First Financial of Maryland - discovery failed with 'no links found' or incomplete page parsing

### Site Notes
- Capital Bank, Andrews Federal Credit Union, Middletown Valley Bank - all PDFs classified correctly but zero fees extracted
- Shore United Bank, State Employees CU of Maryland, Presidential Bank FSB - js_rendered pages show content but fail extraction
- Capital Bank (Treasury Management document), Middletown Valley Bank (PDF link found), CFG Bank - discovery confirmed presence but extraction failed
- Tower Federal (1 fee), First United Bank & Trust (1 fee), Rosedale Bank (1 fee) - all validated but suspiciously low counts
- Both appear to have fees accessible but discovery process missed them entirely

### Promoted to National
- PDF extraction pipeline may have systematic failures; recommend testing PDF parsing logic against these institutions' documents
- JavaScript rendering may not be waiting for all dynamic content to load before extraction; investigate rendering timeout or content selector issues
- Need validation step between discovery and extraction to identify false positives (documents about fees vs. actual fee tables)
- Flag institutions with single-digit fee extraction for manual review to distinguish incomplete extraction from genuinely minimal fee schedules
- Homepage-based discovery may be insufficient; recommend secondary discovery methods (site search, footer links, direct URL patterns)

## Run #127 — 2026-04-07
Discovered: 2 | Extracted: 45 | Failed: 46

### New Patterns
- PDF-based fee schedules show inconsistent extraction success rates
- JS-rendered pages consistently fail fee extraction despite successful classification
- HTML pages show high variability in extraction success
- Discovery failures indicate non-standard navigation or fee schedule placement
- Skipped discoveries (19 of 23 institutions) suggest pre-existing institutional knowledge

### Site Notes
- Tower Federal (PDF, 1 fee), Lafayette Federal (PDF, 39 fees), and Educational Systems (PDF, 4 fees) succeeded, but Andrews Federal, Capital Bank, First United, and Middletown Valley (all PDFs) failed extraction despite successful classification. PDF layout/structure variance may require adaptive extraction logic.
- Shore United, State Employees CU, Rosedale Bank, and Presidential Bank all classified as js_rendered with 100% extraction failure rate (except Rosedale's 1 fee). Dynamic content rendering may obscure fee table selectors.
- Forbright (22 fees) and CFG Bank (27 fees) succeeded, but Aberdeen Proving Ground (57 fees extracted) and Nasa Federal failed despite HTML classification. Aberdeen's high success suggests HTML extraction CAN work; failure pattern indicates missing or inconsistent CSS selectors across institutions.
- EagleBank discovery failed (checking account features page instead of fee schedule), First Financial failed (no links on homepage). These institutions may bury fee schedules in account documentation or require account selection flow.
- Most MD institutions were skipped in discovery phase, indicating prior identification. Only 2 discovered suggests mature institutional dataset; low overall discovery rate is intentional.

### Promoted to National
- PDF fee schedule extraction needs format-specific handling; single extraction approach insufficient
- JS-rendered fee schedules require specialized DOM element targeting or post-render content validation
- HTML-based extraction success correlates with consistent semantic markup; institution-specific selector mapping may be required
- Implement fallback discovery methods: site search, direct URL patterns (/fees, /pricing), document sitemap crawling

## Run #133 — 2026-04-07
Discovered: 1 | Extracted: 45 | Failed: 46

### New Patterns
- PDF-based fee schedules show mixed extraction reliability - some PDFs yield complete data (57, 39, 24 fees) while others classified as PDF fail extraction entirely
- JS-rendered pages consistently fail extraction despite successful classification
- HTML pages show binary outcomes: either substantial extraction (57+ fees) or complete failure with no fees extracted
- Discovery failures due to missing links on homepage suggest fee schedules are not prominently linked from main navigation

### Site Notes
- Tower Federal Credit Union (1 fee), First United Bank & Trust (1 fee), and Lafayette Federal Credit Union (39 fees) all PDF format but wildly different extraction success rates suggest PDF structure/quality variance
- Shore United Bank, State Employees CU, Rosedale Bank, Presidential Bank all classified as js_rendered; Rosedale Bank succeeded (1 fee) but Shore/State/Presidential failed - suggests rendering inconsistency or content not appearing in rendered output
- Aberdeen Proving Ground FCU (html, 57 fees) vs. Nasa Federal, CFG Bank (html, 0 fees) - suggests some HTML pages have properly structured fee tables while others have unstructured content
- EagleBank and First Financial of Maryland both failed discovery - checking accounts overview pages lack direct fee schedule links, requiring deeper site crawling or alternative discovery methods

### Promoted to National
- Credit unions overall higher success rate (8 of 12 attempted) vs. traditional banks (3 of 5 attempted) - credit unions more likely to publish structured fee schedules online or in standardized formats

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 65% (54/83 addressable)
- Total institutions: 91 (excluded: 8)
- Institutions with URL but no fees: needs investigation
