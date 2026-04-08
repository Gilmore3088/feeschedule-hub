# OK Fee Schedule Knowledge


## Run #69 — 2026-04-07
Discovered: 49 | Extracted: 81 | Failed: 146

### New Patterns
- JS-rendered pages with 'Disclosures' links discover successfully but often fail extraction
- Skipped discoveries with successful extractions indicate pre-identified institution URLs
- PDF fee schedules show high extraction success rates
- Credit unions with js_rendered content show lower fee counts
- Product pages and Terms pages are mislabeled discovery targets
- Direct fee schedule links vs. disclosure navigation has different success rates
- Some institutions lack publicly accessible online fee schedules

### Site Notes
- Armstrong Bank and Communication Federal Credit Union both had discoverable Disclosures links via js_rendered pages, but Armstrong Bank failed extraction while Communication Federal Credit Union succeeded with only 4 fees. Suggests inconsistent fee table formatting across js_rendered disclosure pages.
- RCB Bank, First Fidelity Bank, Ttcu Federal Credit Union, Gateway First Bank, Regent Bank, and International Bank of Commerce were skipped but classified/extracted successfully, suggesting these institutions were accessed via direct URLs rather than discovery navigation.
- BOKF (17 fees), American Heritage Bank (40 fees), and Sovereign Bank (10 fees) all successfully extracted from PDFs. Contrast with js_rendered pages which show mixed results.
- Tinker Federal Credit Union (js_rendered, 1 fee) and Communication Federal Credit Union (js_rendered, 4 fees) extracted significantly fewer fees than banks with PDFs or standard HTML.
- Multiple failures occurred on product pages (Stride Bank), checking account pages (MidFirst Bank), Terms & Conditions pages (InterBank), and Terms of Use pages (Mabrey Bank). These are frequently returned by search/navigation but lack comprehensive fee schedules.
- BOKF and American Heritage Bank with 'Direct fee schedule link' language had 100% extraction success. Armstrong Bank and Communication Federal Credit Union with 'Disclosures link' language had 50% extraction success.
- Multiple consecutive failures (MidFirst Bank, First United Bank and Trust Company, BancFirst, InterBank, Stride Bank, Bank 7, Mabrey Bank, Weokie Federal Credit Union) suggest these institutions may not publish comprehensive fee schedules online or place them behind login walls.

### Promoted to National
- Consider maintaining a pre-vetted URL list for institutions with known fee schedule locations to bypass unreliable discovery methods.
- PDF-based fee schedules are more reliably parseable than HTML or js_rendered content.
- Implement content classification to distinguish product pages and legal terms pages from actual fee schedule documents during discovery.

## Run #75 — 2026-04-07
Discovered: 6 | Extracted: 85 | Failed: 142

### New Patterns
- JS-rendered pages show extraction challenges
- Discovery failure on generic pages masking fee content
- PDF format shows strongest extraction success rate
- HTML-classified pages with zero extraction
- Skipped discovery followed by successful extraction

### Site Notes
- Armstrong Bank and Tinker FCU both classify as js_rendered but Armstrong fails extraction while Tinker succeeds (1 fee). Suggests rendering quality or fee visibility varies significantly in JS-heavy pages.
- MidFirst Bank, InterBank, and Stride Bank all failed discovery on what appear to be wrapper/landing pages (privacy, T&Cs, about pages). Suggests these institutions may hide fee schedules behind secondary navigation rather than linking directly.
- BOKF (17 fees), Ttcu FCU (48 fees), American Heritage (41 fees), and Sovereign (9 fees) all use PDFs with successful extractions. No PDF-classified institution failed extraction in OK sample.
- RCB Bank classified as HTML but extracted no fees. Suggests HTML format may contain fee information in structures resistant to current extraction logic (tables, nested divs, etc.)
- 6 institutions had discovery skipped but still achieved extraction (BOKF 17, Ttcu FCU 48, First Fidelity 34, Armstrong failed, Communication 4, Gateway 13, Regent 33, Great Plains 8, IBC 47, American Heritage 41, Sovereign 9). Manual URLs appear to be working.

### Promoted to National
- Financial institutions increasingly place fee schedules in non-obvious locations; discovery may need to explore secondary navigation paths beyond homepage links
- PDF-hosted fee schedules demonstrate consistent extractability; prioritize PDF discovery

## Run #86 — 2026-04-07
Discovered: 3 | Extracted: 87 | Failed: 140

### New Patterns
- JS-rendered pages require full browser rendering for fee extraction
- Product pages (checking/savings account pages) frequently fail at discovery stage
- Skipped discovery with successful extraction indicates pre-identified document URLs
- PDF format consistently yields higher extraction counts
- HTML pages with extraction failures may indicate unstructured or sparse fee presentations
- Homepage and About pages are poor discovery targets

### Site Notes
- Tinker FCU, Communication FCU, and Gateway First Bank successfully extracted fees from JS-rendered pages, confirming this format is viable when properly rendered
- MidFirst Bank and Stride Bank discovery failed on product pages; these pages lack comprehensive fee schedules and redirect to Terms & Conditions
- BOKF, RCB Bank, Armstrong Bank, and others were skipped to direct URLs, suggesting a secondary discovery method (possibly prior research or CMS patterns) bypassed initial crawling
- BOKF (17), Ttcu FCU (26), American Heritage Bank (41), Sovereign Bank (10) show PDFs capture more structured fee data than HTML or JS-rendered content
- RCB Bank and Armstrong Bank extract=failed despite classification success; HTML pages may lack standardized fee table markup
- First United, BancFirst, Bank 7, and Mabrey Bank discovery failed on homepages and About pages; institutions do not surface fee schedules prominently

### Promoted to National
- Establish direct URL discovery methods for institutions with skipped discovery; 11 of 27 institutions used this path, indicating viable pre-research or CMS-pattern approach worth systematizing

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 43% (96/221 addressable)
- Total institutions: 227 (excluded: 6)
- Institutions with URL but no fees: needs investigation
