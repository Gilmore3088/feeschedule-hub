# PR Fee Schedule Knowledge


## Run #25 — 2026-04-06
Discovered: 3 | Extracted: 2 | Failed: 6

### New Patterns
- Spanish-language fee disclosures use 'Divulgaciones' or 'Divulgación de cargos' as standard terminology
- PDF-based fee schedules extract successfully; JavaScript-rendered pages fail extraction despite successful classification
- Credit unions with restricted access (membership-only) use 'Documents' pages containing only administrative forms, not fee schedules
- Navigation-required discovery more successful than homepage-only searches for PR institutions
- Direct PDF links with proper Spanish titles (Divulgación) yield 100% successful extraction; generic document pages yield 0%

### Site Notes
- FirstBank PR and Puerto Rico FCU both use Spanish disclosure titles; effective search term for PR institutions
- Caribe Federal CU classified as js_rendered but extraction returned zero fees; suggests rendering limitation or fee data embedded in non-standard format
- Puerto Rico Employee Groups FCU and others show documents pages with forms/ACH/loan apps but no fee data; membership requirement may gatekeep fee schedule placement
- Vapr FCU required navigation to find fee schedule; Banco Popular and Oriental Bank failed with homepage-only approach
- FirstBank (14 fees) and Vapr (30 fees) both had titled PDFs; Puerto Rico FCU had titled PDF but extraction failed—possible OCR or format variance

### Promoted to National
- Spanish-language institutions standardize on 'Divulgación(es)' for fee schedules; useful for expanding to other Spanish-speaking regions
- JS-rendered financial disclosures may require specialized extraction handling beyond standard classification

## Run #26 — 2026-04-06
Discovered: 1 | Extracted: 3 | Failed: 5

### New Patterns
- PDF documents labeled as disclosure/BRA forms may contain fee schedules even when not explicitly linked from main checking pages
- JavaScript-rendered pages with fee information present extraction challenges even after successful classification
- Credit unions in PR frequently publish PDFs with fee schedules but validation often returns empty results despite successful extraction
- Institutions with document pages focused on membership/loan forms rather than disclosures are reliable discovery failures
- Oriental Bank's checking accounts page lacks visible fee schedule links or embedded disclosures—may require alternative discovery paths (fees in account terms, PDF downloads)

### Site Notes
- Banco Popular: BRA-985.pdf successfully yielded 2 fees despite no obvious fee schedule link on main pages
- Caribe Federal Credit Union: classified as js_rendered but extraction failed with no fees found—suggests rendering or fee table structure issues beyond initial classification
- Vapr Federal Credit Union extracted 31 fees successfully but validation showed empty results—possible fee format or validation logic mismatch
- Puerto Rico Employee Groups Federal Credit Union: document page contains only forms/applications, no fee schedule location
- Oriental Bank: standard checking page discovery failed; consider PDF search or terms/conditions pages

### Promoted to National
- None

## Run #27 — 2026-04-06
Discovered: 0 | Extracted: 3 | Failed: 5

### New Patterns
- JavaScript-rendered pages (js_rendered) present extraction challenges even after successful classification
- Product navigation pages without direct fee schedule links are discovery dead-ends
- Document pages mixing multiple content types (forms, applications, authorizations) can contain fee schedules but are easily misclassified or skipped
- PDF extraction success varies significantly by institution even within same financial institution type

### Site Notes
- Caribe Federal Credit Union classified as js_rendered but extraction failed with no fees found—suggests rendering may not fully execute fee schedule display logic
- Oriental Bank homepage is a product navigation page with no visible fee schedule disclosure links—discovery fails at this page type
- Puerto Rico Employee Groups Federal Credit Union documents page discovered only membership forms/applications; likely contains fee schedules in mixed content but discovery heuristic failed
- Banco Popular extracted 2 fees from PDF while FirstBank extracted 14 from PDF and Vapr extracted 31—suggests fee schedule completeness/structure differs substantially across Puerto Rico institutions

### Promoted to National
- Credit unions in Puerto Rico show mixed online disclosure patterns—some have clear PDF fee schedules (Vapr, Caribe) while others embed fees in documents pages or lack homepage visibility

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 38% (3/8 addressable)
- Total institutions: 8 (excluded: 0)
- Institutions with URL but no fees: needs investigation
