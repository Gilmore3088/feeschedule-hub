# OH Fee Schedule Knowledge


## Run #79 — 2026-04-07
Discovered: 78 | Extracted: 130 | Failed: 228

### New Patterns
- PDF documents classified as containing fees often fail extraction due to formatting or structural issues
- JavaScript-rendered pages show mixed extraction results despite successful classification
- Discovery failures with actionable error messages indicate document exists but requires specific navigation paths
- Homepage failures (404s, HTTP protocol errors, privacy page redirects) indicate institutions don't publish fees at standard entry points
- Skipped discover with successful extraction suggests fee documents exist at predictable paths without requiring discovery
- Low extraction counts (1-9 fees) from discovered documents may indicate incomplete parsing of multi-page or table-based disclosures

### Site Notes
- NATIONAL COOPERATIVE BANK, N.A. and Seven Seventeen Federal Credit Union: discovered correct PDF documents but extraction yielded zero fees, suggesting PDF parsing limitations with certain disclosure formats
- Third Federal Savings and Loan Association of Cleveland, CFBank, and Superior Credit Union all classified as js_rendered but failed extraction, while Kemba Financial (js_rendered) succeeded with minimal data (1 fee)
- The Farmers National Bank of Canfield ('Support pages...'), Civista Bank ('individual checking account detail pages'), Union Savings Bank ('navigate to...') - these suggest fee schedules exist but require multi-step navigation not captured by initial discover phase
- Fifth Third Bank (404 error page), The Huntington National Bank (privacy policy redirect), KeyBank (HTTP2 protocol error) - these represent infrastructural or intentional barriers to fee discovery
- U.S. Bank, Peoples Bank, Wright-Patt, GE Federal Credit Union, First Federal Lakewood - all skipped discovery but extracted fees successfully, indicating standardized URL patterns or document naming conventions
- Kemba Financial (1 fee), The Middlefield Banking Company (9 fees), Waterford Bank (8 fees) - documents were found and classified but yielded minimal structured data

### Promoted to National
- PDF extraction reliability is inconsistent; may need fallback to OCR or manual review for disclosure PDFs that parse but yield no data
- JS-rendered content extraction unreliable; consider whether dynamic loading is preventing fee table visibility or if extraction logic needs refinement for rendered DOM
- Two-stage discovery approach needed: initial link discovery followed by product-specific page navigation for institutions with segmented account documentation
- Some major institutions deliberately obfuscate fee schedules; may require contacting institution directly or checking third-party aggregators
- Build institution-specific URL templates for common deposit disclosure document paths (e.g., /documents/fee-schedule, /disclosures/deposits)
- Extraction accuracy issue: verify whether documents contain fewer fees than expected or parsing logic misses multi-column/multi-section fee tables

## Run #99 — 2026-04-07
Discovered: 7 | Extracted: 130 | Failed: 228

### New Patterns
- PDF-based fee schedules extract reliably; JS-rendered pages consistently fail extraction even when classified successfully
- Direct PDF links on feature/product pages are easier discovery targets than general homepage navigation
- Homepage load failures and protocol errors indicate infrastructure/hosting issues beyond crawl logic
- Skipped discoveries with subsequent successful PDF extraction indicate that preset discovery can be bypassed with direct URL construction

### Site Notes
- OH institutions: 100% success with PDF format (Peoples Bank 41 fees, Wright-Patt 21, GE FCU 22, Seven Seventeen 66), 0% success with js_rendered (Third Federal, Kemba, CFBank, Superior all failed extraction)
- The Huntington National Bank: 'See all features & fee information' link directly resolved to PDF with 14 fees; contrasts with failed discovery on resources/login pages
- KeyBank failed with net::ERR_HTTP2_PROTOCOL_ERROR; suggests server-side HTTP/2 misconfiguration rather than content issue
- Peoples Bank, Wright-Patt, GE FCU, Seven Seventeen all skipped but yielded PDFs; suggests institutional URL patterns are predictable
- Third Federal and Kemba both classify as js_rendered but extract zero fees; extraction logic may be mishandling JS-heavy page structures

### Promoted to National
- JS-rendered fee pages require different extraction logic than currently deployed; consider deprioritizing or flagging js_rendered classifications for manual review
- Target feature/benefits pages and product landing pages in discovery phase; avoid routing through general site navigation
- Retry logic or user-agent variation may help; document protocol-level failures separately from content-based failures
- Build institution-specific URL pattern dictionary to bypass broken discovery; prioritize known fee schedule URL conventions
- JS-rendered pages with embedded fee tables may require dedicated DOM parsing; standard extraction failing on dynamic content

## Run #121 — 2026-04-07
Discovered: 5 | Extracted: 137 | Failed: 221

### New Patterns
- PDF documents consistently extract successfully across institutions; HTML pages show mixed results with some yielding no fees despite classification success
- JavaScript-rendered pages show variable extraction success (some 0 fees, some successful). Rendering quality or content structure inconsistency is a factor.
- Several discover failures were misidentified page content (rates pages, contact pages, forms pages) rather than true unavailability
- JPMorgan Chase Bank classified successfully as HTML but extracted zero fees despite being a major institution certain to have published schedules
- Protocol-level connection failures during discovery may indicate website infrastructure issues that resolve on retry
- Successful extractions show wide variance (2-67 fees per institution) with no correlation to institution type; suggests fee schedule comprehensiveness varies significantly

### Site Notes
- Third Federal Savings and Loan Association of Cleveland and CFBank classified as js_rendered but failed extraction, while Kemba Financial succeeded with js_rendered
- Fifth Third Bank, The Farmers National Bank of Canfield, Civista Bank, Union Savings Bank, and LCNB National Bank all had pages that existed but weren't fee schedules
- JPMorgan Chase Bank, National Association: likely has fee schedule at different URL or behind authentication
- KeyBank National Association experienced HTTP/2 protocol error on discovery; technical infrastructure issue rather than content unavailability
- Seven Seventeen Federal Credit Union extracted 67 fees (highest in run); Third Federal and NATIONAL COOPERATIVE BANK both extracted 0 despite PDF classification

### Promoted to National
- PDF-based fee schedules are more reliable extraction targets than HTML pages. Prioritize PDF discovery in initial screening.
- JavaScript-rendered pages require validation that content actually loaded before extraction; classification alone is insufficient.
- Improve discovery filtering to distinguish between financial institution pages and fee schedule pages; current keyword matching produces false positives on related documents.
- Large national banks may require different discovery paths than regional institutions; consider institution-specific URL patterns for major chains.
- Implement retry logic for protocol errors in discover phase; these are often transient.

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 52% (157/303 addressable)
- Total institutions: 358 (excluded: 55)
- Institutions with URL but no fees: needs investigation
