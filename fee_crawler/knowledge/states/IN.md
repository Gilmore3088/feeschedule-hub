# IN Fee Schedule Knowledge


## Run #67 — 2026-04-07
Discovered: 56 | Extracted: 73 | Failed: 141

### New Patterns
- PDF-classified fee schedules consistently extract more fees than js_rendered pages
- js_rendered pages fail at extraction stage even after successful classification
- Security/blocking mechanisms prevent discovery at multiple Indiana institutions
- Skipped discoveries followed by successful extractions indicate alternate discovery paths work
- PDFs with direct consumer account links extract consistently

### Site Notes
- Lake City Bank (PDF): 34 fees extracted; Elements Financial (PDF): 46 fees; vs Centier Bank and 1st Source Bank (js_rendered): 0 fees extracted despite successful classification
- Centier Bank and 1st Source Bank both classify as js_rendered but extract no fees, suggesting rendering captures page structure but not fee table content
- Horizon Bank blocked by security service; Forum Federal Credit Union shows empty/not-fully-loaded content; indicates some IN financial institutions use anti-scraping protections
- First Merchants Bank, Lake City Bank, Liberty Federal Credit Union, Elements Financial all had skipped discovery but successful extraction (11, 34, 44, 46 fees respectively), suggesting classification/extraction can work without explicit discover step
- First Financial Bank found 'Consumer Accounts' PDF link but failed extraction, unique failure among PDF-classified institutions—may indicate PDF parsing issue with specific document structure

### Promoted to National
- js_rendered classification followed by failed extraction is a systematic problem worth investigating at extraction logic level—may indicate JavaScript-rendered fee tables use non-standard HTML structures

## Run #76 — 2026-04-07
Discovered: 3 | Extracted: 75 | Failed: 139

### New Patterns
- JS-rendered pages with fee schedules extract successfully when properly classified
- PDF format consistently yields good extraction results across different institution types
- Credit unions publishing HTML fee schedules show strong extraction performance
- Security/WAF blocks prevent discovery on certain banking sites
- Generic resource/navigation pages returned as discovery results waste extraction attempts
- Checking account landing pages without direct fee schedule links indicate no online fee publication

### Site Notes
- Old National Bank, Centier Bank, 1st Source Bank, Indiana Members Federal Credit Union all classified as js_rendered. Old National Bank extracted 16 fees successfully; Centier and 1st Source failed extraction despite correct classification, suggesting content exists but extraction logic needs refinement for this format.
- First Merchants Bank (9 fees), Lake City Bank (34 fees), Elements Financial (50 fees) all PDF-based and successful. First Financial Bank PDF extracted zero fees, indicating some PDFs may have obfuscated or non-standard fee table formatting.
- Liberty Federal (44 fees), Three Rivers Federal (59 fees), Everwise (13 fees), Centra (28 fees) all HTML-based with good results. Suggests credit unions more likely to use accessible HTML format vs banks using PDFs/JS rendering.
- Horizon Bank blocked by security service during discovery phase. May require different user-agent, referrer, or timing strategy for sites with aggressive bot protection.
- German American Bank (resources page with nav links), The National Bank of Indianapolis (privacy/regulatory page), First Savings Bank (resources sub-page) all failed discovery by returning wrong page types. Improve discovery filtering to avoid resource/navigation pages.
- Merchants Bank of Indiana discovery failed with message about personal checking page lacking fee links. This may indicate institution genuinely doesn't publish fees online rather than discoverable but hidden.

### Promoted to National
- Credit unions show significantly higher discovery/extraction success rate than banks in this sample (85%+ success vs ~50% for banks), potentially due to regulatory differences or different website publishing practices.

## Run #88 — 2026-04-07
Discovered: 1 | Extracted: 74 | Failed: 140

### New Patterns
- JS-rendered pages with fee schedules can be successfully extracted, but some JS-rendered sites fail extraction despite proper classification
- PDF-based fee schedules show higher success rates than JS-rendered or HTML formats
- Discover phase fails when fee schedule links are absent from main banking pages or hidden behind non-obvious navigation
- HTML-based fee pages from credit unions extract reliably with moderate fee counts
- Some institutions classified as PDF or JS_rendered fail extraction with 'no fees extracted' despite successful classification

### Site Notes
- Old National Bank (js_rendered, 15 fees extracted successfully) vs. Centier Bank and 1st Source Bank (js_rendered, both failed extraction). Suggests rendering alone insufficient—page structure or content variation causes extraction failures.
- Lake City Bank (PDF, 33 fees) and Elements Financial (PDF, 51 fees) both extracted well. First Merchants Bank (PDF, 12 fees) also successful. PDF format appears more consistent for fee data extraction.
- Merchants Bank of Indiana, German American Bank, and United Fidelity Bank all failed discover on checking/resources pages with no fee-related links visible. These institutions may publish fees in separate or buried URLs not found via standard entry points.
- Liberty Federal (HTML, 44 fees), Everwise (HTML, 12 fees), and First Farmers (HTML, 2 fees) all succeeded. Credit unions using simple HTML structures show consistent extraction success.
- Horizon Bank blocked by Cloudflare—security service interference prevents discovery entirely. May require alternative access methods or direct URL if known.
- First Financial Bank National Association (PDF) and Three Rivers Federal Credit Union (HTML) both classified successfully but returned zero fees. Suggests page structure contains fee-related content that extraction logic cannot parse.

### Promoted to National
- None

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 43% (83/193 addressable)
- Total institutions: 214 (excluded: 21)
- Institutions with URL but no fees: needs investigation
