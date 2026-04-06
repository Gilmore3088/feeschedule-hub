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
