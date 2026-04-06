# National Fee Schedule Knowledge Base

## CMS & Platform Patterns
- WordPress sites: fee schedules often at /wp-content/uploads/fee-schedule.pdf
- Kentico CMS: all pages are JS-rendered, always use Playwright
- Wix/Squarespace: PDFs hosted on CDN (cdn.prod.website-files.com), check document links
- Sites with <5KB homepage HTML are almost always JS-rendered

## Document Type Handling
- ~40% of bank/CU sites are JS-rendered and need Playwright
- Scanned PDFs: pdfplumber returns empty text, need OCR fallback
- Link index pages (e.g., Space Coast Credit Union): page lists links to fee schedule PDFs/pages, must follow sub-links
- Rate schedule PDFs often contain some fees but are mostly rate tables — extract what's there but expect low fee count

## Discovery Patterns
- Fee schedules are often 3-4 clicks deep under Disclosures/Resources/Documents
- Always check /disclosures page and scan all PDFs there
- Direct link detection: scan link text for "fee schedule", "schedule of fees", "truth in savings" before asking Claude
- Common paths that work: /fee-schedule, /fees, /disclosures, /rates-and-fees, /forms-and-disclosures
- Credit union patterns: /members/fees, /learn/information/fee-schedule, /rates/fee-schedule

## Common Failure Modes
- "Download is starting" Playwright error: URL is a direct PDF download, can't navigate to it — use requests.get() instead
- Sites with only privacy/terms disclosures but no fee schedule
- Trust companies and wealth management firms don't have consumer fee schedules
- Small community banks/CUs (<$1M assets) often don't publish fee schedules online — skip after first verification

## Extraction Tips
- Claude Haiku with tool_use (extract_fees tool) is reliable and cheap (~$0.002/institution)
- Send up to 12K chars of document text (was 8K, increased for better coverage)
- Broader system prompt listing all common fee categories improves extraction
- Always build fee_categories from extractor output, never trust Claude to re-categorize

## Promoted — 2026-04-06
- Discovery strategy may need to expand beyond dedicated 'fee schedule' pages to capture institutions that disclose fees inline on product pages

## Promoted — 2026-04-06
- PDF classification success does not guarantee extractable fee content. Implement post-classification validation to detect fee-bearing vs. non-fee PDFs before extraction.
- JS-rendered pages need content inspection post-rendering; classification alone insufficient. Rendering quality or timing may affect fee table accessibility.
- Implement pre-discovery validation: check for 404 status and confirm page content type before attempting discovery. About Us and account features pages are common false positives.
- HTML documents appear most reliable for fee extraction. Prioritize HTML format detection and scraping strategies.
- Low fee counts may indicate institutions with minimal published fee structures; validate against known fee-bearing account types to confirm data completeness.

## Promoted — 2026-04-06
- Add /disclosures to standard discovery paths for all institutions
- JS-rendered fee schedule extraction needs debugging; may require explicit wait for specific DOM elements or different parsing approach
- Prioritize PDF discovery paths and consider format-specific extraction strategies
- Develop institution-type-specific URL patterns for credit unions (e.g., /fees, /fee-schedule, /service-charges) to bypass homepage discovery

## Promoted — 2026-04-06
- Extraction failure on PDFs warrants secondary validation—some PDFs may require OCR or manual review before marking as processed
- JavaScript-rendered content requires renderer capability verification; current extraction may need post-render content stabilization
- Credit union fee schedules often exist in separate documents from disclosure agreements; discovery logic should distinguish fee schedules from general disclosures
- Skipped discovery stages may indicate pre-loaded document URLs; validate whether these represent cached/known URLs versus genuine discovery gaps
- Low extraction counts may reflect actual minimal fee publications rather than extraction failure—validate against institution size and product scope

## Promoted — 2026-04-06
- JS-rendered fee schedules may require enhanced DOM parsing or post-render content analysis; current extraction logic may miss fees in dynamically-loaded tables or interactive elements
- PDF documents remain most reliable format for fee schedule extraction; prioritize PDF discovery for efficiency gains
- Skipped discovery should trigger URL validation check to catch broken resource links before classification
- Implement URL freshness validation between discovery and extraction phases, especially for PDF resources
- Single-digit fee extractions from institutional pages warrant secondary verification; may signal extraction coverage gaps or institution-specific limited fee disclosures
- Discovery algorithm should recognize indirect fee references ('service charges,' 'account fees,' 'pricing') as discovery signals, not just explicit 'fee schedule' links
