# TN Fee Schedule Knowledge


## Run #53 — 2026-04-07
Discovered: 64 | Extracted: 93 | Failed: 148

### New Patterns
- PDF documents titled 'Terms & Conditions' frequently contain fee schedules but discovery heuristics may misclassify them as privacy/legal docs
- JavaScript-rendered pages with fee schedule content show extraction failures despite successful classification
- Discovery skip strategy (no attempt made) sometimes precedes successful extraction when classification/extraction are attempted anyway
- PDF documents that successfully extract high fee counts (40+) have reliable structure
- Product-specific pages (checking account features) frequently lack fee schedule links and cause discovery failures
- SmartBank shows successful discovery of T&C PDF with fee information but extraction fails despite PDF classification

### Site Notes
- Wilson Bank and Trust, SouthEast Bank: discover failed on T&C PDFs due to false negative classification as privacy documents
- Ascend Federal Credit Union, Home Federal Bank of Tennessee: js_rendered pages classify correctly but extract=failed, suggesting rendering or content structure issues
- Knoxville TVA Employees FCU, Y-12 FCU, Tennessee Valley FCU: skipped discovery but extracted 46, 2, and 10 fees respectively, indicating discovery could have succeeded
- Knoxville TVA (46 fees), ORNL FCU (43 fees): structured PDF fee schedules extract reliably when encountered
- Wellworth Bank, One Bank of Tennessee, Bank of Tennessee: product pages misidentified as potential fee schedule sources
- SmartBank: discover=ok but extract=failed on identified PDF suggests fee data exists but extraction heuristics don't parse embedded fee tables in T&C documents

### Promoted to National
- Improve PDF discovery logic to distinguish fee schedule PDFs from privacy policy PDFs in initial content analysis
- JS-rendered fee schedule pages need enhanced extraction logic; current approach succeeds on classification but fails content parsing
- Review skip decision criteria; some institutions warrant discovery attempt even when initial heuristics suggest low probability
- Credit union PDFs tend to have standardized fee table formats; prioritize PDF discovery for credit unions
- Discovery should target /disclosures, /fees, /schedules paths before attempting product pages; product pages generate false discovery attempts
- T&C PDFs containing fees need specialized extraction patterns; standard fee table extraction fails on mixed-content documents

## Run #65 — 2026-04-07
Discovered: 4 | Extracted: 97 | Failed: 144

### New Patterns
- JS-rendered pages consistently fail extraction despite successful classification
- PDF classification produces variable extraction results (0-55 items from same format)
- Discover failures cluster on misidentified landing pages
- Credit unions show strong extraction success vs mixed results for banks

### Site Notes
- FirstBank, Ascend Federal Credit Union, and Home Federal Bank of Tennessee all classified as js_rendered but extraction failed (0-2 items or complete failure). Suggests rendering may not be capturing fee tables or content structure differs post-render.
- PDFs range from 2 items (Y-12 FCU) to 55 items (ORNL FCU) to complete failures (SmartBank, Ascend). Document structure/formatting in PDFs varies significantly within same institution type.
- Multiple discover failures (Wilson Bank, SouthEast Bank, Bank of Tennessee, Citizens National Bank, Mountain Commerce Bank, etc.) indicate homepage/checking page routing isn't reliably finding fee schedules. Security-blocked sites (Builtwell Bank) cannot be crawled.
- TN credit unions (ORNL, Knoxville TVA, Ascend, Tennessee Valley, Y-12) extracted 2-55 fees each; traditional banks had more discover/extract failures. Credit unions appear more likely to publish standardized fee documents.
- First Horizon Bank (22 items), ORNL Federal (55 items), Knoxville TVA (50 items), and First Citizens National Bank (22 items) were top performers. All either HTML or PDF format with clear fee tables.

### Promoted to National
- JS-rendered fee schedule pages require specialized extraction logic beyond standard HTML parsing
- PDF extraction success depends heavily on table structure and layout consistency; standardized PDF preprocessing needed
- Institution homepages frequently don't link directly to fee schedules; discovery needs secondary navigation patterns or direct URL guessing

## Run #77 — 2026-04-07
Discovered: 4 | Extracted: 95 | Failed: 146

### New Patterns
- PDF-based fee schedules show higher extraction success rates than js_rendered pages
- js_rendered classification often masks extraction failure
- Discover failures on secondary/product pages rather than disclosure pages
- Zero-fee extraction despite successful classification indicates document structure mismatch

### Site Notes
- TN institutions: PDFs (Eastman FCU, Knoxville TVA Employees FCU, ORNL FCU, Y-12 FCU, First Citizens) averaged 25.6 fees extracted vs js_rendered pages (FirstBank, Ascend FCU, Home Federal Bank) all failed extraction despite successful classification
- FirstBank, Ascend FCU, and Home Federal Bank all classified as js_rendered but extraction failed entirely (0 fees), suggesting rendering may obscure fee table structure or extraction logic needs adjustment for dynamic content
- Wilson Bank (consumer protection page), SouthEast Bank (T&C PDF), Builtwell Bank (security blocked), Bank of Tennessee (checking product page), Mountain Commerce (product landing) — these are non-disclosure pages that triggered discovery failures
- SmartBank and Ascend FCU both classified as PDF/js_rendered respectively but extracted zero fees despite successful classification — suggests either blank/unstructured documents or extraction regex mismatches on specific formatting

### Promoted to National
- When classifying financial institution fee documents, prioritize PDF sources over JavaScript-rendered pages for extraction reliability
- Extraction pipelines for js_rendered fee content need specialized handling — standard extraction fails despite successful page classification
- Discovery failures often legitimate — many institutions may not publish centralized fee schedules online; failures on product pages suggest discovery correctly routing away from non-disclosure content
