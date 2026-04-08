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
