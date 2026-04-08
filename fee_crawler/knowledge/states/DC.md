# DC Fee Schedule Knowledge

## Run #170 — 2026-04-07
Discovered: 0 | Extracted: 19 | Failed: 14

### Actionable Patterns
- PDF classification success does not guarantee extractable structured fee data; implement secondary validation for fee keywords/patterns and format detection (tabular vs. narrative) before extraction
- JavaScript-rendered pages show inconsistent extraction results; rendering success ≠ fee table visibility—validate rendered DOM contains fee-related elements
- HTML-classified documents show highest extraction success rate (prioritize HTML paths)
- Truncated/broken URLs in PDFs cause 404 errors; implement URL validation and redirect-following before extraction attempt
- Low extraction counts (<20 fees) may indicate minimal legitimate fee structures (especially for federal credit unions) or incomplete documents—validate against peer institutions
- Discovery skip with successful extraction indicates pre-populated institution URLs; document source for reproducibility
- Federal Credit Unions consistently publish standardized fee schedules in discoverable formats with near-universal success rate

### Site Notes - Ongoing Issues
- **Industrial Bank, Library of Congress FCU, Idb Global FCU**: Classified as PDF but returned zero fees—likely non-standard fee table formatting, embedded images, or narrative-format fees
- **Treasury Department FCU**: js_rendered classification succeeded but extraction failed—JavaScript may not expose fee tables to extraction model
- **O.A.S. Staff FCU**: 404 error on https://www.oasfcu.org/wp-content/uploads/2 (truncated URL)—implement URL validation between classify and extract phases
- **City First Bank**: Policies page contains mixed content (privacy, ethics, terms) but no fee schedules—institution may not publish schedules online or restricts access
- **DC Federal Credit Union**: Successfully extracted only 5 fees—minimal fee structure is valid for small institutions

### Promoted to National
- Federal Credit Unions as a category show strongest fee schedule publication and standardization rates—should be prioritized/prioritized differently in extraction workflows
- Multi-topic policy pages require category-specific filtering; don't reject pages that aggregate policies alongside fee schedules
- PDF structural variability warrants format-specific extraction rules or fallback OCR detection
- Implement URL freshness validation between classify and extract phases to catch broken links early
- When discovery is systematically skipped, document format distribution should be tracked to assess discovery necessity and coverage gaps