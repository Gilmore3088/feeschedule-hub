# MI Fee Schedule Knowledge


## Run #111 — 2026-04-07
Discovered: 69 | Extracted: 115 | Failed: 131

### New Patterns
- js_rendered classified documents consistently fail extraction despite successful discovery and classification
- PDF documents with extraction failures show no obvious classification error, suggesting content parsing issue rather than format detection
- HTML extraction succeeds more reliably than other formats in this cohort
- Discovery failures on account product pages suggest current discovery logic doesn't recognize fee disclosures buried in account feature comparisons
- Skipped discoveries correlate with later extraction success for credit unions

### Site Notes
- ChoiceOne Bank and Advia Federal Credit Union both classified as js_rendered with 0 fees extracted, suggesting extraction logic may not handle JavaScript-rendered fee schedules
- Northpointe Bank, Michigan Schools And Government FCU, Consumers FCU all classified correctly as PDF but yielded zero fees - indicates PDF parsing logic gap
- Lake Michigan FCU and Lake Trust FCU (both HTML) extracted successfully; Dow FCU (HTML) failed despite classification success
- First National Bank of America, Independent Bank, Isabella Bank, Macatawa Bank, Bank of Ann Arbor all failed discovery on checking account pages - these institutions may host fee schedules as comparison matrices rather than dedicated documents
- Michigan State University FCU used /disclosures page discovery path and succeeded (53 fees); many skipped discoveries later classified and extracted successfully, suggesting direct fee links exist but weren't attempted

### Promoted to National
- Investigate js_rendered extraction pipeline - may need DOM snapshot or alternative parsing for dynamically-rendered fee tables
- Review PDF extraction for tables/structured content - some PDFs may have fee data in non-standard layouts or scanned images
- Enhance discovery heuristics to detect fee information in account comparison/feature pages, not just dedicated fee schedule links

## Run #136 — 2026-04-07
Discovered: 7 | Extracted: 125 | Failed: 121

### New Patterns
- JS-rendered pages consistently fail extraction despite successful classification
- PDF classification universally successful with high extraction rates
- HTML pages show mixed results but viable
- Extraction failure on valid PDFs suggests content-specific parsing issues
- Discovery skipping masks institutions that may not publish fee schedules online

### Site Notes
- ChoiceOne Bank and Advia Federal Credit Union both classified as js_rendered but yielded zero fees. Rendering may not be capturing fee tables properly.
- 11 of 13 PDF-classified institutions extracted fees successfully (85% success rate). PDFs are most reliable format in MI dataset.
- Lake Michigan FCU and Lake Trust FCU (both HTML) extracted successfully, while Dow FCU (HTML) failed. HTML success depends on table structure.
- Northpointe Bank, Consumers FCU, and Dow FCU all classified correctly but extraction returned zero fees. PDFs may contain fee data in unexpected layouts or tables.
- 7 institutions skipped discovery; unable to confirm whether 4 extraction failures represent parsing issues or genuinely absent online schedules.
- First National Bank of America, Mercantile Bank, Independent Bank, Macatawa Bank, and Bank of Ann Arbor all reported discover_failed with specific context (FAQ pages, service pages, rates pages without fee links). These may genuinely not publish fee schedules online.

### Promoted to National
- JS-rendered fee schedule pages require validation of extraction logic—classification success does not guarantee extractable content
- Prioritize PDF discovery paths; they are institutional standard for fee schedules
- HTML extraction requires stricter fee-table pattern matching than PDFs
- PDF classification success without extraction warrants review of table parsing logic and fee-identifier keywords
- Require discovery phase for all institutions to distinguish 'not published' from 'extraction failed'
- Banks with FAQ-heavy or rates-focused pages are less likely to have linked fee schedules; consider alternate discovery strategies

## Run #202 — 2026-04-07
Discovered: 0 | Extracted: 127 | Failed: 119

### New Patterns
- JS-rendered pages show higher extraction failure rate than PDF/HTML
- Discovery failures concentrated on checking account comparison/feature pages without direct fee document links
- PDF classification consistently succeeds but HTML/JS rendering shows variable extraction outcomes
- Extract failures on successfully classified documents suggest content parsing issues rather than document availability

### Site Notes
- ChoiceOne Bank, Isabella Bank, Advia Federal Credit Union all failed extraction despite successful classification from js_rendered content
- First National Bank of America, Macatawa Bank, Bank of Ann Arbor had discover fail on account comparison pages that mention fees but lack extraction links
- PDF documents (Dfcu, Michigan State, Dort Financial) had 100% extraction success; HTML (Lake Trust, Dow) and JS-rendered pages mixed results
- Michigan Schools Government FCU, Advia FCU, Dow FCU, Isabella Bank all classified correctly but extracted zero fees - indicates content exists but is not being parsed

### Promoted to National
- JS-rendered fee schedules may require additional parsing logic or content validation beyond standard rendering
- Account comparison pages are common false positives - need to distinguish from actual fee schedules in discovery logic
- PDF-based fee schedules are more reliably structured for extraction than dynamically rendered web content
- Post-classification validation needed: classify=ok with extract failure warrant manual review for parsing logic gaps
