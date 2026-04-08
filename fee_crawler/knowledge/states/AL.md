# AL Fee Schedule Knowledge


## Run #81 — 2026-04-07
Discovered: 33 | Extracted: 63 | Failed: 120

### New Patterns
- JavaScript-rendered pages show inconsistent extraction results
- PDF discovery success correlates with direct navigation vs. resource/policy pages
- Classification success with extraction failure indicates document content mismatch
- Skipped discovery with successful downstream steps suggests pre-populated institution data
- Personal product pages (checking, savings) lack fee schedule links

### Site Notes
- Southern Energy FCU and Guardian FCU (js_rendered) extracted successfully, but Alabama FCU (js_rendered) failed extraction despite successful classification
- Bank Independent and Max FCU found direct fee schedule PDF links after navigation, while Bryant Bank, Oakworth Capital, and Troy Bank's resource/policy pages had no fee schedule links despite containing multiple service documents
- ServisFirst Bank, CB&S Bank, and Avadian FCU classified correctly but extracted no fees—suggests documents found (Funds Availability Policy, etc.) contain fee-adjacent content but not actual fee data
- 18 institutions skipped discovery but proceeded to classification/extraction successfully, indicating system had prior knowledge of fee document locations
- United Bank and Troy Bank checking pages returned no fee schedule links; indicates banks house fee schedules separately from product marketing pages

### Promoted to National
- js_rendered classification alone doesn't predict extraction success; content structure matters more than rendering method
- Fee schedules on resource/policy/disclosure hubs often absent; direct navigation paths more reliable for discovery
- Classify=ok does not guarantee fee extraction; need secondary validation that document contains structured fee tables
- Pre-cached institution URLs improve efficiency but mask discovery method validation; track which institutions rely on cache vs. live discovery
- Product pages are poor discovery sources; prioritize dedicated disclosure/legal/compliance sections

## Run #90 — 2026-04-07
Discovered: 3 | Extracted: 63 | Failed: 120

### New Patterns
- PDF-classified documents show higher extraction success rate than HTML or JS-rendered content
- JS-rendered pages with low fee counts may indicate incomplete extraction or stripped content
- Classification succeeding but extraction failing indicates document type mismatch or content stripping
- Empty/navigation pages systematically flagged in discover phase indicate homepage-first discovery limitation
- Skip=true entries suggest pre-filtered discovery (prior knowledge institutions publish online)

### Site Notes
- AL: 5 of 7 PDFs extracted successfully (71%), vs 2 of 3 HTML (67%) and 3 of 4 JS-rendered (75%). PDF format appears most reliable for fee schedule OCR/parsing.
- AL: Five Star (5 fees) and Guardian (19 fees) both js_rendered; significantly lower than PDF peers (25-51 fees). JavaScript rendering may lose fee table structure.
- AL: ServisFirst, CB&S, Max Federal, Alabama Federal classified correctly but extracted 0 fees. Suggests content is present but fees not detected by extraction logic.
- AL: Regions Bank, River Bank, Bryant Bank, Oakworth, Troy, SouthPoint, United Bank all discovered as empty/forms/navigation pages. Discovery agent starting from homepage rather than sitemap/search.
- AL: 13 institutions skipped discovery entirely; likely pre-matched against known publishers. This inflates discovered=3 metric and masks actual discovery capability.

### Promoted to National
- Prioritize PDF discovery and classification; investigate why HTML extraction fails even when classified correctly (e.g., ServisFirst, CB&S, Peoples Bank)
- Flag js_rendered extractions with <20 fees for manual review; consider JS rendering settings or post-rendering parsing improvements
- Audit extraction regex/NLP for fee keyword detection; these may be valid fee schedules with non-standard formatting
- Implement sitemap-first discovery and site:domain fee schedule searches before homepage crawl
- Separate pre-filtered vs. actively discovered counts in metrics; skipped institutions should not count toward discovery success rate

## Run #100 — 2026-04-07
Discovered: 3 | Extracted: 63 | Failed: 120

### New Patterns
- JS-rendered pages with fee schedules show inconsistent extraction success rates
- PDF-classified documents show high success except when fees are embedded in disclosure documents
- Discovery failures on pages mixing fee schedules with other disclosures
- HTML-classified pages with successful classification but failed extraction
- Skipped discovery stage correlates with higher overall success rate

### Site Notes
- Southern Energy Federal Credit Union (36 fees extracted), Alabama Federal Credit Union (extraction failed), America's First Federal Credit Union (discovery succeeded but extraction failed) - all js_rendered classified but different outcomes
- Bank Independent (51 fees), Redstone FCU (38 fees) succeeded; CB&S Bank and Avadian FCU extraction failed despite PDF classification - suggests fees may be in appendices or formatted unexpectedly
- Regions Bank (empty load), River Bank & Trust (forms-heavy), Oakworth Capital (policy center), Troy Bank (checking product page), SouthPoint (Resources/FAQs) - pages with navigation/links to fees but no direct fee content
- ServisFirst Bank and Peoples Bank of Alabama both HTML; ServisFirst failed extraction while Peoples succeeded (25 fees) - suggests HTML structure varies significantly
- Five Star Federal Credit Union: js_rendered with only 5 fees extracted - unusually low yield despite successful classification
- All institutions with skipped discovery (presumed already-identified URLs) had either successful extractions or classified as pdf/js_rendered; failed discoveries concentrated on initial URL assessments

### Promoted to National
- JS-rendered fee schedules require validation of extraction quality; classify-ok does not guarantee extractable fees
- PDF classification needs secondary check for fee table format/location before extraction attempt
- Discovery needs refinement for mixed-content pages; current approach misses pages requiring secondary navigation to reach fee schedules
- HTML pages may require institution-specific parsing; one-size-fits-all HTML extraction underperforms vs PDF/JS
- Low-yield results (under 10 fees) from js_rendered pages warrant manual review to assess completeness
- Maintain curated seed list of known fee schedule URLs; reduces discovery errors on secondary pages
