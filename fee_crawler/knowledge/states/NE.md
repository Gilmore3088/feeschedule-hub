# NE Fee Schedule Knowledge


## Run #31 — 2026-04-07
Discovered: 42 | Extracted: 49 | Failed: 143

### New Patterns
- JS-rendered pages (credit union sites) consistently fail extraction despite successful classification
- PDF documents from financial institutions extract reliably with high fee counts
- Discovery fails when fee schedules are gated behind navigation elements or filter interfaces
- Skipped discovery followed by successful extraction indicates pre-identified/cached document sources
- Checking account product pages without direct fee schedule links rarely contain extractable fee data

### Site Notes
- Centris Federal Credit Union and Cobalt Federal Credit Union both classified as js_rendered but yielded zero fees on extraction
- Security First Bank (37 fees), Adams Bank & Trust (41 fees), Core Bank (38 fees), Dayspring Bank (32 fees), Nebraskaland Bank (32 fees) all PDF-based with strong extraction
- Pinnacle Bank has Documents filter where fees likely exist but discovery failed; Cornerstone Bank succeeded by finding PDF from checking accounts page
- 9 institutions with skipped discovery all had successful classification/extraction (First National Bank, Security First Bank, Adams Bank & Trust, Dayspring Bank, etc.)
- Exchange Bank, Elkhorn Valley Bank & Trust, Heartland Bank all had checking pages that were dead-ends for fee discovery

### Promoted to National
- JS-rendered fee schedules may require enhanced rendering or different extraction strategies; consider deprioritizing or flagging for manual review
- PDF-hosted fee schedules are highest-confidence sources; prioritize PDF discovery and classification
- Sites with dynamic filtering or gated document access require deeper navigation strategy beyond homepage/main pages
- Maintain and leverage document caches; skipped discovery doesn't indicate missing data
- Checking account landing pages are unreliable discovery sources; search for dedicated 'Fee Schedule' or 'Disclosures' sections instead

## Run #40 — 2026-04-07
Discovered: 2 | Extracted: 52 | Failed: 140

### New Patterns
- PDF-based fee schedules are highly reliable for extraction
- JavaScript-rendered pages consistently fail fee extraction
- Skipped discover phase with successful PDF/HTML extraction indicates pre-identified document sources
- Checking account pages without explicit fee schedule links are discovery dead-ends
- HTML pages with low extraction counts may indicate incomplete fee tables

### Site Notes
- Security First Bank (39 fees), Adams Bank & Trust (28 fees), Core Bank (38 fees), Nebraskaland Bank (33 fees), Dayspring Bank (30 fees) all successfully extracted from PDFs with high fee counts
- Centris Federal Credit Union and Cobalt Federal Credit Union both classified as js_rendered with zero fees extracted
- 10 of 12 successful extractions were skipped at discovery (PDF/HTML sources likely known), while 14 failed discoveries suggest institutions lack easily discoverable fee pages
- Multiple failures on checking account pages (Union Bank, Pinnacle Bank, Exchange Bank, Midwest Bank, etc.) that describe features but lack fee schedule navigation
- First National Bank of Omaha (6 fees) and Platte Valley Bank (4 fees) from HTML sources extracted significantly fewer fees than PDF sources

### Promoted to National
- Institutions publishing fee schedules as PDFs show 100% extraction success in NE; prioritize PDF discovery paths
- js_rendered content type should trigger manual review or alternative discovery method; JavaScript rendering may hide fee table content
- High failure rate in discovery phase correlates with institutions that don't publish fee schedules at standard URLs; manual institutional research may be needed
- Generic account feature pages should be deprioritized in discovery; look for dedicated 'fees' or 'pricing' navigation items instead
- HTML-extracted data shows quality variance; validate completeness against PDF versions when available

## Run #46 — 2026-04-07
Discovered: 4 | Extracted: 55 | Failed: 137

### New Patterns
- PDF-based fee schedules extract with high success rates (52, 43, 37, 35, 32 fees per institution) while HTML and JS-rendered pages yield lower counts (1-6 fees)
- Skipped discovery (no URL provided to discover agent) consistently leads to successful extraction when documents are PDFs, suggesting pre-identified PDF URLs bypass discovery bottleneck
- Discovery failures on general account pages show agent cannot distinguish between account feature descriptions and actual fee schedule content
- JS-rendered pages consistently underperform in extraction (Pinnacle Bank: 3 fees, Centris Federal: 1 fee, Cobalt Federal: 0 fees extracted despite classification success)
- 404 errors and Terms of Use pages are incorrectly routed to discovery; these should be filtered pre-discovery to reduce wasted runs

### Site Notes
- Security First Bank (52 fees), Adams Bank & Trust (43 fees), Dayspring Bank (35 fees), Core Bank (37 fees), Nebraskaland Bank (32 fees) — all skipped discovery but extracted successfully; indicates manual PDF URL lookup is viable fallback strategy
- Union Bank and Trust (product descriptions), Five Points Bank (loan forms), Elkhorn Valley Bank (account features), Midwest Bank (navigation links) — all rejected as containing no fee info despite being bank pages
- Cobalt Federal Credit Union classified as js_rendered but extract failed completely — suggests rendering occurred but fee data structure not parseable by current extraction method
- American National Bank (404), Cornhusker Bank (404), First State Bank Nebraska (Terms of Use), BankFirst (Privacy Policy) account for 4 failed discoveries

### Promoted to National
- PDF documents appear to be the primary format for comprehensive fee data in banking; prioritize PDF discovery and classification
- JavaScript-rendered fee content presents extraction challenges; may require DOM inspection or different parsing approach
