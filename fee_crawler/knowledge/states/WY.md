# Wyoming Fee Schedule Knowledge

## Summary
Total runs: 2 | Last run: 2026-04-06 | Coverage: 25/43 (58%)

## Site Notes
- **bluefcu.com**: PDF at /wp-content/uploads/...pdf — rates doc, minimal fees (1)
- **uniwyo.com**: JS-rendered at /Learn/Information/Fee-Schedule (39 fees)
- **acpefcu.com**: HTML at /rates/fee-schedule/ (52 fees)
- **stagepointfcu.com**: HTML at /manage/fees (60 fees)
- **campcofcu.com**: HTML at /fee-schedule (72 fees)
- **sunlightfcu.com**: HTML at /fee-schedule (50 fees)
- **farmersstatebankwyoming.com**: JS-rendered at /fee-schedule (65 fees)
- **fnbgillette.com**: JS-rendered at /fees-and-charges/ (73 fees)
- **firstedfcu.com**: PDF at /wp-content/uploads/fee-schedule.pdf (93 fees)

## Institutions Without Online Fee Schedules
Bank Of Jackson Hole Trust, Guernsey Community FCU, Cheyenne State Bank, Cowboy State Bank, State Bank, Sundance State Bank, Sheridan Community FCU, Pathfinder FCU, Platte Valley Bank, Converse County Bank, First Federal Bank & Trust, Central Bank and Trust, Jonah Bank, Wyhy FCU

## Key Patterns
- **JS-rendered pages extract 35-44 fees vs PDFs extract 1-7 fees** — rendering strategy significantly impacts extraction volume
- **Discover failures cluster on mislabeled pages** — 'disclosures', 'forms', 'Our Story' often contain non-fee content or buried schedules
- **Extract failures despite successful classification** — suggests parsing issues or genuinely empty documents; stale URLs detected (Trona Valley FCU 404)
- **Some institutions embed fees inline on product pages** rather than publishing formal schedules (First Federal Bank & Trust)
- **PDF classification alone insufficient** — document structure varies; URL validation needed before extraction to prevent downstream failures
- **JS-rendered classification necessary but not sufficient** — some dynamically-rendered pages require deeper JavaScript simulation

## Recommendations
- Expand discovery beyond dedicated 'fee schedule' pages to capture inline fee disclosures
- Prioritize JS-rendered classification for extraction workflows
- Implement URL validation during classification phase
- Consider product-specific fee pages and cross-reference multiple disclosure sections
- Manual review needed for First Northern Bank of Wyoming, Meridian Trust FCU, Security State Bank, Bank of Star Valley (classified successfully but no fees extracted)