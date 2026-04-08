# NJ Fee Schedule Knowledge


## Run #114 — 2026-04-07
Discovered: 27 | Extracted: 73 | Failed: 108

### New Patterns
- PDF-classified documents with extraction failures suggest OCR or parsing limitations on certain PDF formats or layouts
- JavaScript-rendered pages show mixed results - some extract successfully while others fail completely
- Contact/form pages and service overview pages are frequent discover failures, wasting crawl attempts
- Direct navigation to PDF fee schedules (when discoverable) yields high and consistent extraction rates
- Skipped discovery steps (27 institutions) still achieved successful classification and extraction, indicating either cached URLs or secondary lookup methods working

### Site Notes
- OceanFirst Bank published fee schedule as PDF but extraction yielded zero fees despite successful classification
- Valley National Bank's js_rendered page extracted 24 fees successfully, but Unity Bank and Bessemer Trust js_rendered pages both failed extraction despite classification success
- Peapack Private Bank, BCB Community Bank, and Amboy Bank all failed discovery on non-schedule pages; Cross River Bank's personal banking page has no discoverable schedule links
- Kearny Bank, The Bank of Princeton, and Parke Bank all had successful discovery with 'Direct fee schedule link found after navigation' and subsequently extracted 33-55 fees
- Implies discovery skip is not necessarily a blocker; institutions like Valley National Bank, ConnectOne Bank, and Spencer Savings Bank had full success pipeline despite skipped discovery

### Promoted to National
- High failure rate on discover phase (108 failures) is disproportionate to actual information gaps - many failures are navigation/page-type misclassifications rather than absent schedules. Refine discover prompt to filter non-schedule pages earlier

## Run #129 — 2026-04-07
Discovered: 3 | Extracted: 77 | Failed: 104

### New Patterns
- PDF-classified documents consistently fail extraction despite successful classification
- JS-rendered pages show mixed results despite successful classification
- Discover failures on pages mentioning fees but lacking direct fee schedule links
- HTML-classified pages show high extraction success rate
- Small fee counts (2-7) from successfully extracted sources

### Site Notes
- OceanFirst Bank and Kearny Bank classified as PDF but extract=failed with 'no fees extracted'. Suggests PDF content extraction pipeline issue or PDFs containing non-standard fee table formats.
- Valley National Bank (js_rendered) extracted 24 fees successfully, but Unity Bank (js_rendered) failed extraction. Both classified OK.
- Cross River Bank, Amboy Bank mentioned fees contextually but had no visible links to actual fee schedules. Discover correctly identified absence of fee schedule content.
- ConnectOne Bank, Columbia Bank, First Bank, Manasquan Bank all html-classified with 100% extraction success (10-33 fees each).
- Peapack Private Bank & Trust extracted only 2 fees; Affinity Federal Credit Union 7 fees. May indicate private/niche institutions with limited published fee structures.

### Promoted to National
- PDF classification success does not guarantee extractable fee data. Need separate validation of PDF readability or structure before extraction attempt.
- JS rendering captures page but doesn't guarantee parseable fee structure. May need format-specific extraction rules for dynamically rendered content.
- Fee mentions ≠ published fee schedule. Institutions may describe fees in account terms without publishing standalone schedules.
- HTML format correlates with extractable fee schedules. Prioritize HTML sources over PDF when available.
- Low extraction counts may reflect institution type rather than discovery/extraction failure. Validate completeness separately for trust companies and credit unions.

## Run #137 — 2026-04-07
Discovered: 2 | Extracted: 81 | Failed: 100

### New Patterns
- JS-rendered pages classified correctly but extraction sometimes fails despite successful rendering
- PDF classification is reliable for extraction, but some PDFs yield minimal or zero results
- Discovery failures show inconsistent messaging; many are false negatives on valid fee schedule pages

### Site Notes
- Valley National Bank: js_rendered classification worked and extracted 24 fees successfully. Unity Bank: js_rendered classified ok but extraction failed with no fees extracted — suggests rendering succeeded but fee parsing logic needs refinement for certain JS patterns
- Kearny Bank: PDF classified ok but extraction completely failed (no fees extracted) — indicates PDFs may be scanned images or poorly structured, requiring OCR or alternative parsing
- Peapack Private Bank & Trust: HTML classified ok but only 2 fees extracted from what should be a more complete schedule — suggests some fee schedule content may be dynamically loaded or embedded in formats our extractor misses
- Provident Bank, Cross River Bank, BCB Community Bank, Amboy Bank: discover failed with reasoning about page content/navigation, suggesting discovery heuristics are over-filtering institutional pages that do contain fee data

### Promoted to National
- High skipped discover rate (12 of 18 institutions) with successful downstream classification and extraction indicates discover step may be unnecessarily conservative — consider reducing discover skip criteria or validating that classification/extraction can reliably replace discovery

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 62% (90/146 addressable)
- Total institutions: 181 (excluded: 35)
- Institutions with URL but no fees: needs investigation
