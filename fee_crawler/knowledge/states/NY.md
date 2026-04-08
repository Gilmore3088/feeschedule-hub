# NY Fee Schedule Knowledge


## Run #97 — 2026-04-07
Discovered: 91 | Extracted: 163 | Failed: 229

### New Patterns
- PDF discovery failures often stem from access restrictions (403/Forbidden) rather than content absence
- JS-rendered pages show mixed extraction success despite proper classification
- PDF classification success does not guarantee fee extraction
- Discovery skip (no initial attempt) sometimes precedes successful extraction
- HTML pages with direct navigation links to fee disclosures show highest extraction success

### Site Notes
- NBT Bank: Fee schedule PDF found but returns 403 Forbidden when accessed, indicating potential bot-blocking or authentication requirements on file URLs
- Flagstar Bank and Dime Community Bank: js_rendered pages successfully extracted fees (3-4 items), while Popular Bank and Tompkins Community Bank js_rendered pages failed extraction despite classification success
- The Bank of New York Mellon, NBT Bank, Broadview Federal Credit Union, and Amalgamated Bank all classified as PDF but extraction failed - suggests PDF parsing or fee-specific content recognition issues
- Morgan Stanley Private Bank, United Nations Federal Credit Union, and Flushing Bank were skipped at discovery stage but successfully extracted 30, 50, and 37 fees respectively - indicates skip logic may be too conservative
- Teachers Federal Credit Union: 'Disclosures & Fees' in main navigation yielded 58 fees; NBT Bank and Manufacturers and Traders Trust Company direct links also successful

### Promoted to National
- Security/challenge pages and corporate investment banking disclosure pages are common false positives - Goldman Sachs and Deutsche Bank show landing page misdirection requiring better URL validation before discovery attempt

## Run #124 — 2026-04-07
Discovered: 8 | Extracted: 165 | Failed: 227

### New Patterns
- Security challenge pages block discovery - sites using aggressive bot protection (e.g., Goldman Sachs) fail at discover stage with 'security challenge page' messages
- PDF-classified documents show mixed extraction results - some PDFs extract successfully (NBT Bank: 46 fees, Flushing Bank: 37 fees, Broadview Federal: 0 fees) while others fail despite proper classification
- JS-rendered pages show high failure rate in extraction phase - Popular Bank, Teachers Federal Credit Union, Esl Federal Credit Union, Tompkins Community Bank all classify as js_rendered but fail extraction
- Discovery failures split into three categories: (1) security/bot detection, (2) missing/invalid website_url, (3) wrong page type discovered (comparison pages, about pages, financial performance pages)
- Credit unions show inconsistent fee publication behavior - some publish fully (United Nations FCU: 45 fees, ESL FCU: classified but no extraction), others don't publish online at all (missing website_url)
- High extraction failure rate on successfully classified content (13 failed extractions after classify=ok) suggests content is present but not in expected format or structure

### Site Notes
- Goldman Sachs Bank USA returns only basic legal links behind security layer
- Broadview Federal Credit Union and Amalgamated Bank: PDF classified as ok but extraction failed - suggests PDF parsing inconsistency
- 4 of 4 JS-rendered pages in NY dataset failed at extraction despite successful classification
- Deutsche Bank, Apple Bank, Fourleaf Federal Credit Union discovered pages are tangentially finance-related but not fee schedules
- Community Bank, State Bank of India, Bank of China, Bank of Baroda all have 'no website_url' - may not maintain public-facing fee schedules
- Pattern across multiple institutions: Popular Bank, Teachers Federal, ESL Federal, Broadview Federal, Amalgamated Bank, Tompkins - all classify correctly but yield 'no fees extracted'

### Promoted to National
- Implement retry logic or alternative discovery methods for security-protected institutional sites
- PDF format alone doesn't guarantee extractable content; may require additional validation step for PDF structure/OCR quality
- JS-rendered content classification doesn't correlate with extraction success - may indicate dynamic content loading issues or fee data embedded in scripts rather than DOM
- Improve discovery filtering to exclude comparison pages, about pages, and financial highlights pages that match finance keywords but lack fee data
- Some institution types (particularly smaller regional/international banks) may not publish fee schedules online; document as unlocatable rather than extraction failure
- Extraction templates may not match regional/institution-specific fee table layouts; requires layout analysis of failed extractions to identify missing patterns
