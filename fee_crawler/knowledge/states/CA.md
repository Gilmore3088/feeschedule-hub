# CA Fee Schedule Knowledge


## Run #116 — 2026-04-07
Discovered: 46 | Extracted: 171 | Failed: 195

### New Patterns
- PDF-classified fee schedules show high extraction success rate (12-69 fees per document), while HTML and js_rendered pages frequently fail extraction despite successful classification
- JavaScript-rendered pages (js_rendered) show mixed results: Tri Counties Bank and Golden 1 Credit Union failed extraction, but Logix and Star One succeeded
- HTML-classified pages (East West Bank, Axos Bank, Bank of Hope) show inconsistent extraction: some extract 1-3 fees, others extract nothing despite successful classification
- Credit unions with direct PDF fee schedules show exceptional extraction performance (Redwood: 40, Patelco: 44, San Diego County: 69 fees)
- High failure rate in discovery phase (8 failed discovers out of 25 attempts) often involves detection of wrong page type (About Us, privacy pages, general navigation)
- Skipped discoveries (8 instances) followed by successful classification and extraction suggest skipped=discovery not attempted, but page content was still processable

### Site Notes
- City National Bank (PDF) and Mechanics Bank (PDF) both classified correctly but extraction failed, suggesting PDF parsing issues differ from page type classification
- Logix FCU required navigation to discover link but extracted successfully from js_rendered page, indicating dynamic content rendering works when page loads correctly
- Bank of Hope and Axos Bank both HTML-classified and succeeded with low counts (1, 3 fees), while East West Bank HTML-classified but failed completely
- California credit unions appear to publish more comprehensive, machine-readable fee schedules than banks in this sample
- Banc of California, Cathay Bank, Citizens Business Bank, and First Foundation Bank all failed because crawler landed on non-fee pages despite website having schedules
- Patelco, San Diego County FCU, Star One all show skipped discovery but high extraction counts (44, 69, 29), indicating these were pre-identified URLs

### Promoted to National
- Fee schedule format (PDF vs HTML vs dynamic rendering) is a stronger predictor of extraction success than discovery method. Prioritize PDF extraction pipeline validation.
- js_rendered classification alone doesn't guarantee extractable content. Implementation needs to differentiate between successfully-rendered fee tables vs rendered pages with missing fee data.
- HTML pages may contain partial fee information or summary-only content. Low extraction counts (1-3 fees) from HTML may indicate landing pages rather than comprehensive schedules.
- Credit union fee schedules are more complete and standardized. May warrant separate extraction strategies or templates for credit unions vs commercial banks.
- Discovery algorithm is confusing corporate pages with fee schedule pages. Needs refinement to identify actual fee disclosure pages vs general banking information.
- Distinguish between 'skipped' (pre-identified URL) vs 'failed' (attempted but unsuccessful). Current tagging conflates different scenarios.

## Run #139 — 2026-04-07
Discovered: 5 | Extracted: 171 | Failed: 195

### New Patterns
- PDF documents consistently extract successfully across multiple institutions, suggesting PDF parsing is reliable for fee schedule extraction
- JavaScript-rendered pages show mixed results - some extract well while others fail completely, indicating extraction logic may not properly handle dynamic content
- HTML-classified pages frequently fail extraction despite successful classification, suggesting classification and extraction have misaligned assumptions about content structure
- Discovery failures show inconsistent reasons - some pages detected as navigation/category pages without fee content, suggesting need for more selective URL targeting during discovery phase

### Site Notes
- City National Bank, Farmers and Merchants Bank of Long Beach, Redwood Federal Credit Union, and Patelco Federal Credit Union all extracted fees successfully from PDFs with high yields (14-45 fees)
- Logix Federal Credit Union and Star One Federal Credit Union successfully extracted from js_rendered pages (5 and 28 fees), but Tri Counties Bank and The Golden 1 Federal Credit Union failed despite same classification
- East West Bank, Mechanics Bank, and The Golden 1 Federal Credit Union all classified as extractable but yielded no fees; only some HTML pages succeeded (Schoolsfirst, Axos, Bank of Hope)
- Banc of California and Citizens Business Bank failed discovery on pages with only navigation/category content; First Foundation Bank failed on privacy page - indicates discovery may be targeting wrong page types

### Promoted to National
- Network and infrastructure failures occur during discovery (HTTP/2 protocol error for First Technology Federal Credit Union) - need robust error handling and retry logic for discovery phase to avoid false negatives

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 62% (209/338 addressable)
- Total institutions: 366 (excluded: 28)
- Institutions with URL but no fees: needs investigation
