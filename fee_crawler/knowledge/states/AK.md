# AK Fee Schedule Knowledge


## Run #12 — 2026-04-06
Discovered: 0 | Extracted: 8 | Failed: 6

### New Patterns
- PDF-classified documents show mixed extraction success; some PDFs fail to extract fees despite successful classification
- JavaScript-rendered content shows extraction variability
- Discovery failures clustered around wrong page type classification
- High extraction success on HTML-classified documents
- Minimal fee extraction from small documents

### Site Notes
- First National Bank Alaska and Tongass Federal Credit Union: PDFs classified correctly but yielded zero fees. Suggests PDF structure variance or fee tables requiring specialized parsing logic.
- Mac Federal Credit Union (js_rendered) failed extraction; Alaska Dist Engineers Federal Credit Union (js_rendered) succeeded with 20 fees. Both classified as js_rendered but different outcomes.
- First Bank (404 error page), Mt. McKinley Bank (account features page), and Denali State Bank (About Us page) all failed discovery—wrong landing pages were scraped rather than fee schedule pages.
- Credit Union 1, Matanuska Valley FCU, True North FCU, and Northern Skies FCU all succeeded with HTML classification (40-56 fees each).
- Spirit of Alaska Federal Credit Union extracted only 6 fees despite successful classification and validation. Suggests very limited fee disclosure or sparse formatting.

### Promoted to National
- PDF classification success does not guarantee extractable fee content. Implement post-classification validation to detect fee-bearing vs. non-fee PDFs before extraction.
- JS-rendered pages need content inspection post-rendering; classification alone insufficient. Rendering quality or timing may affect fee table accessibility.
- Implement pre-discovery validation: check for 404 status and confirm page content type before attempting discovery. About Us and account features pages are common false positives.
- HTML documents appear most reliable for fee extraction. Prioritize HTML format detection and scraping strategies.
- Low fee counts may indicate institutions with minimal published fee structures; validate against known fee-bearing account types to confirm data completeness.

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 91% (10/11 addressable)
- Total institutions: 14 (excluded: 3)
- Institutions with URL but no fees: needs investigation
