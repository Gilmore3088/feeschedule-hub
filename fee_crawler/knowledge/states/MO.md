# MO Fee Schedule Knowledge


## Run #66 — 2026-04-07
Discovered: 60 | Extracted: 102 | Failed: 185

### New Patterns
- JS-rendered pages with discovery success often contain fee schedules behind navigation layers that require clicking through product pages or account type selectors
- PDF documents consistently extract well (high success rates on Stifel, First Bank, Together Federal, Omb Bank, North American Savings)
- JS-rendered pages that classify successfully but fail extraction suggest content is present but extraction logic cannot parse dynamic fee tables
- Discovery failures often occur when fee information exists but is scattered across product pages without a consolidated fee schedule link
- Credit unions in MO dataset show higher extraction success rates than commercial banks
- Low discovery success rate (60/245) with high failure count (185) indicates MO banks have poor fee schedule accessibility

### Site Notes
- UMB Bank and Enterprise Bank & Trust both had js_rendered classification with successful discovery via 'Direct fee schedule link found after navigation'
- MO banks publishing as PDFs show reliable extraction; skipped discovery phase suggests established workflow for PDF sources
- Enterprise Bank & Trust, Great Southern Bank, and Southern Bank all show this pattern—pages found and classified but extraction yields zero fees
- The Central Trust Bank, First State Community Bank, Academy Bank, and Midwest BankCentre all failed discovery despite fees being mentioned somewhere on site
- First Community Federal Credit Union (1 fee), Together Federal Credit Union (55 fees) both succeeded despite low/high volumes
- Only 24.5% discovery success suggests systemic issue with how MO institutions publish fee information

### Promoted to National
- Implement deeper navigation traversal for js_rendered sites—fee schedules frequently hidden behind secondary navigation rather than on landing pages
- PDF-based fee schedules are most reliable for automated extraction; prioritize PDF discovery paths
- JS-rendered fee extraction is fragile; may need human review or improved DOM parsing for dynamically populated tables
- Many institutions lack dedicated fee schedule pages; fees embedded in product documentation may require scraping multiple pages rather than single-link discovery
- Credit union fee structures may be more standardized or better documented than commercial banks
- Missouri banks below national average for online fee schedule disclosure; may require regulatory outreach or manual research fallback

## Run #84 — 2026-04-07
Discovered: 8 | Extracted: 99 | Failed: 188

### New Patterns
- JS-rendered pages with fee content often fail extraction despite successful classification
- PDF format shows highest extraction success rate in this dataset
- Discover failures often occur on pages that ARE fee-schedule-related but lack structured fee tables
- HTML-classified pages show variable but functional extraction

### Site Notes
- Enterprise Bank & Trust, Great Southern Bank, Southern Bank, and Guaranty Bank all classified as js_rendered but extraction failed with 'no fees extracted'. Suggests rendering may not be capturing fee table structures properly.
- Stifel Bank (23 fees), First Bank (41 fees), North American Savings Bank (10 fees), Together Federal Credit Union (58 fees), and Omb Bank (35 fees) all extracted successfully from PDFs with no failures
- The Central Trust Bank (About Us), First State Community Bank (product page), Academy Bank (privacy policy), The Bank of Missouri (account features), and Midwest BankCentre (general disclosures) all failed discovery because pages contained account/product info without actual fee schedules
- Oakstar Bank (32 fees) and First Bank of the Lake (27 fees) both html-classified with successful extraction, suggesting HTML tables can work when properly formatted

### Promoted to National
- JS rendering success in classification does not guarantee extractable fee tables; may need format-specific extraction logic for rendered content
- PDF-based fee schedules demonstrate reliable extraction; prioritize PDF discovery and extraction pipeline
- Implement secondary discovery layer for pages that mention fees/accounts but lack structured fee schedule tables
- HTML fee schedules can be extracted reliably; extraction failure more likely due to non-standard markup than format choice

## Run #92 — 2026-04-07
Discovered: 2 | Extracted: 100 | Failed: 187

### New Patterns
- JS-rendered pages with fee content often fail extraction despite successful classification
- PDF format shows consistently high success rates
- Discovery failures on checking account pages suggest fee schedules are not co-located with account descriptions
- High extraction volume from federal credit unions despite low institution count

### Site Notes
- Enterprise Bank & Trust, Great Southern Bank, Southern Bank, Academy Bank, and Guaranty Bank all classified as js_rendered but failed extraction with 'no fees extracted'. Suggests rendering captures page structure but fee data remains inaccessible or dynamically loaded after initial render.
- Stifel Bank and Trust (24), Stifel Bank (23), First Bank (41), and Together Federal Credit Union (56) all used PDF format with successful extraction. No PDF-sourced institutions failed extraction.
- The Central Trust Bank, First State Community Bank, and The Bank of Missouri all failed discovery on checking account product pages, indicating fee schedules likely reside in separate disclosures or documents, not on marketing pages
- First Community Federal Credit Union (1 fee) and Together Federal Credit Union (56 fees) suggest credit unions publish comprehensive fee schedules when they do publish online

### Promoted to National
- JS-rendered fee schedules require deeper DOM inspection or wait-for-selector strategies beyond standard rendering
- Prioritize PDF discovery for fee schedules; PDF content extraction is significantly more reliable than web pages
- Search for separate fee schedule documents/disclosures rather than assuming they appear on account product pages
- Credit unions appear to follow standardized fee disclosure practices; investigate NCUA disclosure requirements as source
