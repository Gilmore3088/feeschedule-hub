# GA Fee Schedule Knowledge


## Run #55 — 2026-04-07
Discovered: 48 | Extracted: 70 | Failed: 134

### New Patterns
- JS-rendered pages with fee schedule content often fail extraction despite successful discovery and classification
- PDF discovery success does not guarantee extraction success
- Skipped discover steps with successful subsequent classification/extraction indicate pre-existing knowledge or direct URLs
- Validate-successful extractions with unusually low counts warrant manual review for completeness
- Account comparison/application form pages are commonly misidentified as potential fee sources

### Site Notes
- Atlanta Postal Federal Credit Union and Lge Community Federal Credit Union both classified as js_rendered with discoverable fee content, but extraction yielded zero fees. Suggests JS-rendered content may require additional parsing logic or dynamic content handling.
- Ameris Bank, United Bank, Queensborough National Bank, and Thomasville National Bank all successfully discovered and classified as PDF but extraction failed. Despite correct document identification, fee parsing logic appears ineffective on certain PDF structures.
- Delta Community FCU, RBC Bank, Lge Community FCU, Pinnacle Bank, BankSouth, PeoplesSouth Bank, and Peach State FCU all skipped discovery but completed classification/extraction. These institutions likely have stable, known URLs in the system.
- Morris Bank yielded only 3 extracted fees despite successful classification and validation. Low extraction count suggests either limited fee schedule or selective parsing capturing minimal data.
- Georgia Banking Company (account comparison), Associated Credit Union (application forms), and Colony Bank (resources/educational) all failed discovery with explanations indicating false-positive patterns in discovery logic.

### Promoted to National
- JS-rendered fee schedules need specialized extraction pipeline beyond standard HTML/PDF handlers
- PDF extraction failures warrant document structure analysis—may indicate encoding issues, table formatting variations, or OCR requirements
- Maintain institutional URL registry to optimize workflow for repeat institutions
- Refine discovery heuristics to exclude account comparison, application form, and educational content pages

## Run #62 — 2026-04-07
Discovered: 5 | Extracted: 74 | Failed: 130

### New Patterns
- PDF and HTML documents consistently extract fees; js_rendered pages frequently fail extraction despite successful classification
- High discovery failure rate when landing on product comparison pages, account pages, or resource centers rather than dedicated fee schedule documents
- Classified documents that fail extraction suggest documents exist but contain unstructured or image-based fee data
- Some credit unions may host fee schedules on member portals or behind login walls rather than public homepages
- Low extraction counts from some banks (United Bank: 1 fee) despite successful classification and validation

### Site Notes
- Atlanta Postal Federal Credit Union, Lge Community Federal Credit Union, and Thomasville National Bank all classified as js_rendered but yielded zero fees on extraction
- Metro City Bank (checking account product page), Georgia Banking Company (account comparison page), Colony Bank (resources/news page), and Associated Credit Union (forms page) all failed discovery
- Ameris Bank and Queensborough National Bank classified as PDF/HTML but extracted zero fees; likely scanned/image PDFs or unstructured layouts
- Robins Financial Federal Credit Union discovery failed with 'No links found on homepage' despite being a functional institution
- United Bank classified as PDF but only 1 fee extracted—document likely exists but is minimal or institution has few published fees

### Promoted to National
- JavaScript-rendered fee schedules may require additional rendering time or post-render parsing; current extraction logic may not handle dynamic content adequately
- Navigation discovery needs refinement to distinguish between product marketing pages and actual fee schedule documents; consider targeting dedicated support/resources sections or explicit fee schedule links
- OCR or image-to-text conversion may be needed for subset of institutions; validate whether classified documents contain machine-readable vs. image-only content
- Credit unions more likely than banks to restrict fee schedule visibility; consider separate discovery workflow for member-only content
- Consider flagging institutions with suspiciously low fee counts for manual review; may indicate incomplete extraction or genuinely minimal fee structures

## Run #73 — 2026-04-07
Discovered: 2 | Extracted: 72 | Failed: 132

### New Patterns
- PDF-classified documents show mixed extraction results despite successful classification
- JS-rendered pages have high extraction failure rate
- Homepage navigation/resource pages trigger discover failures
- Minimal fee extraction success despite document discovery
- Low-yield extractions from validated PDFs warrant content review

### Site Notes
- Ameris Bank, United Bank, Queensborough National Bank classified as PDF but extraction failed. Suggests PDF classification alone doesn't guarantee extractable fee content.
- Atlanta Postal Federal CU, Lge Community Federal CU, Thomasville National Bank all classified as js_rendered but extraction failed. Only 0/4 js_rendered documents successfully extracted fees.
- Metro City Bank, Colony Bank, Georgia Banking Company, Associated Credit Union all failed discovery on homepage with navigation/comparison pages. Suggests banking homepages increasingly link to account comparison tools rather than direct fee schedule URIs.
- Only 2 discoveries succeeded but 72 total fees extracted from skipped/already-known URLs. Indicates most GA institutions have documented fee schedules at known/cached locations.
- Morris Bank PDF extraction yielded only 3 fees despite successful classification and validation. Potential issue: partial documents, fee schedule fragments, or institution-specific formatting.

### Promoted to National
- Implement post-classification validation step for PDFs to detect empty/image-only documents before extraction attempt
- JS-rendered fee schedules may require different extraction pipeline; consider JavaScript content timing issues or dynamic table rendering failures
- Update discovery to identify account comparison/selector pages and extract fee-bearing links from within those tools
- Current discover phase may be obsolete for mature banking markets; consider shifting to incremental URL refresh vs. full discovery
