# HI Fee Schedule Knowledge


## Run #18 — 2026-04-06
Discovered: 11 | Extracted: 29 | Failed: 22

### New Patterns
- JS-rendered pages (banking sites using heavy JavaScript) consistently fail extraction even after successful classification
- PDF format shows high variability in extraction success (5 successes, 2 failures across HI)
- Credit unions outperform banks in fee schedule availability and extractability in HI market
- Homepage navigation discovery fails when fee schedules are buried (not linked from main navigation)
- Skipped discoveries (10 institutions) with later successful extractions indicate incomplete initial discovery logic

### Site Notes
- First Hawaiian Bank and Bank of Hawaii both classified as js_rendered but yielded zero fees - suggests rendered content may not be properly captured for extraction
- Hawaii National Bank PDF was discovered and classified but failed extraction despite filename suggesting fee content; Pearl Hawaii FCU same pattern
- 10 of 11 credit unions discovered/extracted successfully; 3 of 4 banks either failed extraction or couldn't be discovered
- Hawaii State Federal Credit Union and Hawaii Community Federal Credit Union failed discovery on rates/help pages; University of Hawaii FCU succeeded with 'navigation' discovery method
- Multiple FI marked 'discover=skipped' still had extractable content (Hawaiiusa FCU: 41 fees, Gather FCU: 46 fees, Honolulu FCU: 31 fees)

### Promoted to National
- JS-rendered fee schedule content requires enhanced extraction logic; current pipeline may be missing dynamically-loaded fee tables
- PDF classification success does not guarantee extractable structured fee data; OCR or PDF parsing may be inconsistent
- Credit unions may have more standardized, accessible fee schedule publishing practices than commercial banks
- Direct fee schedule links on homepage yield better discovery than inference from rates pages; worth prioritizing direct link patterns
- Discovery skip logic may be too conservative; consider retry or alternative discovery methods for skipped institutions

## Run #144 — 2026-04-07
Discovered: 4 | Extracted: 31 | Failed: 20

### New Patterns
- JS-rendered pages with fee content fail extraction despite successful classification
- PDF format shows strong extraction success rate in Hawaii market
- Banks vs Credit Unions extraction outcome split
- Discover failures on rates pages warrant secondary search strategy
- HTML classification shows mixed but viable results

### Site Notes
- First Hawaiian Bank and Bank of Hawaii both classified as js_rendered but extract returned no fees. Suggests extraction logic may not properly handle dynamically-loaded fee tables.
- 7 of 9 PDF-classified institutions successfully extracted fees (Hawaiiusa, Hawaiian Financial, Hfs, University of Hawaii, Lokahi, Pearl Hawaii, Cu Hawaii, Honolulu). Only Central Pacific Bank and Hawaii National Bank failed despite PDF classification.
- 4 banks (First Hawaiian, Bank of Hawaii, American Savings, Central Pacific, Hawaii National) — 1 success, 4 failures. Credit unions heavily outperform with 7 successes from 9 attempts.
- Hawaii State Federal Credit Union and Hawaii Community Federal Credit Union marked as rates pages with truncated discovery messages. Manual inspection of these sites needed.
- 3 HTML-classified institutions: American Savings Bank (6 fees), Hawaiian Financial (38 fees), Gather Federal (42 fees) — all successful extractions. HTML content appears more consistently structured.

### Promoted to National
- Review extraction pipeline for JS-rendered content — classification success doesn't guarantee extractable fee data
- Implement fallback discovery for institutions where rates pages are found but fee schedules not linked

## Run #150 — 2026-04-07
Discovered: 0 | Extracted: 30 | Failed: 21

### New Patterns
- JS-rendered pages often fail fee extraction despite successful classification
- PDF format shows highest success rate for fee extraction in Hawaii
- Homepage discovery failures reveal rates pages without fee schedule links
- Some institutions publish PDFs with unextractable fee data
- Credit unions dominate Hawaii's published fee schedules (18 of 30 extracted)

### Site Notes
- First Hawaiian Bank and Bank of Hawaii both classified as js_rendered but yielded zero fees. May require additional rendering wait time or dynamic content handling.
- 10 of 13 PDFs successfully extracted fees (77% success). HTML showed 4 of 5 successes. JS-rendered showed 0 of 2.
- Hawaii State Federal Credit Union and Hawaii Community Federal Credit Union discovery failed because pages contained only APY/rate information without fee schedule links. Finance Factors FAQ page similarly non-actionable.
- Central Pacific Bank, Hawaii National Bank, and Pearl Hawaii Federal Credit Union classified as PDF but extraction failed. May contain image-based tables or non-standard layouts.
- Federal credit unions in Hawaii consistently publish detailed fee schedules; traditional banks (First Hawaiian, Bank of Hawaii) do not.

### Promoted to National
- JS-rendered fee schedules need enhanced extraction logic beyond standard classification
- PDF format correlates with reliable fee schedule extraction; prioritize PDF parsing improvements
- Rate pages and FAQ pages are common dead-ends; implement early filtering to avoid wasting discovery cycles
- PDF classification alone insufficient; implement secondary validation for extractable text/tables before extraction attempt
- Credit unions show stronger fee schedule transparency than banks; may reflect regulatory or competitive dynamics worth investigating nationally

## Run #157 — 2026-04-07
Discovered: 0 | Extracted: 31 | Failed: 20

### New Patterns
- JS-rendered pages with fee tables may require different extraction logic than static HTML/PDF
- PDF format shows highest success rate for extraction in this state
- Homepage discovery failures may indicate fee schedules buried in secondary navigation or FAQ pages rather than absent

### Site Notes
- First Hawaiian Bank and Bank of Hawaii both classified as js_rendered but extraction failed with 'no fees extracted', suggesting the rendering captured page structure but not fee data content
- 13 of 15 PDF-classified institutions succeeded in extraction; only 2 HTML sources failed extraction (Central Pacific Bank classified as pdf but failed; Hawaii National Bank classified as pdf but failed)
- 0/2 commercial banks succeeded in extraction (First Hawaiian, Bank of Hawaii); 13/16 credit unions succeeded, suggesting different fee disclosure practices by institution type
- Hawaii State Federal Credit Union and Hawaii Community Federal Credit Union discovered as FAQ/annual report pages; Finance Factors Ltd discovered as About Us page — suggests discovery tool needs broader crawl strategy, not that fees are unpublished
- Aloha Pacific Federal Credit Union reported 'No links found on homepage' — may indicate site structure issue or need for alternative discovery method

### Promoted to National
- Credit unions systematically publish fee schedules more consistently than commercial banks in Hawaii
