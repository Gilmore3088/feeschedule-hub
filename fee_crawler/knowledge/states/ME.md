# ME Fee Schedule Knowledge

## Run #213 — 2026-04-07
Discovered: 0 | Extracted: 39 | Failed: 31

### Core Patterns
- **JS-rendered pages consistently fail extraction** despite successful classification; dynamic content loading or fee data not captured by extraction logic
- **HTML and PDF static formats show reliable extraction success**; prioritize these over JS-rendered pages
- **PDF extraction inconsistent**: text-based PDFs succeed (Kennebunk 36, Atlantic Regional 47, Town & Country 38); some fail despite correct classification (Franklin)—investigate encoding/structure variations
- **Discovery gaps**: many institutions bury fee schedules behind multiple clicks or non-obvious locations (secondary pages, footer links, help sections, account-specific sub-pages)
- **Discover skip doesn't block extraction**: 22 of 41 institutions skipped discovery yet 7 achieved successful extraction, suggesting pre-identified/direct URLs are viable bypass strategy

### Maine-Specific Institutions Still Requiring Attention
**JS-rendered failures (extraction fails with 'no fees extracted')**:
- Bangor Savings Bank, Bar Harbor Bank & Trust, Northeast Bank, Androscoggin Savings Bank, Katahdin Trust Company, Maine Savings Federal Credit Union, Evergreen Federal Credit Union

**Successfully extracted** (use as comparison models):
- HTML: Machias Savings Bank (41), Norway Savings Bank (42), Bath Savings Institution, Saco & Biddeford Savings Institution
- PDF: Kennebunk Savings Bank (36), Atlantic Regional Federal Credit Union (47), Town & Country Federal Credit Union (38)

**Discovery misdirections** (generic pages returned instead of fee schedules):
- Camden National Bank, First National Bank, Kennebec Savings Bank, Partners Bank, Skowhegan Savings Bank, Maine State Federal Credit Union

### Promoted to National
- JS-rendered fee schedules require improved rendering wait times or alternative extraction strategies
- Expand discovery patterns to target secondary pages: 'disclosure', 'schedule of fees', 'service charges' in footer links, help sections, account-specific sub-pages
- Investigate PDF failures for image-based vs. text-based PDF correlation
- Formalize discover-skip as discovery bypass strategy for known-good sources