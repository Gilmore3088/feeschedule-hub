# NC Fee Schedule Knowledge


## Run #98 — 2026-04-07
Discovered: 20 | Extracted: 39 | Failed: 57

### New Patterns
- js_rendered pages frequently fail extraction despite successful classification
- PDF classification shows highest extraction success rate
- Direct homepage links to fee schedules enable discovery but don't guarantee extraction success
- HTML-classified pages show mixed but decent extraction results

### Site Notes
- State Employees' FCU, Allegacy FCU, Dogwood State Bank, and Self-Help FCU all classified as js_rendered but extraction failed. Suggests rendering may not be capturing fee table structure correctly.
- Bank of America, Truist, First Bank, HomeTrust all classified as PDF with consistent extraction (except HomeTrust failed). PDFs appear more structurally reliable.
- Dogwood State Bank and Self-Help FCU both had direct fee schedule links discovered on homepage, yet extraction failed for at least one instance. Discovery success ≠ extraction success.
- Truliant (html, 14 fees extracted) and Peoples Bank (html, 54 fees extracted) performed better than js_rendered equivalents.
- Self-Help FCU appears twice with different discovery methods and outcomes - one successful extraction (pdf), one failed (js_rendered). Same institution, different document formats yield opposite results.

### Promoted to National
- js_rendered content type requires different extraction logic than PDF or HTML - current approach may be inadequate for dynamically loaded fee tables
- PDF-based fee schedules are more reliably machine-readable than js_rendered or HTML alternatives
- Need separate validation that discovered documents are actually parseable, not just discoverable
- HTML format deserves preferential treatment over js_rendered when both available
- Institutions publishing fee schedules in multiple formats (PDF + js_rendered) create inconsistent extraction results - need format-aware prioritization strategy

## Run #101 — 2026-04-07
Discovered: 2 | Extracted: 40 | Failed: 56

### New Patterns
- JS-rendered pages show inconsistent extraction success - some yield high counts (Civic Federal Credit Union: 53, First-Citizens Bank: 40) while others fail completely (State Employees' FCU, Allegacy FCU, Dogwood State Bank, Self-Help FCU second attempt). Suggests extraction logic may not be handling dynamic content rendering consistently.
- PDF-based fee schedules show mixed reliability: some extract robustly (First Bank: 44, Self-Help FCU: 41) while others fail (Live Oak Banking, HomeTrust Bank). High variance suggests PDF structure/formatting significantly impacts extraction success.
- Multiple credit unions (State Employees' FCU, Allegacy FCU, Dogwood State Bank, Self-Help FCU on second run) classified successfully but extracted zero fees despite being classified. Indicates classify stage is not validating that content actually contains fee data before extraction attempt.

### Site Notes
- The Fidelity Bank required active navigation to discover fee schedule link ('Direct fee schedule link found after navigation') - only 2 discoveries in 18 attempts. Indicates discover stage may need enhanced navigation/link-following capability.
- HTML-based schedules (Truliant Federal Credit Union, Peoples Bank, The Fidelity Bank) show reliable extraction (13-54 fees) when discovered. HTML appears most extractable format.

### Promoted to National
- JS-rendered fee schedule pages require specialized handling - current approach has ~50% failure rate on this content type. Recommend audit of js_rendered extraction pipeline.
- PDF extraction needs content-aware parsing - generic PDF extraction insufficient. Consider OCR fallback for image-heavy PDFs.
- Add validation check post-classification to confirm fee schedule content is present before extraction routing.

## Run #104 — 2026-04-07
Discovered: 1 | Extracted: 40 | Failed: 56

### New Patterns
- JS-rendered pages show higher extraction failure rate than PDFs and HTML
- PDF classification correlates with successful extraction when content is present
- Credit unions show inconsistent fee disclosure patterns across same platform type
- Discover failures point to non-standardized fee schedule locations within banking sites
- Large extraction counts (40+) from single institutions indicate comprehensive fee schedules

### Site Notes
- State Employees' FCU, Allegacy FCU, and Dogwood State Bank all classify as js_rendered but fail extraction with 'no fees extracted', suggesting dynamic content loading may not be fully captured or fee data structured differently in rendered DOM
- Bank of America, Truist, First Bank, HomeTrust, and Self-Help all classify as PDF with mixed results—suggests PDF strategy works well for institutions that actually publish fees in PDF format, but HomeTrust/Live Oak PDFs contain no extractable fee data despite proper classification
- Multiple credit unions (State Employees', Allegacy, Dogwood, Coastal) fail extraction despite successful classification, while Civic FCU and Truliant succeed—indicates fee schedule presence/structure varies significantly within credit union sector rather than platform-driven
- Southern Bank and Trust and First Carolina Bank both fail at discover stage with messages indicating fees buried in product pages rather than centralized disclosures—suggests these institutions require targeted product-level navigation rather than standard disclosure page patterns
- First Bank (44), The Fidelity Bank (42), Civic FCU (38), Peoples Bank (54), and Self-Help FCU (44) all extract substantial fee volumes—these appear to be well-structured, complete disclosures; worth examining for standardized format patterns

### Promoted to National
- JS-rendered content requires fallback to alternative discovery or classification methods when extraction fails—dynamic rendering alone does not guarantee fee data extractability
