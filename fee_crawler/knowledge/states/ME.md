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
