# ME Fee Schedule Knowledge


## Run #19 — 2026-04-06
Discovered: 25 | Extracted: 40 | Failed: 30

### New Patterns
- JS-rendered pages with fee schedule links often fail extraction despite successful discovery/classification
- HTML and PDF formats show higher extraction success rates in Maine
- Some institutions publish fee schedules on secondary pages rather than homepages
- Institutions mixing terms/privacy content with fee disclosures confuse discovery
- PDF format consistently delivers complete fee data

### Site Notes
- Bangor Savings Bank, Bar Harbor Bank & Trust, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union all classified as js_rendered but extraction failed with 'no fees extracted'
- Machias Savings Bank (html, 42 fees), Norway Savings Bank (html, 42), Kennebunk Savings Bank (pdf, 35), Atlantic Regional Federal Credit Union (pdf, 43) all succeeded
- Maine Savings Federal Credit Union: fee schedule found on 'Privacy, Security & Disclosures' page; The Camden National Bank: account details links appear nested on intermediate pages
- First National Bank, Partners Bank of New England, Skowhegan Savings Bank all failed discovery on pages containing general disclosures/T&Cs but no fee schedules
- Kennebunk Savings Bank (35 fees), Franklin Savings Bank (pdf classified but extraction failed), Atlantic Regional FCU (43 fees) - high yield when PDF extraction works

### Promoted to National
- JS rendering may not be capturing dynamic fee table content properly - extraction logic may need adjustment for rendered DOM state or timing issues
- Static content formats (HTML, PDF) are more reliable for fee extraction than JS-rendered pages in this state
- Discovery strategy should systematically check compliance/disclosures/security pages, not just homepage and primary navigation
- Need better filtering to distinguish between general disclosure pages and actual fee schedule pages during discovery phase
- Prioritize PDF extraction reliability; current PDF failures in ME may indicate extraction logic gaps specific to banking fee PDFs

## Run #173 — 2026-04-07
Discovered: 9 | Extracted: 40 | Failed: 30

### New Patterns
- JS-rendered pages classify correctly but frequently fail extraction despite successful discovery/classification
- PDF-format fee schedules have high extraction success rate
- Static HTML pages show consistent high-yield extraction
- Discovery failures often misidentify page content (rates pages, disclosures pages, about pages labeled as 'no fee content')

### Site Notes
- Bangor Savings Bank, Bar Harbor Bank & Trust, Androscoggin Savings Bank, Katahdin Trust Company, Evergreen Federal Credit Union, Maine Savings Federal Credit Union all show this pattern - page renders, but extraction yields no fees
- Kennebunk Savings Bank (35 fees), Atlantic Regional Federal Credit Union (42 fees), Franklin Savings Bank attempted - PDFs contain structured fee data
- Machias Savings Bank (42), Norway Savings Bank (42), Maine Community Bank (3), Saco & Biddeford Savings Institution (17) all succeeded with html classification
- Katahdin Trust Company and Evergreen Federal Credit Union: discovery succeeded ('Direct fee schedule link found'), but extraction failed - suggests fee schedule page found but content parsing broken
- Camden National Bank (rates page), First National Bank (disclosures), Kennebec Savings Bank (about page), Skowhegan Savings Bank (privacy policy), Maine State Federal Credit Union - discovery classifies these correctly as non-fee pages

### Promoted to National
- JS-rendered fee schedule pages need enhanced extraction logic; current approach may not be parsing dynamically-loaded fee tables correctly
- Prioritize PDF discovery links; PDF extraction is more reliable than HTML/JS rendering for fee schedules
- HTML-classified pages have highest success rate; focus crawler on static HTML fee schedule pages
- Track discovery success + extraction failure separately; may indicate extraction logic broken specifically for certain page structures, not discovery failure
- Discovery module works; these are true negatives confirming institutions don't have accessible online fee schedules in standard locations

## Run #177 — 2026-04-07
Discovered: 0 | Extracted: 41 | Failed: 29

### New Patterns
- JS-rendered pages consistently fail extraction despite successful classification
- PDF format shows mixed but generally successful extraction
- HTML static pages show highest success rate
- Discovery failures on wrong page types are well-categorized
- Discover=skipped followed by classify=ok and extract outcomes suggests URLs were pre-identified

### Site Notes
- Bangor Savings Bank, Bar Harbor Bank & Trust, Androscoggin Savings Bank, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union all classify as js_rendered but extract=failed with 'no fees extracted'. Suggests dynamic content loading issue or fees hidden behind additional navigation not captured by JS rendering.
- Franklin Savings Bank (PDF, extract=failed) contrasts with Kennebunk Savings Bank, Atlantic Regional Federal Credit Union (both PDF, extract=ok). PDF format alone doesn't guarantee success; content structure within PDFs varies significantly.
- Maine Community Bank (HTML, extract=failed) is exception; Machias Savings Bank, Norway Savings Bank, Saco & Biddeford Savings Institution (all HTML) extracted successfully. HTML extraction is most reliable when it succeeds.
- Multiple discover=failed results correctly identified non-fee pages: funds availability policies, general disclosures, About Us pages, Terms & Conditions, privacy policies, board/management pages. Discovery logic working as intended to reject irrelevant pages.
- All successful extractions (Northeast Bank, Machias Savings Bank, Norway Savings Bank, Kennebunk Savings Bank, Bath Savings Institution, Saco & Biddeford Savings Institution, Atlantic Regional Federal Credit Union) had skipped discovery but proceeded to classification. Pre-identified URLs bypass discovery step entirely.

### Promoted to National
- JS-rendered fee schedule pages require enhanced JavaScript execution or multi-step navigation handling; current approach misses content

## Run #187 — 2026-04-07
Discovered: 0 | Extracted: 40 | Failed: 30

### New Patterns
- JS-rendered pages consistently fail extraction even when classified correctly
- PDF and HTML static pages show high extraction success rates
- Discovery failures on non-fee-schedule pages indicate weak page classification before discovery
- Credit unions with HTML/PDF formats succeed; those with JS rendering fail

### Site Notes
- Bangor Savings Bank, Bar Harbor Bank & Trust, Androscoggin Savings Bank, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union all classify as js_rendered but extract fails with 'no fees extracted'
- Franklin Savings Bank (PDF, 58 fees), Atlantic Regional Federal Credit Union (PDF, 47 fees), Kennebunk Savings Bank (PDF, 36 fees), Machias Savings Bank (HTML, 41 fees), Norway Savings Bank (HTML, 42 fees) all succeeded
- The Camden National Bank (rates page), First National Bank (disclosures page), Kennebec Savings Bank (About Us page), Partners Bank (login page), Skowhegan Savings Bank (privacy policy), Maine State Federal (checking overview) were misdirected to discovery
- Atlantic Regional Federal Credit Union (PDF) extracted 47 fees successfully; Maine Savings Federal Credit Union and Evergreen Federal Credit Union (both JS) failed extraction

### Promoted to National
- JS-rendered fee schedule pages may require additional rendering time or DOM inspection before extraction; current extraction logic may not be waiting for dynamic content to fully load
- Static format fee schedules (PDF/HTML) are reliable extraction targets; prioritize these formats over JS-rendered content
- Pre-discovery filtering needed to avoid wasting discovery agent effort on pages that are obviously not fee schedules; implement page-type pre-classification
- Credit union fee schedules follow same format vulnerability pattern as banks
