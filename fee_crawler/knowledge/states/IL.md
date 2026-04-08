# IL Fee Schedule Knowledge


## Run #203 — 2026-04-07
Discovered: 99 | Extracted: 147 | Failed: 383

### New Patterns
- HTTP/2 protocol errors causing homepage load failures
- PDF documents discovered but extraction fails despite successful classification
- Discover phase incorrectly rejects pages with embedded fee mentions
- JS-rendered pages show mixed extraction results
- HTML pages have higher extraction success rate
- Discover-skipped institutions have better downstream success
- Missing website_url data causes discover failures

### Site Notes
- BMO Bank National Association and The Northern Trust Company both failed at initial discovery due to net::ERR_HTTP2_PROTOCOL_ERROR. May require retry logic or protocol downgrade handling.
- Alliant Federal Credit Union, Citizens Equity First Federal Credit Union, and Baxter Federal Credit Union all classified as PDF but extraction returned zero fees. Suggests PDF parsing is identifying documents but not extracting content correctly.
- Multiple banks (Wintrust, Lake Forest, Hinsdale, Northbrook, Barrington, Wheaton, United Community, Village Bank, St. Charles) flagged as having fees 'mentioned but not comprehensive' or 'embedded but no visible links'. These are false negatives where fees exist but discovery logic is too strict.
- CIBC Bank USA and Parkway Bank failed extraction despite successful JS rendering classification, while First American Bank and Morton Community Bank succeeded. Suggests JS rendering alone doesn't guarantee extractable structured fee data.
- Byline Bank and State Farm Federal Credit Union both classified as HTML and successfully extracted (4 and 8 fees respectively). No HTML classified institutions failed extraction.
- All institutions with discover=skipped (presumed pre-identified URLs) proceeded to classification and had 71% extraction success rate (10/14). Discover phase failures were concentrated on novel discovery attempts.
- Old Second National Bank and State Bank of India failed discovery due to missing website_url field. These are data quality issues upstream.

### Promoted to National
- Implement HTTP/2 error recovery or fallback to HTTP/1.1 for institutions with protocol negotiation issues
- Investigate PDF extraction pipeline - classification success does not guarantee content extraction; may need separate validation for PDF content accessibility
- Discover phase filtering is too conservative for partial fee disclosures; consider separating 'comprehensive fee schedule found' from 'fee information present' to capture pages with embedded or incomplete fee data
- JS-rendered classification does not correlate with extraction success - may need post-render DOM validation to verify fee table structure presence
- HTML-native fee schedules appear more reliable than JS-rendered or PDF formats for automated extraction
- Pre-verified institution URLs significantly improve extraction outcomes; prioritize maintaining authoritative URL database over discovery for known institutions
- Implement validation gate to prevent discover attempts on institutions without verified website_url

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 38% (176/468 addressable)
- Total institutions: 530 (excluded: 62)
- Institutions with URL but no fees: needs investigation

## Run #216 — 2026-04-07
Discovered: 8 | Extracted: 150 | Failed: 380

### New Patterns
- HTTP/2 protocol errors during homepage discovery indicate potential infrastructure issues with target domains
- PDF-classified documents frequently fail extraction despite successful classification
- Product comparison/account feature pages are frequently misidentified as containing fee schedules during discovery
- Credit unions in IL show higher extraction success rate (5/8 attempted) vs. banks with PDFs (lower success)
- JS-rendered pages show mixed results with some complete extraction success
- Institutions with no website_url in data should be flagged pre-discovery

### Site Notes
- BMO Bank National Association and The Northern Trust Company both failed with net::ERR_HTTP2_PROTOCOL_ERROR, suggesting these institutions may have CDN or SSL configuration issues that block automated access
- Alliant Federal Credit Union, Citizens Equity First Federal Credit Union, and Baxter Federal Credit Union all classified as PDF but yielded zero fees. Suggests PDFs may be image-based scans or use non-standard fee table formatting
- Multiple institutions (Lake Forest Bank, First Mid Bank, Barrington Bank, Wheaton Bank, United Community Bank, Village Bank, St. Charles Bank) have discover=failed with LLM feedback noting they are product pages with 'features' but no fee schedule links
- Alliant, Citizens Equity First, Baxter, and Consumers all credit unions classified as PDF but mostly failed extraction; State Farm FCU (HTML) succeeded with 8 fees extracted
- CIBC Bank USA and Parkway Bank were JS-rendered but one succeeded (First American 37 fees) and others failed, suggesting rendering quality or content variability
- Old Second National Bank and State Bank of India wasted discovery cycles with 'no website_url' errors

### Promoted to National
- HTTP/2 errors may warrant retry logic with HTTP/1.1 fallback or increased timeouts before marking discovery as failed
- PDF classification success does not predict extraction success; implement secondary validation that PDFs contain extractable text before attempting fee parsing
- Improve discovery prompt to explicitly distinguish between account feature/comparison pages and actual fee schedule documents
- Credit union fee data may be more commonly published in HTML format than PDF; adjust discovery strategy to prioritize HTML sources for FCUs
- JS-rendered classification alone does not predict success; may need content quality checks post-rendering
- Implement pre-discovery validation to skip records without URLs rather than attempting discovery

## Run #225 — 2026-04-08
Discovered: 14 | Extracted: 154 | Failed: 376

### New Patterns
- PDF-based fee schedules extract reliably; JS-rendered pages frequently fail extraction despite successful classification
- Discover failures on account feature/marketing pages indicate institutions embed fees only in dedicated fee schedule documents, not marketing content
- JS-rendered pages with extract=failed suggest extraction rules may not be targeting dynamically-loaded fee tables or tables require interaction
- Missing website_url prevents discovery entirely; data quality issue upstream

### Site Notes
- IL credit unions (Alliant, Citizens Equity, Baxter, Consumers) using PDFs succeeded; JS-rendered banks (CIBC, Northern Trust, Morton, Parkway) classified but extracted zero fees
- Wheaton Bank, Northbrook Bank, Barrington Bank, Wintrust all failed discover on checking account pages mentioning fees—confirms fees exist but require locating separate fee schedule
- Northern Trust, CIBC, Morton Community, Parkway Bank all classified as js_rendered but yielded zero fees—extraction logic may not handle deferred rendering
- Old Second National Bank and State Bank of India had no_website_url—data source validation needed before processing

### Promoted to National
- Credit unions publishing fee schedules as PDFs show 100% extract success (5/5 in IL); banks using HTML or JS rendering show 40% extract success—consider platform-specific extraction templates by institution type
