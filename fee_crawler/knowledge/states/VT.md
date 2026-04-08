# VT Fee Schedule Knowledge


## Run #14 — 2026-04-06
Discovered: 7 | Extracted: 10 | Failed: 17

### New Patterns
- PDF documents classified as containing fees may fail extraction if they use image-based scans or unusual formatting
- JavaScript-rendered pages with fee schedules present extraction challenges even when discovered
- Credit Union disclosure PDFs (Credit Card Agreements, Disclosure documents) contain minimal fee data despite successful discovery
- Banks with skipped discovery often have extractable fee content when classification proceeds directly
- Smaller community banks and trust companies often publish minimal fee schedules (1-2 fees extracted)

### Site Notes
- Eastrise Federal Credit Union, North Country Federal Credit Union, Heritage Family Federal Credit Union, 802 Federal Credit Union, and White River Federal Credit Union all classified as PDF but yielded zero fees extracted
- The Brattleboro Savings and Loan Association discovered fee schedule link but js_rendered classification resulted in extraction failure
- Vermont Federal Credit Union found 'Credit Card Agreement & Disclosure' PDF but only extracted 2 fees—may be incomplete source selection
- Union Bank, North Country Federal Credit Union, Heritage Family Federal Credit Union, The National Bank of Middlebury, 802 Federal Credit Union, Wells River Savings Bank, and Northern Lights Federal Credit Union all skipped discovery but proceeded to extract (with mixed results)
- Peoples Trust Company of St. Albans extracted only 1 fee despite successful discovery; Vermont Federal Credit Union only 2 fees

### Promoted to National
- Extraction failure on PDFs warrants secondary validation—some PDFs may require OCR or manual review before marking as processed
- JavaScript-rendered content requires renderer capability verification; current extraction may need post-render content stabilization
- Credit union fee schedules often exist in separate documents from disclosure agreements; discovery logic should distinguish fee schedules from general disclosures
- Skipped discovery stages may indicate pre-loaded document URLs; validate whether these represent cached/known URLs versus genuine discovery gaps
- Low extraction counts may reflect actual minimal fee publications rather than extraction failure—validate against institution size and product scope

## Run #207 — 2026-04-07
Discovered: 3 | Extracted: 15 | Failed: 12

### New Patterns
- PDF-based fee schedules extract reliably when discovered, but HTML extraction from fee pages sometimes fails despite successful classification
- Discovery skip strategy misses institutions with fee schedules; manual discovery reveals documents that automated skip would miss
- JavaScript-rendered pages present extraction challenges distinct from PDF or static HTML
- Very small fee extractions (1-2 fees) may indicate partial page scraping or summary-only content rather than complete fee schedules
- Discovery failures with vague messages suggest homepage content analysis may be incorrectly flagging non-fee pages as containing fee information

### Site Notes
- Eastrise Federal Credit Union and The Brattleboro Savings and Loan Association: HTML/JS-rendered pages classified successfully but extraction returned zero fees, suggesting layout parsing issues with certain HTML templates
- Northfield Savings Bank and One Federal Credit Union required active discovery navigation to locate fee schedules (direct links after navigation or in page links), while skipped institutions like Union Bank and Wells River Savings Bank still yielded results, indicating skip heuristic may be over-filtering
- The Brattleboro Savings and Loan Association classified as js_rendered but extraction failed despite successful page rendering classification—suggests JS rendering captures page structure but not fee table data
- Vermont Federal Credit Union, Heritage Family Federal Credit Union, 802 Federal Credit Union, Peoples Trust Company of St. Albans, and One Federal Credit Union all extracted 1-2 fees—validate whether these are complete schedules or landing page snippets
- Community National Bank, Passumpsic Savings Bank, The Bank of Bennington, Business Bank, and The First National Bank of Orwell all failed discovery with messages indicating partial matches (FDIC info, contact forms, service mentions) rather than actual fee schedules—discovery filter has false positive sensitivity issue

### Promoted to National
- PDF format institutions in VT show 100% classification success but variable extraction quality; recommend standardized PDF table extraction logic as priority over HTML/JS variants

## Run #208 — 2026-04-07
Discovered: 0 | Extracted: 13 | Failed: 14

### New Patterns
- PDF-classified documents consistently extract fees successfully, while HTML and JS-rendered pages show mixed results
- Credit unions with minimal fee schedules (1-2 fees extracted) may publish simplified or member-specific fee documents rather than comprehensive schedules
- PDF documents that fail extraction often contain no extractable fee data despite successful format classification
- Discovery failures on homepage links suggest some institutions bury fee schedule links or don't publish them on main pages
- JS-rendered pages show extraction difficulty even when classified successfully

### Site Notes
- VT: 8 of 9 PDF extractions succeeded; HTML success rate lower (2 of 3); JS-rendered pages (1 instance) failed extraction
- VT: 802 Federal Credit Union and Peoples Trust Company extracted only 1 fee each despite successful PDF classification; suggests reduced fee complexity or member-only pricing structures
- VT: 3 credit unions (Eastrise, North Country, Heritage Family) classified as PDF but returned 'no fees extracted' — documents may be general account info PDFs rather than fee schedules
- VT: Community National Bank, Passumpsic Savings Bank, The Bank of Bennington, The First National Bank of Orwell all failed discovery — may require deeper site navigation or may not publish fee schedules online
- VT: The Brattleboro Savings and Loan Association (JS-rendered) failed extraction despite successful classification — dynamic content may not expose fee data to extraction pipeline

### Promoted to National
- Consider implementing fallback discovery patterns for institutions where homepage links fail — check /fees, /rates, /schedules URLs or secondary navigation before marking as unavailable

## Run #209 — 2026-04-07
Discovered: 0 | Extracted: 16 | Failed: 11

### New Patterns
- HTML-classified pages with extraction failure may indicate fee data embedded in non-standard formats or JavaScript-rendered content not captured by static HTML parsing
- PDF-formatted fee schedules consistently extract successfully across institutions; PDF classification appears highly reliable for fee data recovery
- Credit unions with minimal fee schedules (1-2 fees extracted) may indicate simplified product offerings or incomplete fee documentation rather than extraction failure
- Discovery failures on bank homepages often occur when pages focus on marketing/services rather than compliance; institutions may require navigation to specific compliance or disclosures sections

### Site Notes
- Eastrise Federal Credit Union and The Brattleboro Savings and Loan Association both classified as html/js_rendered but extraction failed despite classification success, suggesting content structure incompatibility
- 14 of 16 successful extractions were from PDF-classified documents in VT run, with minimal variation in extraction quality across different institution types
- North Country Federal Credit Union, Vermont Federal Credit Union, Heritage Family Federal Credit Union, 802 Federal Credit Union, One Federal Credit Union all extracted 1-2 fees; pattern consistent across small credit unions
- Community National Bank, Passumpsic Savings Bank, The Bank of Bennington, The Business Bank, and The First National Bank of Orwell all failed discovery with content-mismatch errors, indicating homepage-only approach insufficient

### Promoted to National
- Skipped discover steps (no discovery attempt) consistently preceded successful classification and extraction, suggesting pre-populated institution lists may be more efficient than automated discovery for fee schedule location
