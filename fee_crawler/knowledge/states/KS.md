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
