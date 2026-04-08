# OR Fee Schedule Knowledge


## Run #140 — 2026-04-07
Discovered: 21 | Extracted: 29 | Failed: 33

### New Patterns
- js_rendered PDFs often fail extraction despite successful classification
- PDF discovery success doesn't guarantee extraction success
- Discovery failures on product/program pages with fee disclaimers
- Credit unions with direct homepage fee links extract reliably
- HTML-rendered fee schedules extract fewer fees than PDF equivalents
- Navigation-required discovery increases success rate

### Site Notes
- First Community Federal Credit Union and Consolidated Federal Credit Union: classified as js_rendered but extraction returned no fees. Suggests dynamic PDF rendering may obscure fee table structure from extraction logic.
- 5 institutions with discovered/classified PDFs failed extraction (Rivermark, Marion And Polk Schools, People's Bank of Commerce, Pioneer Trust Bank, Consolidated Federal Credit Union). PDFs labeled as 'disclosure' or 'terms' often contain non-tabular fee information.
- Summit Bank, Bank of Eastern Oregon, Oregon Coast Bank: pages mention fees exist but don't link directly to fee schedules. Discovery logic interprets these as false leads.
- Oregon Community Federal Credit Union (32 fees), Central Willamette Federal Credit Union (34 fees), Embold Federal Credit Union (36 fees): all succeeded when fees linked directly from navigation.
- Columbia Bank (HTML, 3 fees) and Selco Community Federal Credit Union (HTML, 7 fees) versus Citizens Bank (PDF, 52 fees) and Unitus Community Federal Credit Union (PDF, 42 fees). HTML pages may show summary only.
- Mid Oregon Federal Credit Union: marked 'no website_url' — institutional data gap, not discovery failure. Verify source data completeness.
- Oregon Community Federal Credit Union and Embold Federal Credit Union: required navigation beyond homepage but discovery succeeded with detailed navigation notes. Suggests structured navigation discovery is viable.

### Promoted to National
- Review extraction patterns for JavaScript-rendered content; may need different parsing strategy than static PDFs
- Implement validation that PDF contains structured fee tables before attempting extraction; many 'fee disclosure' PDFs use narrative format
- Add secondary discovery pattern: pages containing 'fees subject to change' language should trigger follow-up search for linked disclosures
- Direct homepage/navigation links correlate with successful extraction; this is a reliable signal for credit union fee availability
- Prioritize PDF discovery over HTML for credit unions/banks; PDFs likely contain comprehensive fee tables
- Implement multi-step navigation discovery for credit unions; single-page assessment misses accessible fee schedules

## Run #152 — 2026-04-07
Discovered: 0 | Extracted: 30 | Failed: 32

### New Patterns
- PDF-based fee schedules consistently extract well across institutions
- JS-rendered pages show mixed results - some succeed, some fail completely on extraction
- Discover stage incorrectly classifies non-fee pages as potential fee sources
- Extract failures occur even after successful PDF classification
- Homepage/login-only websites cannot be processed effectively
- URL malformation causes processing failures before discovery

### Site Notes
- Oregon Community Federal Credit Union, Unitus Community Federal Credit Union, Citizens Bank, Central Willamette Federal Credit Union, and Embold Federal Credit Union all successfully extracted 1-48+ fees from PDF documents
- Columbia Bank (js_rendered) extracted 6 fees successfully, but Consolidated Federal Credit Union (js_rendered) failed extraction entirely despite successful classification
- Onpoint Community FCU (rates/rewards page), Rogue FCU (investment services), Oregon State FCU (About Us), and Bank of Eastern Oregon all failed discovery because they were misidentified as fee-relevant
- Rivermark Community FCU, First Community FCU, Marion and Polk Schools FCU, and People's Bank of Commerce all classified as PDF but extracted no fees - suggests PDF structure or content type issues beyond format recognition
- Evergreen Federal Bank presented only tutorial/login pages with no discoverable fee documents
- Willamette Valley Bank failed with net::ERR_NAME_NOT_RESOLVED due to malformed URL (https://https//WW)

### Promoted to National
- PDF fee schedules are most reliable extraction source for financial institutions; prioritize PDF discovery in workflow

## Run #161 — 2026-04-07
Discovered: 0 | Extracted: 29 | Failed: 33

### New Patterns
- JS-rendered pages classified correctly but extraction sometimes fails despite successful classification
- PDF documents show high extraction success rate when properly classified
- Discovery skip strategy works but masks document discovery failures
- Discover failures indicate fee schedules embedded in product pages rather than dedicated documents
- Website validation/accessibility issues prevent discovery
- High extraction success on certain PDF institutions but complete failure on others with same format

### Site Notes
- Columbia Bank (js_rendered) extracted 3 fees successfully; First Community Federal Credit Union (js_rendered) failed extraction despite correct classification. Suggests inconsistent fee table structure in rendered content.
- Oregon Community Federal Credit Union, Unitus Community Federal Credit Union, Central Willamette Federal Credit Union, and Embold Federal Credit Union all successfully extracted 33-39 fees from PDFs. However, Rivermark, Marion And Polk Schools, People's Bank of Commerce, and Pioneer Trust Bank all classified as PDF but extracted zero fees despite PDF format.
- Multiple institutions skipped discovery (Columbia Bank, Oregon Community FCU, Rivermark, Selco, First Community, Unitus, Marion And Polk, Citizens Bank, Oregon Pacific, People's Bank, Pioneer Trust, Consolidated, Central Willamette, Embold) yet extraction succeeded. This suggests pre-identified URLs are reliable but may also hide institutions that only publish fees in non-obvious locations.
- Multiple institutions show pattern: Onpoint (rates page), Rogue (investment services), Oregon State (product benefits page), Summit (business products), Bank of Eastern Oregon (main products page) - all rejected as not being fee schedules but likely contain fee data mixed with product information.
- Mid Oregon Federal Credit Union: no website_url; Willamette Valley Bank: DNS resolution failure (malformed URL https://https//); these represent data quality issues upstream, not discovery failures.
- Citizens Bank extracted 52 fees from PDF; People's Bank of Commerce extracted 0 from PDF. Both classified as PDF. Suggests fee table structure or OCR quality variance in PDF documents.

### Promoted to National
- PDF classification alone does not guarantee extractable fee data; PDF content quality/structure varies significantly
- Product detail pages should be re-examined with different extraction logic rather than rejected outright

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 61% (36/59 addressable)
- Total institutions: 62 (excluded: 3)
- Institutions with URL but no fees: needs investigation
