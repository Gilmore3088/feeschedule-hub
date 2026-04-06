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
