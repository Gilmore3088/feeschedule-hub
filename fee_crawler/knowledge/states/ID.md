# ID Fee Schedule Knowledge


## Run #22 — 2026-04-06
Discovered: 6 | Extracted: 13 | Failed: 23

### New Patterns
- Footer disclosure links ('Disclosures', 'Important Notices & Policies') frequently indicate fee schedule locations but are not directly discoverable via automated link extraction
- PDF-based fee schedules that are discovered and classified correctly still fail extraction at high rates (3 out of 5 PDF discoveries failed extraction)
- JavaScript-rendered pages show mixed results: some extract successfully (Farmers Bank: 38 fees) while others fail completely (Freedom Northwest, Lewis Clark)
- Product comparison pages (checking account comparisons) do not contain fee details - users must navigate to individual product pages
- Product brochure PDFs (as opposed to fee schedule PDFs) rarely contain structured fee data suitable for extraction
- Six institutions succeeded with skipped discovery phase - indicates prior knowledge/manual seed URLs were effective for 40% of successful extractions

### Site Notes
- The Bank of Commerce and Capital Educators FCU have fee information behind footer disclosure links that standard discovery methods miss
- Freedom Northwest and Lewis Clark (both js_rendered) failed extraction despite successful classification, suggesting rendering inconsistency or dynamic content loading issues
- Idaho First Bank's checking comparison page required individual product navigation that wasn't automatically followed
- Westmark FCU published product brochures as PDFs but these were marketing materials rather than fee schedules

### Promoted to National
- PDF extraction reliability is a critical bottleneck - Trugrocer, Lookout, and Connections FCUs all had discoverable PDFs but zero fees extracted. Investigate PDF parsing/OCR quality issues.
- Manual curation of direct fee schedule URLs significantly outperforms automated discovery for this state

## Run #154 — 2026-04-07
Discovered: 3 | Extracted: 13 | Failed: 23

### New Patterns
- Footer 'Disclosures' links often point to general agreements rather than fee schedules
- Account comparison/product pages discovered but require navigation to individual account fee schedules
- PDF documents identified as fee-related by discovery still frequently fail extraction
- js_rendered pages with high discovery success rate have low extraction success rate
- Credit unions with 'All About Your Accounts' documentation structures discovered but not extracted
- Simple HTML pages consistently extract successfully across extraction attempts
- Some institutions confirmed to not publish fee schedules online

### Site Notes
- The Bank of Commerce: discovered via footer Disclosures link but contained no extractable fees
- Idaho First Bank: comparison page found but fees not on that page - may need secondary navigation
- Trugrocer Federal Credit Union, Lookout Federal Credit Union, Connections Federal Credit Union: all PDFs classified but extraction failed - suggests PDF content is image-based or poorly structured
- Bank of Commerce, Potlatch, Freedom Northwest, Lewis Clark: all js_rendered but 3/4 failed extraction despite successful classification
- Potlatch No. 1 Financial: found structured account documentation but no fees extracted
- Ireland Bank, Cottonwood Community, Advantage Plus: HTML classified pages all extracted 31-36 fees successfully
- Idaho Central Federal Credit Union, D.L. Evans Bank, Westmark Federal Credit Union, Northwest Bank: discovery pages show product information/rates pages only, no fee schedule content exists or is not publicly available

### Promoted to National
- PDF extraction reliability is inconsistent; may indicate need for OCR verification or manual review workflow
- JavaScript-rendered fee schedule pages may use dynamic content loading or obfuscated fee tables that resist structured extraction
- HTML-based fee schedules show 100% extraction success vs 60% for other formats in this run

## Run #162 — 2026-04-07
Discovered: 2 | Extracted: 15 | Failed: 21

### New Patterns
- JS-rendered pages consistently fail extraction despite successful classification
- PDF documents show high extraction success rate
- Product comparison and brochure pages fail discovery and don't contain fee details
- HTML static pages show strong extraction success
- Account detail landing pages require further navigation to reach actual fee schedules

### Site Notes
- Idaho Central FCU succeeded with js_rendered, but Bank of Commerce, Potlatch No. 1, Freedom Northwest, and Lewis Clark FCU all failed extraction on js_rendered content. Suggests inconsistent rendering or dynamic content loading issues.
- Frontier Federal (39 fees), Pioneer Federal (47 fees), Lookout Federal (55 fees) all extracted successfully from PDFs. One failure (Trugrocer Federal) suggests PDF content issue rather than format problem.
- Westmark Federal Credit Union and Idaho First Bank discovery failed on account comparison/brochure pages. These pages link to products but not to fee schedules.
- First Federal Savings Bank of Twin Falls (29 fees), Beehive FCU (31), Ireland Bank (30), Cottonwood Community (32), and Advantage Plus (36) all succeeded with html classification.
- D.L. Evans Bank discovery failed on account details page that only shows links without actual fee content. Navigation required but not automated.

### Promoted to National
- JS_rendered classification does not guarantee extractable fee data; requires validation that dynamic content fully populates before extraction
- PDF-based fee schedules are most reliable extraction source; prioritize PDF discovery
- Account comparison pages are false positives; discovery should skip or distinguish from actual fee schedule pages
- Static HTML fee schedules reliably extract; good fallback when dynamic content fails

## Run #168 — 2026-04-07
Discovered: 1 | Extracted: 16 | Failed: 20

### New Patterns
- PDF-based fee schedules from credit unions extract reliably when discovered, but HTML/JS_rendered pages from same institution type show inconsistent extraction
- JS_rendered pages consistently fail extraction even when classified successfully
- Discovery failures on policy/disclosure pages that lack actual fee schedules
- HTML pages with direct fee schedule content extract at high volume (25+ fees per institution)

### Site Notes
- Frontier Federal Credit Union (PDF, 37 fees), Pioneer Federal Credit Union (PDF, 47 fees), Lookout Federal Credit Union (PDF, 55 fees) all succeeded. Contrast with Potlatch No. 1, Freedom Northwest, Lewis Clark, Trugrocer (all js_rendered or unclear format, all failed extraction despite classification success).
- The Bank of Commerce, Potlatch No. 1 Financial, Freedom Northwest, Lewis Clark Federal Credit Union all classified as js_rendered but extraction failed with 'no fees extracted'. Idaho Central Federal Credit Union was the only js_rendered success (1 fee).
- D.L. Evans Bank (product-specific checking page), Capital Educators (404), Northwest Bank (agreements/policies only), Idaho First Bank (general information links) all failed discovery because target pages didn't contain fee schedules despite being policy-adjacent.
- First Federal Savings Bank of Twin Falls (HTML, 29 fees), Beehive Federal Credit Union (HTML, 31 fees), Ireland Bank (HTML, 31 fees), Cottonwood Community (HTML, 32 fees), Farmers Bank (js_rendered but likely HTML base, 39 fees).

### Promoted to National
- Credit unions publishing fee schedules as standalone PDFs have higher extraction success than those embedding in web pages; may indicate need for format-specific extraction strategies
- JS-rendered content represents systematic extraction weakness; may require enhanced DOM parsing or content stabilization before extraction attempt
- Financial institutions often have 'disclosures' or 'policies' sections that don't contain fee schedules; discovery URLs need validation that page contains actual fee data, not just regulatory boilerplate
- Pure HTML fee schedules deliver reliable, high-volume extraction; may indicate these institutions use more standardized fee table markup

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 60% (18/30 addressable)
- Total institutions: 36 (excluded: 6)
- Institutions with URL but no fees: needs investigation
