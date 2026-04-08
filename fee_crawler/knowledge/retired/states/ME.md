
## Pruned 2026-04-07

## Run #173 — 2026-04-07
## Run #177 — 2026-04-07
## Run #187 — 2026-04-07
## Run #19 — 2026-04-06
### New Patterns
### Site Notes
- All successful extractions (Northeast Bank, Machias Savings Bank, Norway Savings Bank, Kennebunk Savings Bank, Bath Savings Institution, Saco & Biddeford Savings Institution, Atlantic Regional Federal Credit Union) had skipped discovery but proceeded to classification. Pre-identified URLs bypass discovery step entirely.
- All successfully extracted institutions in ME used static HTML or PDF formats (Machias, Norway, Kennebunk, Bath, Saco & Biddeford, Atlantic Regional FCU, Town & Country FCU). No failures among these formats.
- Atlantic Regional Federal Credit Union (PDF) extracted 47 fees successfully; Maine Savings Federal Credit Union and Evergreen Federal Credit Union (both JS) failed extraction
- Bangor Savings Bank, Bar Harbor Bank & Trust, Androscoggin Savings Bank, Katahdin Trust Company, Evergreen Federal Credit Union, Maine Savings Federal Credit Union all show this pattern - page renders, but extraction yields no fees
- Bangor Savings Bank, Bar Harbor Bank & Trust, Androscoggin Savings Bank, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union all classify as js_rendered but extract fails with 'no fees extracted'
- Bangor Savings Bank, Bar Harbor Bank & Trust, Androscoggin Savings Bank, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union all classify as js_rendered but extract=failed with 'no fees extracted'. Suggests dynamic content loading issue or fees hidden behind additional navigation not captured by JS rendering.
- Bangor Savings Bank, Bar Harbor Bank & Trust, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union all classified as js_rendered but extraction failed with 'no fees extracted'
- Camden National Bank (rates page), First National Bank (disclosures), Kennebec Savings Bank (about page), Skowhegan Savings Bank (privacy policy), Maine State Federal Credit Union - discovery classifies these correctly as non-fee pages
- Camden National, First National, Kennebec Savings, Partners Bank, Skowhegan, Maine State FCU all failed discover on generic pages (rates pages, About Us, privacy policy, checking account pages without fee links). Landing pages don't contain direct fee schedule links.
- Consider whether discover skip represents prior knowledge/direct linking that should be formalized as a discovery bypass strategy for known-good sources.
- Credit union fee schedules follow same format vulnerability pattern as banks
- Credit unions with HTML/PDF formats succeed; those with JS rendering fail
- Discover skipped for 22 of 41 institutions, yet 7 still achieved successful extraction. Skipped discover may indicate pre-populated or direct URLs used. Success rates suggest discover skip is not blocking extraction if correct page already identified.
- Discover step failures indicate poor linking from checking/account pages to fee schedules
- Discover=skipped followed by classify=ok and extract outcomes suggests URLs were pre-identified
- Discovery failures often misidentify page content (rates pages, disclosures pages, about pages labeled as 'no fee content')
- Discovery failures on non-fee-schedule pages indicate weak page classification before discovery
- Discovery failures on wrong page types are well-categorized
- Discovery module works; these are true negatives confirming institutions don't have accessible online fee schedules in standard locations
- Discovery strategy should systematically check compliance/disclosures/security pages, not just homepage and primary navigation
- First National Bank, Partners Bank of New England, Skowhegan Savings Bank all failed discovery on pages containing general disclosures/T&Cs but no fee schedules
- Franklin Savings Bank (PDF, 58 fees), Atlantic Regional Federal Credit Union (PDF, 47 fees), Kennebunk Savings Bank (PDF, 36 fees), Machias Savings Bank (HTML, 41 fees), Norway Savings Bank (HTML, 42 fees) all succeeded
- Franklin Savings Bank (PDF, extract=failed) contrasts with Kennebunk Savings Bank, Atlantic Regional Federal Credit Union (both PDF, extract=ok). PDF format alone doesn't guarantee success; content structure within PDFs varies significantly.
- HTML and PDF formats show higher extraction success rates in Maine
- HTML and PDF formats show reliable extraction success
- HTML static pages show highest success rate
- HTML-classified pages have highest success rate; focus crawler on static HTML fee schedule pages
- Institutions mixing terms/privacy content with fee disclosures confuse discovery
- JS rendering may not be capturing dynamic fee table content properly - extraction logic may need adjustment for rendered DOM state or timing issues
- JS-rendered fee schedule pages may require additional rendering time or DOM inspection before extraction; current extraction logic may not be waiting for dynamic content to fully load
- JS-rendered fee schedule pages need enhanced extraction logic; current approach may not be parsing dynamically-loaded fee tables correctly
- JS-rendered fee schedule pages require either improved rendering wait times or alternative extraction strategies. Current approach is unreliable for this format.
- JS-rendered fee schedule pages require enhanced JavaScript execution or multi-step navigation handling; current approach misses content
- JS-rendered pages classify correctly but frequently fail extraction despite successful discovery/classification
- JS-rendered pages consistently fail extraction despite successful classification
- JS-rendered pages consistently fail extraction even when classified correctly
- JS-rendered pages consistently fail extraction even when classified successfully
- JS-rendered pages with fee schedule links often fail extraction despite successful discovery/classification
- Katahdin Trust Company and Evergreen Federal Credit Union: discovery succeeded ('Direct fee schedule link found'), but extraction failed - suggests fee schedule page found but content parsing broken
- Kennebunk Savings (PDF, 36 fees), Atlantic Regional FCU (PDF, 47 fees), Town & Country FCU (PDF, 38 fees) all succeeded. Franklin Savings Bank (PDF, classified ok) failed extraction despite PDF format—suggests content encoding or structure variation within PDFs.
- Kennebunk Savings Bank (35 fees), Atlantic Regional Federal Credit Union (42 fees), Franklin Savings Bank attempted - PDFs contain structured fee data
- Kennebunk Savings Bank (35 fees), Franklin Savings Bank (pdf classified but extraction failed), Atlantic Regional FCU (43 fees) - high yield when PDF extraction works
- ME banks with js_rendered classification (Bangor Savings, Bar Harbor, Northeast, Androscoggin, Katahdin, Maine Savings FCU, Evergreen FCU) all failed extraction with 'no fees extracted'. Dynamic content may not be fully rendering or fee data loaded via JS is not being captured by extraction logic.
- Machias Savings Bank (42), Norway Savings Bank (42), Maine Community Bank (3), Saco & Biddeford Savings Institution (17) all succeeded with html classification
- Machias Savings Bank (html, 42 fees), Norway Savings Bank (html, 42), Kennebunk Savings Bank (pdf, 35), Atlantic Regional Federal Credit Union (pdf, 43) all succeeded
- Maine Community Bank (HTML, extract=failed) is exception; Machias Savings Bank, Norway Savings Bank, Saco & Biddeford Savings Institution (all HTML) extracted successfully. HTML extraction is most reliable when it succeeds.
- Maine Savings Federal Credit Union: fee schedule found on 'Privacy, Security & Disclosures' page; The Camden National Bank: account details links appear nested on intermediate pages
- Many institutions bury fee schedules behind multiple clicks or in non-obvious page locations. Consider expanding discovery patterns to search for 'disclosure', 'schedule of fees', 'service charges' in footer links, help sections, and account-specific sub-pages.
- Multiple discover=failed results correctly identified non-fee pages: funds availability policies, general disclosures, About Us pages, Terms & Conditions, privacy policies, board/management pages. Discovery logic working as intended to reject irrelevant pages.
- Need better filtering to distinguish between general disclosure pages and actual fee schedule pages during discovery phase
- PDF and HTML static pages show high extraction success rates
- PDF classified institutions with extraction success warrant investigation of PDF handling
- PDF extraction is viable but inconsistent. Investigate whether PDF failures correlate with image-based PDFs vs. text-based PDFs, or specific fee table structures.
- PDF format consistently delivers complete fee data
- PDF format shows mixed but generally successful extraction
- PDF-format fee schedules have high extraction success rate
- Pre-discovery filtering needed to avoid wasting discovery agent effort on pages that are obviously not fee schedules; implement page-type pre-classification
- Prioritize PDF discovery links; PDF extraction is more reliable than HTML/JS rendering for fee schedules
- Prioritize PDF extraction reliability; current PDF failures in ME may indicate extraction logic gaps specific to banking fee PDFs
- Prioritize discovery targeting HTML/PDF fee disclosures. Static document formats are extraction-reliable; focus crawler improvements on identifying and directing to these formats rather than JS-rendered pages.
- Some institutions publish fee schedules on secondary pages rather than homepages
- Static HTML pages show consistent high-yield extraction
- Static content formats (HTML, PDF) are more reliable for fee extraction than JS-rendered pages in this state
- Static format fee schedules (PDF/HTML) are reliable extraction targets; prioritize these formats over JS-rendered content
- The Camden National Bank (rates page), First National Bank (disclosures page), Kennebec Savings Bank (About Us page), Partners Bank (login page), Skowhegan Savings Bank (privacy policy), Maine State Federal (checking overview) were misdirected to discovery
- Track discovery success + extraction failure separately; may indicate extraction logic broken specifically for certain page structures, not discovery failure
Discovered: 0 | Extracted: 40 | Failed: 30
Discovered: 0 | Extracted: 41 | Failed: 29
Discovered: 25 | Extracted: 40 | Failed: 30
Discovered: 9 | Extracted: 40 | Failed: 30

