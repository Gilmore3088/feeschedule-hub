
## Pruned 2026-04-07

## Run #109 — 2026-04-07
## Run #113 — 2026-04-07
## Run #23 — 2026-04-06
## Run #24 — 2026-04-06
### New Patterns
### Site Notes
- 404 errors indicate institutional presence changes or wrong URL data
- Add validation step post-discovery to confirm document is machine-readable before advancing to extraction
- All 14 discovered institutions had pre-mapped URLs (discover=skipped), suggesting KS institutions either were pre-identified or follow standardized URL patterns. Armed Forces Bank and Peoples Bank were exceptions—only Armed Forces had discover=ok, indicating embedded fee content; Peoples Bank had discover=failed.
- Armed Forces Bank, National Association discovery failed on 404 page
- Armed Forces Bank, National Association: discover failed on 404 error - institution website may have moved or fee schedule page deleted
- Capitol Federal, Communityamerica FCU, Fidelity Bank, KS StateBank, Community National Bank & Trust, CoreFirst Bank & Trust all use PDF format with high extraction success
- Central National Bank and The Bennington State Bank both classified as js_rendered but extraction failed with no fees extracted
- Central National Bank and The Bennington State Bank both classified as js_rendered resulted in failed extractions with 'no fees extracted'
- Central National Bank classified as js_rendered but extraction failed (no fees extracted). May require enhanced rendering or DOM parsing beyond standard HTML extraction.
- Community National Bank & Trust (fee-related PDF found) and The Bennington State Bank (direct fee schedule link found) both discovered correctly but failed extraction
- Community National Bank & Trust and Central National Bank both classified successfully (pdf and js_rendered respectively) but extraction failed. Indicates document structure variability or non-standard fee table formatting within same format types.
- Community National Bank & Trust: PDF classified but extraction failed despite successful discovery - suggests extraction parser doesn't handle this institution's PDF layout
- Community National Bank & Trust: PDF classified correctly but extraction failed with 'no fees extracted' - suggests PDF parsing issue or unusual fee schedule format
- Communityamerica Federal Credit Union (rates page vs fee schedule), Empires Bank (help/contact only), Central National Bank (disclosure anchors only), Peoples Bank (no homepage links) - institutions don't surface fee schedules prominently
- CoreFirst Bank & Trust: Cloudflare blocking discovered during discovery phase - represents infrastructure barrier not content issue
- Disclosure pages containing multiple policy documents may lack dedicated fee schedule sections
- Disclosure pages vary in fee schedule inclusion; need enhanced content matching beyond document title matching
- Discover failures often indicate missing/hidden fee disclosure links
- Discover phase skipped for 13/14 successful institutions
- Discovery success does not guarantee extraction success
- Document common homepage navigation patterns for financial institutions where fee schedules are not directly linked
- Equity Bank extracted only 3 fees from HTML while others (Intrust, Emprise, Credit Union of America) extracted 27-43, suggesting HTML structure and fee table complexity varies significantly
- Fee extraction failures occur even with successful classification
- Flag institutions with security blocks or 404s for manual review or alternative contact methods rather than repeated automated attempts
- HTML-based fee schedules may have formatting or table structures that underperform compared to PDF equivalents—investigate table parsing logic
- HTML-based fee schedules show variable extraction success (3-43 fees)
- High discover skip rate (15/17 institutions) with only 2 discover failures suggests KS run used pre-identified institution URLs, not organic discovery
- Homepage structure failures block discovery for otherwise active institutions
- Implement URL validation before discovery attempt; maintain institution URL currency list
- JS-rendered fee schedules may require additional processing beyond current extraction logic—investigate rendering depth or DOM structure differences
- JS-rendered fee schedules require specialized extraction handling; current approach extracts structure but not populated content
- JS-rendered pages consistently fail at extraction stage
- JS-rendered pages consistently fail extraction despite successful classification
- JavaScript-rendered pages consistently fail at extraction stage even after successful discovery and classification
- JavaScript-rendered pages have 0% extraction success rate in this run
- JavaScript-rendered pages present extraction challenges
- KS banks with PDF fee schedules (Fidelity Bank 49 fees, Landmark National Bank 34, Capitol Federal 33) dramatically outperform HTML and js_rendered counterparts
- KS institutions: PDFs averaged 27-50 fees extracted (Capitol Federal: 33, Fidelity: 50, Community National Bank: failed), while HTML averaged 3-44 fees (Equity: 3, Security: 7, Intrust: 27). PDF format appears more structured for fee table extraction.
- KS: Capitol Federal Savings Bank, Fidelity Bank, Credit Union of America, Landmark National Bank, The First National Bank of Hutchinson all skipped discovery but extracted successfully. These likely have known direct URLs or standard document naming conventions.
- KS: Community National Bank & Trust is outlier - discovered PDF fee document but extract failed. All other PDFs extracted successfully.
- KS: CoreFirst Bank & Trust blocked by security service. Armed Forces Bank returned 404. These institutions cannot be accessed via standard web crawling.
- KS: Mazuma Federal Credit Union disclosures page found but no dedicated fee schedule within it. KS StateBank's 'Deposit Account Disclosure' successfully contained fee info - opposite outcome with similar document naming.
- KS: The Bennington State Bank, nbkc bank, Bank of Labor, Farmers Bank & Trust all use js_rendered classification but extract=failed (no fees extracted). Direct fee schedule links were found but content extraction failed.
- Maintain registry of institutions with predictable fee schedule URLs to accelerate discovery phase for repeat collections
- Many institutions bury fee schedules; discovery may need to check /disclosures, /rates, /legal URLs as fallbacks
- Mazuma Federal Credit Union: discover succeeded (found Business Account T&Cs PDF) but extract failed - PDF may contain fees in narrative format rather than structured tables
- PDF classification shows highest extraction success rate
- PDF extraction reliability is significantly higher than JavaScript-rendered content; prioritize PDF identification during discovery
- PDF format reliability for fee schedule extraction should be prioritized in multi-format environments; consider targeted parsing logic for js_rendered pages to reduce extraction failures.
- PDF-based fee schedules are more reliably extractable; prioritize PDF discovery and classification
- PDF-based fee schedules consistently extract well (32-50 fees per institution)
- PDF-based fee schedules extract more fees than HTML equivalents
- PDF-classified documents show higher extraction success (11/14 successful) compared to js_rendered (0/4 successful)
- PDFs extracted 32-49 fees (Capitol Federal, Communityamerica, Fidelity Bank, Landmark) but Equity Bank HTML only extracted 3 fees
- PDFs with fee content in prose/narrative format fail extraction
- Peoples Bank and Trust Company: 'No links found on homepage' suggests navigation structure differs from expected pattern
- Peoples Bank and Trust Company: discover failed - 'No links found on homepage' suggests fee schedule not linked from main page or requires navigation depth
- Security/access barriers prevent discovery at source
- Significant extraction variance across similar document types
- Skipped discovery (no active search attempted) paired with successful extraction indicates pre-identified/cached document locations
- Some PDFs pass classification but fail extraction due to non-standard formatting; may need institution-specific parsing rules
- The Bennington State Bank, nbkc bank, Bank of Labor, Farmers Bank & Trust all classified as js_rendered but yielded zero fees. Suggests extraction logic may not properly handle dynamically-loaded fee tables.
- WAF/security services can block automated fee schedule discovery entirely
- js_rendered fee schedules may require enhanced parsing or alternative extraction methods - consider whether content is dynamically loaded after page render or if fee tables use non-standard markup
Discovered: 17 | Extracted: 88 | Failed: 163
Discovered: 22 | Extracted: 90 | Failed: 161
Discovered: 61 | Extracted: 79 | Failed: 172
Discovered: 8 | Extracted: 84 | Failed: 167

