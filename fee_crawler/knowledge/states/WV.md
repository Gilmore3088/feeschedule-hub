# WV Fee Schedule Knowledge


## Run #52 — 2026-04-07
Discovered: 20 | Extracted: 33 | Failed: 83

### New Patterns
- JS-rendered pages with fee content often fail extraction despite successful discovery
- PDF fee schedules consistently extract successfully; HTML pages with embedded fees struggle
- Many small/regional banks have no discoverable fee information on homepages
- Security barriers and redirects block discovery
- Skipped institutions (no pre-discovery attempted) sometimes succeed when classification/extraction attempted

### Site Notes
- Jefferson Security Bank and The Grant County Bank: discovered fee-related content on JS-rendered pages but extraction failed or returned minimal fees (3 vs expected higher count). JS rendering may not fully load fee tables.
- WesBanco (PDF: 27 fees), Putnam County Bank (PDF: 26 fees), and Pioneer Appalachia (PDF: 33 fees) all succeeded. CNB Bank (HTML: 0 fees extracted) and Fairmont Federal Credit Union (PDF found but 0 fees extracted) show format matters.
- 13 institutions failed discovery with 'No links found on homepage' (MVB Bank, Citizens Bank of WV, Huntington Federal, Community Bank of Parkersburg, West Union Bank, FNB Bank, Davis Trust, Bank of Monroe, Capon Valley, Williamstown Bank). Consistent pattern suggests many WV banks may not publish fee schedules online.
- Potomac Bank blocked by security service; The Citizens Bank of Weston failed with DNS resolution error. These require alternative access strategies beyond standard crawling.
- WesBanco, CNB Bank, Bayer Heritage, First Choice America, Putnam County, and Logan Bank & Trust were skipped at discovery but reached classification. Suggests pre-existing knowledge of document location or direct URLs being used.

### Promoted to National
- None

## Run #58 — 2026-04-07
Discovered: 3 | Extracted: 33 | Failed: 83

### New Patterns
- Skip-to-classify strategy effective for known publishers
- Homepage link discovery fails frequently for smaller institutions
- Extract failures from successfully classified documents indicate OCR or formatting issues
- JS-rendered pages show mixed extraction results

### Site Notes
- WesBanco, CNB Bank, Bayer Heritage FCU, First Choice America FCU, Putnam County Bank, Fairmont FCU, Jefferson Security Bank, Hancock County Savings Bank, The Grant County Bank, Logan Bank & Trust, Pioneer Appalachia FCU all skipped discovery and proceeded directly to classification with high success rates (5/7 successful extractions from skipped cases)
- 11 WV institutions failed at discover stage with 'No links found on homepage' - Citizens Bank of WV, MVB Bank, Clear Mountain Bank, Huntington Federal Savings, Community Bank of Parkersburg, West Union Bank, FNB Bank, Davis Trust Company, Bank of Monroe, Capon Valley Bank, Williamstown Bank. Suggests smaller regional banks often lack explicit fee schedule links on landing pages.
- CNB Bank (HTML), Fairmont FCU (PDF), Jefferson Security Bank (JS rendered), and Hancock County Savings Bank (PDF) all classified correctly but yielded zero fees. Suggests content exists but is inaccessible to extraction engine - possible image-based PDFs or JavaScript-rendered tables.
- Jefferson Security Bank (js_rendered, 0 fees extracted) vs The Grant County Bank (js_rendered, 3 fees extracted). JS rendering classification doesn't guarantee extractability.

### Promoted to National
- Small community banks in rural regions rarely publish fee schedules with discoverable links - direct URL guessing or phone contact may be required for non-compliance cases

## Run #61 — 2026-04-07
Discovered: 2 | Extracted: 33 | Failed: 83

### New Patterns
- Banks with 'No links found on homepage' failures may not publish fee schedules online at all
- PDF-based fee schedules show higher extraction success than HTML or JS-rendered pages
- js_rendered classification may mask extraction failures in dynamically-loaded fee content
- Cloudflare blocking and DNS resolution failures are hard stops
- Discovery can misclassify privacy notices and rates pages as potential fee sources
- Credit unions show more consistent online fee publication than small community banks

### Site Notes
- WV institutions failing discovery with this error: MVB Bank, Citizens Bank of WV, Community Bank of Parkersburg, West Union Bank, FNB Bank, Davis Trust Company, Bank of Monroe
- WV PDFs: WesBanco (27/27), Putnam County (26/26), Fairmont FCU (0/extracted), Hancock County (0/extracted). HTML/JS pages: Jefferson Security (0), Grant County (3/extracted), Logan Bank (39/extracted). PDF classification matches better with extraction outcomes when content exists.
- Jefferson Security Bank and Grant County Bank both classified as js_rendered; one extracted 0 fees, other extracted 3. Suggests JavaScript rendering may not be fully capturing fee tables.
- Potomac Bank (Cloudflare), Citizens Bank of Weston (ERR_NAME_NOT_RESOLVED) — both permanently unrecoverable without access changes
- MCNB Bank (privacy notice found but no fees), The Poca Valley (account comparison table), Huntington Federal (PDF with mixed content), West Virginia Central (rates page only)
- FCU extraction wins: Bayer Heritage (14), First Choice America (44), Fairmont FCU classified, Pioneer Appalachia (35). Community banks show higher discovery failure rates.

### Promoted to National
- Consider marking institutions with repeated 'no links found' as likely non-publishers after 2-3 failed attempts rather than continuing to retry
- Optimize PDF parsing pipeline; HTML extraction appears inconsistent even when classified correctly
- Review js_rendered extraction logic; consider enhanced DOM waiting strategies for fee schedule tables
- Categorize Cloudflare/network access failures separately; cannot be solved by extraction improvements
- Improve discovery filtering to distinguish rates/privacy pages from fee schedules; reduces wasted classify/extract cycles
- May warrant separate extraction strategies or expectation-setting by institution type

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 36% (36/101 addressable)
- Total institutions: 116 (excluded: 15)
- Institutions with URL but no fees: needs investigation
