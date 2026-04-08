# DE Fee Schedule Knowledge


## Run #17 — 2026-04-06
Discovered: 9 | Extracted: 15 | Failed: 17

### New Patterns
- Discovery success rate higher when explicit 'Rates & Fees' or 'Fee Schedule' navigation links present vs. relying on homepage content analysis
- PDF fee documents discovered but extraction fails - likely due to unstructured layouts or image-based PDFs
- Skipped discovery (no action taken) followed by successful extraction indicates classifier/extractor can work without discovery phase
- HTTP/2 protocol errors on specific institutional websites - potential systematic blocking or infrastructure issues
- Trust companies and investment-focused institutions redirect to corporate/investment banking fee pages rather than consumer account fees

### Site Notes
- Dexsta Federal Credit Union succeeded with direct fee schedule link; Louviers Federal Credit Union found 'Rates & Fees' link but extraction failed on js_rendered content
- Santander Bank, BNY Mellon Trust of Delaware, and Louviers all had discoverable fee documents but zero fee extraction
- Del-One FCU, Dover FCU, Tidemark FCU, Community Powered FCU, Delaware State Police FCU all skipped discovery but extracted successfully - suggests pre-indexed or cached URLs
- PNC Bank failed with net::ERR_HTTP2_PROTOCOL_ERROR suggesting server misconfiguration or bot detection
- Deutsche Bank Trust Company Delaware and Stifel Trust Company (no website) appear to publish corporate rather than consumer fee schedules
- Barclays Bank Delaware: explicit 'Truth-in-Savings Disclosure and Fees' section discovered in HTML but extraction failed - indicates page structure mismatch with extraction templates

### Promoted to National
- None

## Run #172 — 2026-04-07
Discovered: 4 | Extracted: 16 | Failed: 16

### New Patterns
- Homepage HTTP/2 protocol errors prevent discovery on some major banks
- FAQ pages and inline fee information without dedicated links are difficult for automated discovery
- JavaScript-rendered pages require specific handling but may still fail extraction
- PDF fee schedules generally extract successfully while HTML pages show higher failure rates
- Discovery success doesn't guarantee extraction success
- Navigation-based fee schedule discovery works better than homepage searching
- Skipped discover steps indicate pre-known direct URLs may bypass failed discovery attempts
- Pages describing investment products or trust services often misclassified as fee schedules

### Site Notes
- PNC Bank homepage fails with net::ERR_HTTP2_PROTOCOL_ERROR - may require retry logic or protocol downgrade
- Wilmington Savings Fund Society (FAQ format) and Community Bank Delaware (inline fees) failed discovery despite containing fee information
- Louviers Federal Credit Union uses js_rendered format, discovery succeeds but extraction yields zero fees
- PDF documents (Santander, Del-One, Dover, Tidemark, Dexsta) all extracted 6-44 fees; HTML extraction more inconsistent
- Barclays Bank Delaware, BNY Mellon Trust, and Louviers all passed discovery but yielded zero extracted fees despite finding documents
- Santander and Louviers succeeded by finding links in main navigation rather than relying on homepage content
- TD Bank entities and credit unions with known URLs were skipped but still extracted successfully via classify/extract pipeline
- Deutsche Bank Trust Company, Applied Bank discovery attempts found irrelevant documents (investment costs, online banking agreements)

### Promoted to National
- None

## Run #174 — 2026-04-07
Discovered: 0 | Extracted: 16 | Failed: 16

### New Patterns
- discover=skipped followed by successful extraction indicates pre-populated URLs bypass discovery entirely
- PDF classification with successful extraction (20-44 fees) indicates credit unions systematically publish fee schedules as PDF documents
- discover=failed with vague LLM explanations indicates weak discovery prompts identifying wrong page types
- extract=failed despite successful classification indicates extraction logic fails on valid document types
- Homepage load failures (net::ERR_HTTP2_PROTOCOL_ERROR) indicate browser automation infrastructure issues, not content unavailability

### Site Notes
- TD Bank, Santander, Barclays, Wilmington Trust, Del-One FCU, Dover FCU, Tidemark FCU, Dexsta FCU, BNY Mellon Trust, Louviers FCU, Community Powered FCU, Delaware State Police FCU all skipped discovery but proceeded to extract—suggests pre-loaded website_url field in source data
- Santander (20), Del-One (37), Tidemark (38), Dexsta (37) all PDF-classified and high-yield. Credit unions appear more accessible than banks
- Wilmington Savings (About page confusion), Comenity (empty page), Artisans (T&C misdirection), Community Bank (checking features), Applied Bank (Online Agreement), Deutsche Bank (investment banking), Eagle One (nav menu)—suggests discovery LLM conflates related pages with actual fee schedules
- Barclays Bank Delaware (html), BNY Mellon Trust (pdf), Louviers FCU (js_rendered) classified but extracted zero fees—suggests format-specific parsing issues or documents lacking structured fee tables
- PNC Bank homepage failed at protocol level—recommend retry with different user-agent or HTTP/1.1 fallback rather than marking as undiscoverable

### Promoted to National
- 0% discovery success with 100% classification success indicates pre-population strategy is masking discovery method effectiveness—recommend re-running with discovery enabled on sample to assess true discovery capability

## Run #175 — 2026-04-07
Discovered: 0 | Extracted: 16 | Failed: 16

### New Patterns
- PDF and JS-rendered content successfully extracted; HTML pages show mixed results
- Large national banks (PNC, Santander, TD) skip discovery but proceed to extraction when content is pre-known
- Discovery failures on pages without fee-specific content indicate false discovery attempts
- HTML extraction failures despite successful classification indicate content mismatch
- Missing website URLs prevent discovery attempts entirely

### Site Notes
- DE credit unions (Del-One, Dover, Tidemark, Dexsta) published fee schedules in PDFs/renderable formats with high extraction counts (36-61 fees). Louviers FCU's js_rendered page failed extraction despite classification success.
- TD Bank entities extracted successfully (10 fees each) after skipping discovery. Santander extracted 26 fees from PDF. Suggests national banks have stable, discoverable fee pages that don't need homepage exploration.
- Wilmington Savings Fund Society, Artisans' Bank, Applied Bank, Deutsche Bank failed discovery with LLM-generated observations about where fees 'typically' are—model confidence without actual content. County Bank failed on 'no links found' suggesting navigation limitations.
- Barclays Bank Delaware and BNY Mellon Trust classified as HTML/PDF but extracted zero fees. Suggests pages contain fee schedule structure but extraction patterns don't match actual content formatting.
- Stifel Trust Company Delaware failed discovery at URL stage. Data quality issue: ensure institution registry completeness before discovery.

### Promoted to National
- Credit unions outperformed banks in fee schedule availability and extraction volume in DE run (avg 34 fees vs 15 for banks). Pattern worth investigating: credit unions may publish more comprehensive fee disclosures or use more standardized formats.
