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
