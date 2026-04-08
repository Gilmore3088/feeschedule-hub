# VT Fee Schedule Knowledge

## Run #222 — 2026-04-07 (Latest)
Discovered: 0 | Extracted: 14 | Failed: 13

### Key Patterns
- **PDF extraction**: 14 of 16 successful extractions from PDFs; highly reliable format
- **HTML/JS-rendered pages**: Higher failure rates despite successful classification; content structure incompatibility
- **Minimal fee extractions (1-2 fees)**: Consistent pattern across small credit unions; likely reflects actual simplified product offerings, not extraction failure
- **Discovery failures**: Often match regulatory/insurance pages rather than fee schedules; homepage-only approach insufficient for some institutions
- **Skipped discovery**: Pre-populated institution URLs preceded successful classification/extraction; may be more efficient than automated discovery

### Problem Institutions (Require Investigation)
- **Failed discovery (no URL found)**: Community National Bank, Passumpsic Savings Bank, Bank of Bennington, Business Bank, First National Bank of Orwell—may not publish online or require deeper navigation
- **PDF classified, extraction failed**: Heritage Family FCU, One FCU—likely malformed PDFs or non-standard fee formatting
- **HTML/JS classified, extraction failed**: Eastrise FCU, Brattleboro Savings & Loan—may lack dedicated fee schedule sections; content structure incompatible with extraction

### Validation Needed
- Confirm whether minimal extractions (Peoples Trust, Vermont FCU, 802 FCU, North Country FCU) represent complete schedules or incomplete page scraping
- Validate institutions with no discoverable fee schedules via manual research or confirm non-publication status

### Promoted to National
- PDF classification unreliable signal for extraction viability; implement fallback discovery patterns (/fees, /rates, /schedules URLs) before marking unavailable
- Consider secondary validation for HTML/JS extraction failures; may require OCR or manual review
## Run #223 -- Pass 1 (tier1) — 2026-04-07
Discovered: 0 | Extracted: 14 | Failed: 13

### New Patterns
- PDF-formatted fee schedules extract successfully at higher rates than HTML or JavaScript-rendered pages
- Credit union fee schedules often contain minimal fees (1-2 items) compared to banks (26-52 items)
- Certain institution types (federal credit unions) consistently fail extraction despite successful classification
- Discovery failures on regulatory/compliance pages indicate homepage links point to irrelevant content
- JavaScript-rendered pages show extraction failure even when classified successfully

### Site Notes
- VT institutions: 9/11 PDF extractions succeeded vs 2/3 HTML and 0/1 js_rendered. PDFs appear more structured for fee data.
- VT credit unions averaging 11 fees vs banks averaging 39 fees. Vermont Federal CU, 802 Federal CU, One Federal CU all extracted 1-2 fees only.
- Eastrise, North Country, and Heritage Family federal credit unions: classified as extractable but yielded zero fees. Suggests format variance within credit union documents.
- Community National Bank, Bank of Bennington both failed discovery on regulatory pages; suggests weak internal link structure to fee schedules.
- Brattleboro Savings and Loan classified as js_rendered but extracted zero fees, suggesting rendering or DOM structure issues in fee table parsing.

### Promoted to National
- Prioritize PDF fee schedule documents in discovery and extraction pipelines; they show more reliable fee data encoding
- Credit unions may publish abbreviated fee schedules; validate that extraction completeness is institution-specific, not a data quality issue
- Federal credit union PDFs may use non-standard fee table layouts; develop specialized extraction rules for FCUA-affiliated institutions
- Implement secondary discovery strategy: search institution websites directly for 'fee schedule' or 'pricing' rather than relying on homepage navigation
- JavaScript-rendered fee schedules may require DOM-specific selectors; current extraction likely incomplete for client-side rendered content

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 65% (17/26 addressable)
- Total institutions: 27 (excluded: 1)
- Institutions with URL but no fees: needs investigation
