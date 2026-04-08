# PA Fee Schedule Knowledge


## Run #96 — 2026-04-07
Discovered: 78 | Extracted: 162 | Failed: 234

### New Patterns
- PDF documents with fee content successfully classify but fail extraction, suggesting OCR or parsing limitation with specific PDF formats or encoding
- HTML and js_rendered formats show significantly higher extraction success rates than PDFs
- Skipped discovery (empty parentheses) paradoxically correlates with successful extraction in multiple cases
- js_rendered classification shows 100% extraction success rate in this dataset (3/3 institutions: Police & Fire FCU, Members 1st FCU extracted 0, Peoples Security extracted 0—correction: 1/3)
- Connection failures during extraction indicate infrastructure fragility on larger institutions
- Discover failures on product-specific pages and About Us pages indicate need for improved homepage/navigation targeting
- PDF extraction failures cluster but aren't absolute; Orrstown Bank (48 fees) and American Heritage FCU (3 fees) also succeeded with PDFs

### Site Notes
- First National Bank of PA, Fulton Bank, BNY Mellon, First Commonwealth Bank all discovered and classified as PDFs but yielded zero extracted fees despite successful classification
- Customers Bank (HTML: 3 fees), Dollar Bank (HTML: 44 fees), Police & Fire FCU (js_rendered: 13 fees), S&T Bank (PDF exception: 63 fees) show HTML/JS substantially outperform most PDFs
- Customers Bank, Dollar Bank, S&T Bank, Police & Fire FCU, Members 1st FCU, Citadel FCU, Orrstown Bank, American Heritage FCU all skipped discovery yet most successfully extracted fees
- Members 1st FCU and Peoples Security Bank both js_rendered but failed extraction despite proper classification, contradicting HTML success pattern
- First Commonwealth Bank: 'Connection reset by peer' during extraction despite successful discover/classify stages
- TriState Capital Bank (treasury mgmt page), Northwest Bank (product page), Univest Bank (homepage had no links), FirstTrust Savings (About Us page), CNB Bank (FAQ page) all failed discovery on wrong page types
- S&T Bank extracted 63 fees from PDF—demonstrates extraction *is* possible with PDFs; First Commonwealth and BNY Mellon failures may be format-specific rather than PDF-category wide

### Promoted to National
- PDF extraction pipeline needs debugging—classification accuracy doesn't guarantee content accessibility; may indicate need for alternative PDF parsing strategy
- Prioritize HTML and JavaScript-rendered pages over PDFs; PDF extraction appears systematically problematic across multiple institutions
- Discovery skip logic may be masking successful alternative pathways; re-examine skip conditions—may indicate URLs were pre-known or default paths are working
- JavaScript rendering classification alone insufficient; requires investigation into whether dynamic content loading or anti-scraping measures prevent fee table recognition
- Implement retry logic and connection pooling for extraction phase; timeout/reset errors disproportionately affect otherwise successful classification workflows
- Implement page-type detection before discovery attempt; route away from product/about pages toward fees/disclosures sections
- PDF issue is format-variant specific, not categorical; analyze Orrstown/S&T/American Heritage successful PDFs for encoding/structure patterns absent in failed cases

## Run #126 — 2026-04-07
Discovered: 6 | Extracted: 165 | Failed: 231

### New Patterns
- PDF-classified documents frequently fail extraction despite successful classification
- JavaScript-rendered pages show mixed but usable results
- HTML-classified pages have highest success rate in this run
- Discovery skip-then-classify pattern masks potential upstream failures
- Network connection failures concentrated in PDF extraction phase

### Site Notes
- First National Bank of PA, Fulton Bank, BNY Mellon, First Commonwealth Bank all classified as PDF but yielded zero fees or connection errors. Indicates PDF parsing/structure issues rather than discovery problems.
- Police & Fire FCU (12 fees) and Members 1st FCU (failed) both js_rendered. One succeeded, one failed—suggests rendering approach is functional but inconsistent.
- Customers Bank (3), Dollar Bank (44), Citadel FCU (25), Mid Penn Bank (4) all HTML-classified with extraction success. Contrasts sharply with PDF failure cluster.
- 16 institutions skipped discovery but proceeded to classify/extract. Three major national banks (BNY Mellon, First National, Fulton) followed this path and failed extraction despite PDF classification success.
- First Commonwealth Bank connection reset (error 54) during PDF extraction—infrastructure stress or PDF-specific timeout issue

### Promoted to National
- PDF fee schedules require specialized parsing beyond generic classification—may need document structure analysis or OCR validation before extraction attempt
- JS rendering infrastructure is working; failures are content-specific rather than technical
- HTML fee schedules are more reliably extractable than PDF—prioritize HTML discovery paths
- Skipping discovery in favor of direct classification may bypass important link/structure validation—reconsider workflow ordering

## Run #210 — 2026-04-07
Discovered: 5 | Extracted: 169 | Failed: 227

### New Patterns
- PDF-classified documents with no fees extracted suggest OCR or parsing failures on scanned PDFs
- HTML and js_rendered pages show higher extraction success rates than PDFs
- JavaScript-rendered pages occasionally contain fee data despite complex rendering
- Connection errors on PDF sources may indicate temporary hosting issues rather than missing data
- Discover failures on investor relations and product-specific pages are correctly identified
- Credit unions publishing fee schedules online show higher compliance than banks

### Site Notes
- First National Bank of PA, Fulton Bank, BNY Mellon, S&T Bank all classified as PDF but yielded zero fees — likely image-based PDFs requiring OCR
- Customers Bank (HTML, 3 fees), Dollar Bank (HTML, 44 fees), Police & Fire FCU (js_rendered, 14 fees), and credit unions with js_rendered content succeeded where most PDFs failed
- Police & Fire FCU and Members 1St FCU both classified as js_rendered; former extracted 14 fees, latter extracted none — suggests inconsistent JavaScript handling
- First Commonwealth Bank: Connection reset by peer error during PDF extraction — suggests server instability, not missing content
- TriState Capital (investor relations) and Northwest Bank (product page) both failed discover — system correctly rejected off-topic pages
- Credit unions (Police & Fire, PA State Employees, Citadel, Mid Penn, American Heritage) all successfully extracted; more consistently publish schedules than large banks

### Promoted to National
- Implement OCR preprocessing for PDF documents before extraction; current extraction fails silently on scanned fee schedules
- Prioritize scraping HTML/js_rendered formats over PDFs; consider deprioritizing PDF extraction without OCR capability
- js_rendered classification needs refinement to predict which pages will successfully extract after rendering
- Implement retry logic with backoff for connection-reset errors; may recover data on retry
- Discover filter is working as intended; these rejections are accurate
- Credit unions may be more reliable sources for fee schedule discovery overall
