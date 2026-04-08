# NM Fee Schedule Knowledge


## Run #142 — 2026-04-07
Discovered: 16 | Extracted: 29 | Failed: 37

### New Patterns
- JS-rendered pages with fee schedules extract successfully when properly classified, suggesting dynamic content loading is common for credit union fee pages
- PDF-based fee schedules consistently yield high extraction counts (Sunward: 25, InBank: 35, First Financial: 45), indicating PDFs are reliable publication format
- Discovery failures on privacy/about pages suggest institutions mix fee schedule links with compliance content; page classification matters before discovery
- Direct fee schedule links found post-navigation (InBank, Pioneer Bank, Rio Grande FCU) indicate fee pages are not always homepage-prominent
- HTML-classified pages show mixed extraction success (Pioneer Bank failed despite discovery; Lea County State Bank succeeded with 23 fees)
- Extraction failure despite successful discovery and classification (Pioneer Bank, Kirtland FCU, Rio Grande FCU) suggests content exists but parsing/template mismatch

### Site Notes
- U.S. Eagle FCU, Del Norte FCU, Sandia Area FCU, Rio Grande FCU all classified as js_rendered; most extract succeeded except Rio Grande
- NM credit unions heavily favor PDF publication; 5 of 6 successful PDF classifications extracted successfully
- First American Bank, Century Bank, Citizens Bank of Las Cruces all failed on non-fee pages; CNB Bank had no website_url
- InBank and Pioneer Bank both found via navigation; Rio Grande found via /rates-and-fees path discovery
- Pioneer Bank: discovered but extracted no fees from HTML; Western Commerce Bank extracted only 2 fees from HTML
- 3 institutions had content found but no structured fees extracted—likely custom HTML layouts or table structures not matching extraction templates

### Promoted to National
- PDF fee schedules are highest-confidence discovery and extraction targets
- Secondary navigation paths and URL pattern exploration needed when homepage discovery fails
- Extraction template mismatch is distinct failure mode worth investigating for scaling

## Run #153 — 2026-04-07
Discovered: 1 | Extracted: 32 | Failed: 34

### New Patterns
- Electronic Fund Transfer Disclosure documents are reliable sources for fee information
- JavaScript-rendered pages show mixed extraction results despite successful classification
- PDF-based fee schedules are highly reliable for extraction
- Rates and account feature pages are unreliable fee sources even when they mention fees casually
- Some institutions bury fee schedules deeply or don't link from homepage; may require direct URL patterns or sitemap discovery

### Site Notes
- First American Bank: EFT disclosure successfully yielded 6 fees when initial discovery pointed to rates page
- Rio Grande Federal Credit Union: js_rendered page classified successfully but failed to extract fees (0 results)
- Multiple credit unions (Nusenda, Sunward, InBank, First Financial) with PDF fee schedules achieved consistent extraction; InBank yielded 33 fees from single PDF
- Century Bank and Citizens Bank of Las Cruces: discovery failed on rates/accounts pages with partial fee mentions; these pages don't link to comprehensive fee schedules
- Four Corners Community Bank and The Citizens Bank: homepage analysis failed to find navigation links to fee schedules

### Promoted to National
- Include EFT disclosure documents in discovery heuristics for banking institutions
- JS-rendered pages require validation that content actually loads fee tables; classification success doesn't guarantee extractable fee content
- Prioritize PDF fee schedule discovery; they show higher yield and consistency than HTML or JS pages

## Run #166 — 2026-04-07
Discovered: 0 | Extracted: 31 | Failed: 35

### New Patterns
- JavaScript-rendered pages successfully classify and extract, but occasionally fail to extract fees despite proper rendering
- PDF-based fee schedules show high extraction yields when present
- Homepage discovery failures correlate with minimal or no fee-related navigation
- HTML-based fee pages extract low volumes when successful (1-6 fees)

### Site Notes
- Rio Grande Federal Credit Union and Del Norte Federal Credit Union both use js_rendered format; Rio Grande failed extraction while Del Norte succeeded with 12 fees. Suggests rendering quality or fee table structure inconsistency.
- Nusenda (5), InBank (35), and First Financial (43) all PDFs with strong extraction. Kirtland Federal Credit Union PDF failed extraction entirely—likely corrupted or unusual PDF structure.
- Century Bank and Citizens Bank of Las Cruces failed discovery due to inline fee mentions without dedicated links. Four Corners Community Bank and The Citizens Bank had no discoverable fee links on homepage.
- First American Bank (html, 6 fees), Pioneer Bank (html, 1 fee), Western Commerce Bank (html, 2 fees). HTML extraction yields significantly lower than PDF or js_rendered equivalents.
- CNB Bank failed discovery due to missing website_url in source data—data quality issue upstream, not discovery failure.

### Promoted to National
- js_rendered content requires validation that fee tables are actually present post-render, not just that page loads
- PDF extraction success rate high; failures warrant manual review for PDF quality issues rather than process failure
- Homepage link-discovery method misses institutions with embedded/inline fee disclosure; secondary search strategy needed for fee pages not linked from homepage
- HTML fee pages may contain less structured data or fewer products; validation needed on whether low extraction reflects actual fee count or extraction method limitation
