# AR Fee Schedule Knowledge


## Run #56 — 2026-04-07
Discovered: 35 | Extracted: 49 | Failed: 78

### New Patterns
- PDF documents with 'Consumer OD' or overdraft-specific naming often contain fee schedules but may fail extraction due to formatting/structure
- JavaScript-rendered pages successfully discover and extract fee content when HTML-only pages fail
- Fee-related PDFs embedded in page links are discoverable when they lack explicit 'fee schedule' naming
- Large extraction counts (40+) indicate well-structured tabular fee schedules in single documents
- Banks with 'Resources', 'Policies', 'Disclosures' pages often don't directly host fee schedules despite contextual relevance
- Skipped discoveries (5 instances) suggest pre-filtering by known institution type may be eliminating valid discovery attempts
- Extracted fee count variance (1-44) within same state suggests institution-specific formatting rather than content absence

### Site Notes
- The First National Bank of Fort Smith: discovered PDF titled 'Consumer OD Updated 09.2023.pdf' but extraction failed despite successful classification
- Relyance Bank and First Service Bank both used js_rendered classification and succeeded in extraction where static HTML discovery would likely have failed
- Simmons Bank: successfully found PDF through page link analysis rather than direct navigation, discovered 1 fee entry
- Centennial Bank (43 fees) and Chambers Bank (44 fees) both extracted from PDFs with consistent table formatting; suggests document preprocessing optimization opportunity
- Bank OZK, Centennial Bank, Arkansas Federal Credit Union, First Financial Bank, Central Bank were skipped but subsequent classification/extraction was attempted—inconsistent strategy
- Arkansas has 35 discovered and 49 total extracted, but 78 failures indicates many institutions deliberately don't publish standardized fee schedules online or use non-extractable formats

### Promoted to National
- Discovery strategy should de-prioritize generic resource/policy pages and focus on account-type-specific pages or direct fee schedule links

## Run #59 — 2026-04-07
Discovered: 2 | Extracted: 52 | Failed: 75

### New Patterns
- Discovery failures on pages with account feature descriptions suggest checking account pages don't reliably contain fee schedule links; need to look for dedicated 'Fees', 'Disclosures', or 'Service Charges' sections instead
- PDF classification consistently succeeds, but extraction fails in ~25% of PDFs (Central Bank, Arkansas Federal Credit Union, The First National Bank of Fort Smith) — suggests PDFs may be image-based or poorly structured
- JS-rendered pages (Relyance Bank, First Service Bank) successfully extract despite complexity — suggest JS rendering is working but extraction thresholds may be too high
- Privacy/disclosure/policy pages are common landing points but don't contain fee schedules; discovery logic flagging these as potential sources is wasting attempts
- High extraction success rate (52 extracted from 27 discovery successes) suggests discovery is the primary bottleneck, not extraction quality

### Site Notes
- Arvest Bank, ENCORE BANK, First National Bank, Generations Bank all failed discovery on checking/rates pages despite containing account information
- Relyance Bank and First Service Bank both classify as js_rendered and successfully extract, unlike some HTML pages that fail extraction
- First Security Bank, The Citizens Bank, Stone Bank all landed on privacy/policy pages during discovery phase
- Bank OZK classified as HTML but extract=failed with no fees — html classification succeeds but fee structure may be in tables or formats extraction doesn't recognize

### Promoted to National
- Implement secondary validation step for PDFs that extract zero fees before marking as complete; may indicate scanned documents requiring OCR
- Focus optimization effort on discovery phase rather than extraction algorithm tuning

## Run #64 — 2026-04-07
Discovered: 0 | Extracted: 54 | Failed: 73

### New Patterns
- PDF classification success but extraction failure indicates OCR or structural parsing issues with certain PDF formats
- HTML pages with fee information in visual tables are being missed by discovery logic
- JavaScript-rendered pages have mixed success (some extraction works, some doesn't)
- Large fee extractions (44+ fees) consistently come from PDF sources classified correctly
- Many discover=failed results indicate pages with account/checking information but no obvious fee schedule link
- HTML classification with zero extraction suggests template or format incompatibility

### Site Notes
- Arkansas Federal Credit Union, The First National Bank of Fort Smith, and Central Bank all classified as PDF but yielded zero fees. Suggests either scanned PDFs requiring OCR or PDFs with fee tables in non-standard layouts.
- Generations Bank and Diamond Bank explicitly noted as having 'fees directly in the table' and 'basic fee information in a table format' but discovery failed to identify them as fee schedule pages.
- Relyance Bank (js_rendered) extracted 1 fee successfully, First Service Bank (js_rendered) extracted 2. Both succeeded where many HTML/PDF failed, suggesting js_rendered pages may have more accessible fee structures or better-formed content.
- Centennial Bank and Chambers Bank both PDF and both extracted 44 fees. Simmons Bank (PDF, 1 fee) and Farmers Bank (HTML, 37 fees) also succeeded. Suggests consistent PDF handling when extraction triggers.
- Arvest Bank, ENCORE BANK, First National Bank, Generations Bank, Diamond Bank all have checking/account pages without discoverable fee schedule links. Pages exist but are not linked.
- Bank OZK classified as HTML but extracted zero fees despite successful classification. Not a discovery failure.

### Promoted to National
- When PDF extraction fails despite successful classification, implement OCR fallback or manual review flag rather than returning empty results.
- Discovery logic needs enhancement to detect pages with tabular fee data even when they lack explicit 'fee schedule' link text or page titles.
- JS-rendered pages appear more reliable for extraction in this state. Prioritize js_rendered classification in discovery when available.
- No learning—this is expected behavior indicating PDFs format fee schedules more consistently than HTML.
- Institutions may publish fee schedules but not link them from main navigation. Consider separate crawling strategy targeting /disclosures, /fees, /documents subdirectories.
- HTML extraction failures despite classification suggest the extraction regex/parser needs tuning for regional bank HTML patterns.

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 49% (61/124 addressable)
- Total institutions: 127 (excluded: 3)
- Institutions with URL but no fees: needs investigation
