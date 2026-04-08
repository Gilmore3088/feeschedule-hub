# KS Fee Schedule Knowledge


## Run #23 — 2026-04-06
Discovered: 61 | Extracted: 79 | Failed: 172

### New Patterns
- JavaScript-rendered pages consistently fail at extraction stage even after successful discovery and classification
- Skipped discovery (no active search attempted) paired with successful extraction indicates pre-identified/cached document locations
- PDF-classified documents show higher extraction success (11/14 successful) compared to js_rendered (0/4 successful)
- Security/access barriers prevent discovery at source
- Disclosure pages containing multiple policy documents may lack dedicated fee schedule sections

### Site Notes
- KS: The Bennington State Bank, nbkc bank, Bank of Labor, Farmers Bank & Trust all use js_rendered classification but extract=failed (no fees extracted). Direct fee schedule links were found but content extraction failed.
- KS: Capitol Federal Savings Bank, Fidelity Bank, Credit Union of America, Landmark National Bank, The First National Bank of Hutchinson all skipped discovery but extracted successfully. These likely have known direct URLs or standard document naming conventions.
- KS: Community National Bank & Trust is outlier - discovered PDF fee document but extract failed. All other PDFs extracted successfully.
- KS: CoreFirst Bank & Trust blocked by security service. Armed Forces Bank returned 404. These institutions cannot be accessed via standard web crawling.
- KS: Mazuma Federal Credit Union disclosures page found but no dedicated fee schedule within it. KS StateBank's 'Deposit Account Disclosure' successfully contained fee info - opposite outcome with similar document naming.

### Promoted to National
- js_rendered fee schedules may require enhanced parsing or alternative extraction methods - consider whether content is dynamically loaded after page render or if fee tables use non-standard markup
- Maintain registry of institutions with predictable fee schedule URLs to accelerate discovery phase for repeat collections
- PDF extraction reliability is significantly higher than JavaScript-rendered content; prioritize PDF identification during discovery
- Flag institutions with security blocks or 404s for manual review or alternative contact methods rather than repeated automated attempts
- Disclosure pages vary in fee schedule inclusion; need enhanced content matching beyond document title matching

## Run #24 — 2026-04-06
Discovered: 8 | Extracted: 84 | Failed: 167

### New Patterns
- JS-rendered pages consistently fail at extraction stage
- PDF classification shows highest extraction success rate
- Discover failures often indicate missing/hidden fee disclosure links
- PDFs with fee content in prose/narrative format fail extraction
- Community National Bank & Trust: PDF classified but extraction failed despite successful discovery - suggests extraction parser doesn't handle this institution's PDF layout
- WAF/security services can block automated fee schedule discovery entirely

### Site Notes
- The Bennington State Bank, nbkc bank, Bank of Labor, Farmers Bank & Trust all classified as js_rendered but yielded zero fees. Suggests extraction logic may not properly handle dynamically-loaded fee tables.
- KS banks with PDF fee schedules (Fidelity Bank 49 fees, Landmark National Bank 34, Capitol Federal 33) dramatically outperform HTML and js_rendered counterparts
- Communityamerica Federal Credit Union (rates page vs fee schedule), Empires Bank (help/contact only), Central National Bank (disclosure anchors only), Peoples Bank (no homepage links) - institutions don't surface fee schedules prominently
- Mazuma Federal Credit Union: discover succeeded (found Business Account T&Cs PDF) but extract failed - PDF may contain fees in narrative format rather than structured tables
- CoreFirst Bank & Trust: Cloudflare blocking discovered during discovery phase - represents infrastructure barrier not content issue

### Promoted to National
- JS-rendered fee schedules require specialized extraction handling; current approach extracts structure but not populated content
- PDF-based fee schedules are more reliably extractable; prioritize PDF discovery and classification
- Many institutions bury fee schedules; discovery may need to check /disclosures, /rates, /legal URLs as fallbacks
- Some PDFs pass classification but fail extraction due to non-standard formatting; may need institution-specific parsing rules

## Run #135 — 2026-04-07
Discovered: 3 | Extracted: 95 | Failed: 156

### New Patterns
- PDF documents consistently yield higher fee counts than HTML equivalents
- JavaScript-rendered content extraction failure correlates with complex dynamic fee displays
- PDF classification without successful extraction indicates extraction logic gaps
- Homepage link discovery failures are rare but recoverable
- High extraction variance within same format class indicates content structuring differences

### Site Notes
- Fidelity Bank (49 fees from PDF), Communityamerica FCU (43 from PDF), Landmark National Bank (35 from PDF) vs. Equity Bank (3 fees from HTML), Armed Forces Bank (8 from HTML). PDF format may preserve table structures better for fee schedule extraction.
- Central National Bank classified as js_rendered but extracted zero fees, suggesting dynamic fee schedule layouts are not being captured by current extraction logic
- Community National Bank & Trust: classified as PDF but extraction failed with 'no fees extracted' — suggests valid PDF detected but fee table parsing unsuccessful
- Peoples Bank and Trust Company: discover failed ('No links found on homepage') — institution likely publishes fees but discovery method missed navigation paths
- HTML banks range from 3 fees (Equity) to 42 fees (Credit Union of America) — suggests some banks present fees in tabular layouts while others use prose or scattered formats

### Promoted to National
- Prioritize PDF discovery and extraction pipelines; HTML parsing may require enhanced table/structure detection for fee schedules
- JS-rendered fee schedule pages need specialized DOM parsing; current extraction may timeout or miss dynamically-loaded fee tables
- PDF structure varies significantly; implement fallback OCR or template-based extraction for PDF documents that pass classification but fail extraction
- When homepage link extraction fails, implement secondary discovery: search for 'fees', 'rates', 'disclosures' in site structure or rely on direct URL patterns
- HTML fee schedules benefit from multi-strategy extraction (tables, definition lists, paragraph patterns) rather than single parsing approach

## Run #147 — 2026-04-07
Discovered: 6 | Extracted: 98 | Failed: 153

### New Patterns
- PDF-based fee schedules extract consistently well (33-50 fees), while HTML varies widely (3-44 fees)
- JavaScript-rendered content (js_rendered classification) appears problematic for fee extraction
- Some institutions publish fee schedules but extraction yields zero fees despite successful classification
- Discover phase consistently skipped across all successful runs suggests pre-existing URL knowledge
- Homepage link-based discovery fails for some institutions

### Site Notes
- KS institutions using PDFs (Capitol Federal, Fidelity Bank, Community National Bank & Trust, CoreFirst) show better extraction rates than HTML counterparts
- Central National Bank classified as js_rendered failed extraction completely despite successful classification
- Community National Bank & Trust (PDF) and Central National Bank (js_rendered) both classified successfully but extracted no fees—suggests fee data may be structured differently or embedded in non-standard formats
- All 6 discovered institutions in KS appear to have had URLs pre-populated, indicating discover phase may not be critical for well-known regional banks
- Peoples Bank and Trust Company discovery failed with 'No links found on homepage'—suggests some banks may not link to fee schedules from homepage or use navigation structures that resist crawling

### Promoted to National
- None
