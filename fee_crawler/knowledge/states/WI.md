# WI Fee Schedule Knowledge


## Run #80 — 2026-04-07
Discovered: 58 | Extracted: 99 | Failed: 158

### New Patterns
- PDF documents classified correctly but extract fails on some - indicates OCR or structural parsing issues within valid PDFs
- HTML pages with direct fee navigation links show better extraction success than PDFs
- JavaScript-rendered pages successfully classified and extracted despite being dynamically loaded
- Skipped discover steps on institutions with known PDF availability still achieve successful extraction
- Nicolet National Bank and Town Bank have fees embedded in account comparison/navigation context rather than dedicated fee documents
- First Business Bank and similar commercial-focused institutions may not publish retail fee schedules online

### Site Notes
- Johnson Bank, Lake Ridge Bank, Connexus FCU: discover and classify succeeded (pdf found) but extract returned no fees, suggesting PDF content is present but not machine-readable or structured differently than expected
- Community First FCU found direct 'Fees' link in rates page navigation (HTML source) and extracted 6 fees successfully; Capital FCU (HTML) extracted 14 fees. Suggests HTML navigation provides clearer semantic structure
- Royal FCU and John Deere Financial classified as js_rendered; Royal extracted 4 fees successfully while John Deere failed extraction despite correct classification
- 58 discovered vs 99 extracted indicates ~41 institutions had discover skipped but classify/extract still succeeded, primarily PDFs from credit unions
- Both failed discover with messages indicating fees mixed into account details pages rather than separate schedules
- Commercial banking pages found but no visible fee schedules in standard locations

### Promoted to National
- PDF format alone does not guarantee successful extraction; validate PDF quality/structure before relying on classification
- Prioritize HTML sources with explicit fee page navigation over PDF discovery
- js_rendered classification succeeds inconsistently on extraction - rendering engine may capture UI but not underlying fee data structures
- Skip discover optimization is valid for known institutional patterns (credit unions reliably publish PDFs in standard locations)
- Some institutions publish fees within account feature comparisons rather than standalone schedules - requires context-aware extraction strategy
- Commercial banks differ from retail/consumer banks in fee schedule publication practices - may require separate commercial fee discovery logic

## Run #93 — 2026-04-07
Discovered: 6 | Extracted: 97 | Failed: 160

### New Patterns
- JS-rendered content consistently yields successful fee extractions despite classify overhead
- PDF documents show high success rate (13/17 succeeded) but contain extraction failures even when properly classified
- Discover phase skipped for 24/26 institutions suggests pre-populated institution list bypassed web discovery entirely
- HTML-classified documents show 2/2 success (Community First, Capital Federal), smaller sample but 100% success rate vs PDF mixed results
- Extract failures occur post-classification success, indicating document was correctly identified but fee data extraction logic failed

### Site Notes
- Royal Federal Credit Union and John Deere Financial both classified as js_rendered; Royal succeeded (6 fees), John Deere failed (0 fees), suggesting rendering alone doesn't guarantee extraction success but document type classification was correct
- Johnson Bank, Connexus Federal, Lake Ridge Bank, National Exchange Bank classified as PDF but extract=failed; suggests extraction logic issue rather than discovery/classification problem
- Only Nicolet National Bank, Town Bank, Bank First, First Business Bank, and Altra Federal Credit Union attempted discover phase; skipped institutions went directly to classify, indicating workflow assumption that URLs were already known
- Nicolet National Bank, Town Bank, Bank First, and First Business Bank all failed discover with 'no fee schedule' or 'contact/service page' - these institutions may not publish fee schedules online or hide them behind authentication
- HTML format correlation with success warrants investigation given PDF extraction failures despite correct classification
- 5 institutions (Johnson Bank, John Deere, Connexus, Lake Ridge, National Exchange) reached extract phase but yielded 0 fees despite classify=ok; suggests extraction regex or parsing logic gap for specific document layouts

### Promoted to National
- None

## Run #112 — 2026-04-07
Discovered: 2 | Extracted: 101 | Failed: 156

### New Patterns
- PDF-classified documents show mixed extraction success despite successful classification - suggests PDF content structure varies significantly even when format is correctly identified
- JS-rendered pages appear viable for fee schedule extraction when classification succeeds
- HTML-classified pages with fee schedules show reliable extraction success in this sample
- Extract failures on classified PDFs suggest OCR or structural parsing issues rather than content unavailability - may warrant retry with alternative extraction methods

### Site Notes
- Johnson Bank, Lake Ridge Bank, National Exchange Bank and Trust, Connexus Federal Credit Union all classified as PDF but failed extraction, while others (Associated Bank, Educators FCU, Covantage FCU) extracted successfully from PDFs
- Royal Federal Credit Union successfully extracted 6 fees from js_rendered content; John Deere Financial failed despite js_rendered classification
- Community First FCU and Capital FCU both html-classified with successful extraction (6 and 12 fees respectively)
- Nicolet National Bank, Town Bank, Bank First, and First Business Bank discovery failures all involved checking product pages rather than dedicated fee disclosure pages - suggests these institutions may publish fees in dedicated disclosure documents separate from product marketing pages

### Promoted to National
- Checking account feature/comparison pages are frequently mislabeled as fee schedule sources during discovery - homepage checking account comparison links should not be treated as primary fee disclosure sources
