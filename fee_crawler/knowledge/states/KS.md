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
