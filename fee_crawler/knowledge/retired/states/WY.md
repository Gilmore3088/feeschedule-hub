
## Pruned 2026-04-07

## Institutions Without Fee Schedules Online
## Run #11 — 2026-04-06
## Run #16 — 2026-04-06
### New Patterns
### Promoted to National
### Site Notes
- 404 errors during extraction indicate stale or incorrect document URLs in classification phase
- 404 errors on extract suggest institutions maintain broken links to fee schedule documents, creating false classification successes
- Bank Of Jackson Hole Trust: Trust company, not consumer bank. No fee schedule expected.
- Central Bank and Trust (centralbanktrust.com): Only housing lender disclosure PDF.
- Cheyenne State Bank (cheyennestatebank.com): Minimal site, no disclosures page.
- Converse County Bank (conversecountybank.com): No fee-related links.
- Converse County Bank, Platte Valley Bank, Jonah Bank, Sundance State Bank, and Wyhy Federal Credit Union all failed at discover stage with mislabeled or buried fee schedule locations
- Cowboy State Bank (cowboystatebank.com): Account comparison page only, no fee schedule.
- Discover failures on pages labeled 'disclosures', 'forms and resources', or 'Our Story' indicate institutions mixing fee schedules with non-fee content or not publishing them in primary navigation
- Discover phase failures reveal common misdirection patterns in bank websites
- Discovery strategy may need to expand beyond dedicated 'fee schedule' pages to capture institutions that disclose fees inline on product pages
- Extract failures occur even after successful classification, suggesting either incomplete PDF parsing or genuinely empty fee documents that classify successfully but contain no extractable data
- First Federal Bank & Trust (efirstfederal.com): No fee content on any page.
- First Federal Bank & Trust discover failure notes inline fees on checking page rather than dedicated schedule—suggests some institutions embed fees in product pages rather than publishing formal schedules
- First Northern Bank of Wyoming and Meridian Trust Federal Credit Union both classified as PDF but failed extraction with 'no fees extracted', while other PDFs (Blue Federal, Hilltop) succeeded
- First Northern Bank of Wyoming and Security State Bank both classified successfully but yielded no fees on extract—worth manual review to distinguish parsing failures from institutions that intentionally omit online fee schedules
- Guernsey Community FCU: No website at all.
- Jonah Bank (jonah.bank): Disclosures page has enrollment forms only, no fee schedule.
- Many institutions appear to segment fee information across multiple pages rather than consolidating; discovery logic should account for product-specific fee pages and cross-reference multiple disclosure sections
- PDF classification alone is insufficient; extraction failures on PDFs suggest document structure variation within PDF format requires format-specific handling
- PDF-classified documents show mixed extraction results despite successful classification
- Pathfinder FCU (pathfinderfcu.com): Information Hub has no fee content.
- Pinnacle Bank, Uniwyo Federal Credit Union, First Federal Bank & Trust, First National Bank of Gillette all classified as js_rendered and extracted successfully with varying fee counts (1-38)
- Platte Valley Bank (pvbank.com): No fee-related links found anywhere.
- RSNB Bank (5 fees), Sundance State Bank (6 fees), and First National Bank of Gillette (36 fees) all validated successfully despite wide variance in extraction volume
- Security State Bank, Bank of Star Valley both js_rendered but extraction failed with 'no fees extracted' - pattern differs from successful js_rendered cases
- Sheridan Community FCU (sheridancreditunion.com): Only privacy/mobile banking disclosures.
- State Bank (statebankwy.com): Navigated /personal, /about, /disclosures — no fee content.
- Successful extraction from small fee counts (1-6 fees) vs. large counts (36-38 fees) suggests consistent document parsing
- Sundance State Bank (sundancestate.bank): 4KB homepage, fully JS-rendered, /documents page empty.
- The Converse County Bank, Platte Valley Bank, and Jonah Bank discovery failures show banks hosting forms/general disclosures/product-specific disclosures without linking to comprehensive fee schedules
- Trona Valley Community Federal Credit Union returned 404 on classified document URL, suggesting URL may be outdated or incorrectly parsed during classification
- Trona Valley Community Federal Credit Union's extract failed with 404 error despite successful classification, indicating stale or incorrect document URLs in institution metadata
- URL validation should occur during classification before extraction attempt to reduce downstream failures
- Uniwyo Federal Credit Union and Western Vista Federal Credit Union (js_rendered) each extracted 43-44 fees vs Blue Federal (pdf) with 7 fees, indicating rendering strategy significantly impacts extraction volume
- Validation success across varied fee counts indicates extraction logic is robust to document size differences
- Wyhy FCU (wyhy.org): Disclosures page has privacy/credit card terms only.
- acpefcu.com: Fee schedule at /rates/fee-schedule/ (HTML, 52 fees)
- bluefcu.com: PDF at /wp-content/uploads/...pdf — mostly rate tables, only 1 fee (overdraft). Rates doc, not full fee schedule.
- campcofcu.com: Fee schedule at /fee-schedule (HTML, 72 fees)
- farmersstatebankwyoming.com: Fee schedule at /fee-schedule (JS-rendered, 65 fees)
- firstedfcu.com: PDF at /wp-content/uploads/fee-schedule.pdf (93 fees — excellent)
- fnbgillette.com: Fee schedule at /fees-and-charges/ (JS-rendered, 73 fees)
- js_rendered classification correlates with successful extraction across multiple institutions
- js_rendered classification is necessary but not sufficient for success; some dynamically-rendered pages may require additional parsing or JavaScript simulation depth
- js_rendered format consistently yields higher extraction counts (35-44 fees) compared to pdf format (1-7 fees), suggesting dynamic content rendering captures more comprehensive fee schedules
- js_rendered pages appear more reliable for fee schedule extraction than PDF-only approaches; consider prioritizing js_rendered classification in extraction workflows
- stagepointfcu.com: Fee schedule at /manage/fees (HTML, 60 fees)
- sunlightfcu.com: Fee schedule at /fee-schedule (HTML, 50 fees)
- uniwyo.com: Fee schedule at /Learn/Information/Fee-Schedule (JS-rendered, 39 fees)
Discovered: 0 | Extracted: 25 | Failed: 18
Discovered: 1 | Extracted: 25 | Failed: 18
Total runs: 3 | Last run: 2026-04-06 | Coverage: 25/43 (58%)

