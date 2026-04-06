# Wyoming Fee Schedule Knowledge

## Summary
Total runs: 3 | Last run: 2026-04-06 | Coverage: 25/43 (58%)

## Site Notes
- bluefcu.com: PDF at /wp-content/uploads/...pdf — mostly rate tables, only 1 fee (overdraft). Rates doc, not full fee schedule.
- uniwyo.com: Fee schedule at /Learn/Information/Fee-Schedule (JS-rendered, 39 fees)
- acpefcu.com: Fee schedule at /rates/fee-schedule/ (HTML, 52 fees)
- stagepointfcu.com: Fee schedule at /manage/fees (HTML, 60 fees)
- campcofcu.com: Fee schedule at /fee-schedule (HTML, 72 fees)
- sunlightfcu.com: Fee schedule at /fee-schedule (HTML, 50 fees)
- farmersstatebankwyoming.com: Fee schedule at /fee-schedule (JS-rendered, 65 fees)
- fnbgillette.com: Fee schedule at /fees-and-charges/ (JS-rendered, 73 fees)
- firstedfcu.com: PDF at /wp-content/uploads/fee-schedule.pdf (93 fees — excellent)

## Institutions Without Fee Schedules Online
- Bank Of Jackson Hole Trust: Trust company, not consumer bank. No fee schedule expected.
- Guernsey Community FCU: No website at all.
- Cheyenne State Bank (cheyennestatebank.com): Minimal site, no disclosures page.
- Cowboy State Bank (cowboystatebank.com): Account comparison page only, no fee schedule.
- State Bank (statebankwy.com): Navigated /personal, /about, /disclosures — no fee content.
- Sundance State Bank (sundancestate.bank): 4KB homepage, fully JS-rendered, /documents page empty.
- Sheridan Community FCU (sheridancreditunion.com): Only privacy/mobile banking disclosures.
- Pathfinder FCU (pathfinderfcu.com): Information Hub has no fee content.
- Platte Valley Bank (pvbank.com): No fee-related links found anywhere.
- Converse County Bank (conversecountybank.com): No fee-related links.
- First Federal Bank & Trust (efirstfederal.com): No fee content on any page.
- Central Bank and Trust (centralbanktrust.com): Only housing lender disclosure PDF.
- Jonah Bank (jonah.bank): Disclosures page has enrollment forms only, no fee schedule.
- Wyhy FCU (wyhy.org): Disclosures page has privacy/credit card terms only.

## Run #11 — 2026-04-06
Discovered: 1 | Extracted: 25 | Failed: 18

### New Patterns
- js_rendered format consistently yields higher extraction counts (35-44 fees) compared to pdf format (1-7 fees), suggesting dynamic content rendering captures more comprehensive fee schedules
- Discover failures on pages labeled 'disclosures', 'forms and resources', or 'Our Story' indicate institutions mixing fee schedules with non-fee content or not publishing them in primary navigation
- Extract failures occur even after successful classification, suggesting either incomplete PDF parsing or genuinely empty fee documents that classify successfully but contain no extractable data
- 404 errors on extract suggest institutions maintain broken links to fee schedule documents, creating false classification successes
- First Federal Bank & Trust discover failure notes inline fees on checking page rather than dedicated schedule—suggests some institutions embed fees in product pages rather than publishing formal schedules

### Site Notes
- Uniwyo Federal Credit Union and Western Vista Federal Credit Union (js_rendered) each extracted 43-44 fees vs Blue Federal (pdf) with 7 fees, indicating rendering strategy significantly impacts extraction volume
- Converse County Bank, Platte Valley Bank, Jonah Bank, Sundance State Bank, and Wyhy Federal Credit Union all failed at discover stage with mislabeled or buried fee schedule locations
- First Northern Bank of Wyoming and Security State Bank both classified successfully but yielded no fees on extract—worth manual review to distinguish parsing failures from institutions that intentionally omit online fee schedules
- Trona Valley Community Federal Credit Union's extract failed with 404 error despite successful classification, indicating stale or incorrect document URLs in institution metadata

### Promoted to National
- Discovery strategy may need to expand beyond dedicated 'fee schedule' pages to capture institutions that disclose fees inline on product pages
