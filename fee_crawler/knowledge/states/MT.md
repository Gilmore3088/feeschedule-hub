# Montana Fee Schedule Knowledge

## Summary
Total runs: 2 | Last run: 2026-04-06 | Coverage: 36/77 (47%)

## Patterns
- Several MT sites use Webflow (cdn.prod.website-files.com PDFs) — Valley Bank of Kalispell
- Southwest Montana CU has fee schedule at /fee-schedule (direct path works)
- Bitterroot Community FCU: JS-rendered, 15 fees extracted directly from page content

## Site Notes
- tronavalley.com: PDF at /Documents/Disclosures/PDF-FEE-SCHEDULE.pdf (28 fees)
- swmcfcu.org: Fee schedule at /fee-schedule (JS-rendered)
- wolfpointfcu.com: Discovered privacy_policy.asp instead of fee schedule — wrong page. Site is old ASP, minimal content.

## Institutions Without Fee Schedules Online
(To be populated after manual review of run results)

## Run #212 — 2026-04-07
Discovered: 5 | Extracted: 29 | Failed: 48

### New Patterns
- PDF documents classified as containing fees often fail extraction with 'no fees extracted' despite successful classification
- JavaScript-rendered pages show inconsistent extraction results
- Kasasa product documents are being discovered but not successfully extracted
- High-performing extraction from credit unions with simpler PDF structures
- Discover failures citing specific page types (Rates pages, About Us, Contact pages) suggest agent is correctly identifying non-fee-schedule pages

### Site Notes
- First Interstate Bank, Independence Bank, Clearwater Federal Credit Union, TrailWest Bank all show this pattern - PDFs classified as fee schedules but extraction yields nothing
- First Montana Bank (js_rendered, failed extraction), Park Side Financial (js_rendered, failed extraction), Bank of The Rockies (js_rendered, failed extraction) - suggests rendering may not be capturing fee tables properly
- Park Side Financial Federal Credit Union found Kasasa disclaimer but extraction failed
- Whitefish Credit Union (34 fees), Intrepid Federal Credit Union (43 fees), Opportunity Bank of Montana (40 fees) all succeeded; suggests well-structured PDFs extract reliably
- Three Rivers Bank, American Bank, Manhattan Bank correctly rejected during discovery phase, reducing wasted downstream processing

### Promoted to National
- Need to improve extraction logic for PDF fee schedules; classification is not validating actual extractable content
- JS rendering pipeline may need refinement for financial tables and structured fee data
- Kasasa product materials may require specialized parsing; consider adding Kasasa-specific extraction rules
- Institutions with standardized, cleanly-formatted PDFs extract successfully; could establish baseline PDF quality metrics
- Discovery filtering is working well; focus remediation on institutions where PDFs are found but extraction fails

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 52% (37/71 addressable)
- Total institutions: 77 (excluded: 6)
- Institutions with URL but no fees: needs investigation
