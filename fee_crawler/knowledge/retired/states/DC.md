
## Pruned 2026-04-07

## Run #155 — 2026-04-07
## Run #159 — 2026-04-07
## Run #160 — 2026-04-07
## Run #163 — 2026-04-07
### New Patterns
### Site Notes
- All 15 institutions with discover=skipped still achieved classify and extract stages, suggesting runner has direct URLs to fee schedules rather than discovering them.
- Broken or moved PDF URLs cause extraction failures even when initially discovered
- Broken/incomplete URL references in PDFs cause extraction failures
- Broken/moved document URLs (404 errors) occur in institutions that restructure fee schedule hosting
- City First Bank discover failed with note about policies page containing mixed content (privacy, ethics, luxury). Suggests inadequate page filtering or classifier confusion.
- City First Bank discover phase failed with mixed content detection (privacy notices, luxury expenditure policy) - indicates page aggregates multiple policy types without clear fee schedule isolation
- City First Bank discovery failed with generic policies page detection - classifier incorrectly identified privacy/ethics policies page as potential fee schedule source
- City First Bank discovery failed with generic policy document detection error—indicates institution may mix fee schedules with general policy docs without clear labeling, requiring manual review
- City First Bank discovery failure indicates content ambiguity in policies pages
- City First Bank, National Association: policies page discovered but confirmed to contain various policies without actual fee schedule or service charges
- Classification success does not guarantee extractable structured data; PDF documents with poor OCR quality or unusual layouts fail silently at extraction
- DC financial institutions heavily rely on PDF fee schedules (13/19 successful extractions were from PDFs)
- Dc Federal Credit Union extracted only 1 fee despite classify=ok (pdf). Likely institution has minimal or single-category fee structure.
- Dc Federal Credit Union extracted only 3 fees despite successful classification, lowest yield in dataset - may indicate minimal fee disclosure or single-page summary document
- Dc Federal Credit Union may have consolidated fee structure worth investigating for content accuracy
- Detect and handle truncated URLs in PDFs; consider following partial URLs or searching institution domain for referenced documents
- Direct navigation to fee schedule links after initial discovery is effective for some institutions
- Discover stage being skipped systematically for 14/15 institutions suggests pre-populated institution list rather than active web discovery
- Discovery skip with successful extraction indicates pre-populated or direct fee page access
- Extraction volume variance (3-61 fees) suggests institutions vary significantly in fee schedule comprehensiveness
- Federal Credit Unions in DC consistently publish fee schedules in discoverable formats, with 11/12 successfully classified and extracted
- Federal Credit Unions with skipped discovery but successful PDF classification suggest a pattern where union fee schedules are reliably in PDF format; consider implementing targeted PDF discovery for federal credit unions
- Flag institutions with extraction counts <5 for manual review; may indicate incomplete documents or single-fee-type institutions
- General bank policy pages may be discovered but lack fee schedules
- HTML format may be more reliable for automated extraction than PDF or JavaScript-rendered content
- HTML-classified documents show 100% extraction success rate (3/3 successful: Department Of Commerce, Dept Of Labor, Ep Federal Credit Union)
- HTML-formatted fee schedules (Department Of Commerce, Dept Of Labor, Ep Federal Credit Union) have higher success rates than PDF equivalents
- Idb Global Federal Credit Union, Industrial Bank, Library Of Congress Federal Credit Union all classified as PDF but extraction returned no fees. Suggests PDF content may be image-based, encrypted, or structurally inconsistent.
- Implement secondary validation after PDF classification to detect image-only or unstructured PDFs before extraction attempt
- Improve discovery filtering to exclude policies pages that bundle unrelated content; consider keyword-based pre-filtering
- Incomplete URL fragments in discovered document references lead to 404 errors; may indicate sites with outdated links or redirect issues
- Industrial Bank and Library Of Congress Federal Credit Union both classified PDFs but extracted zero fees - documents likely exist but contain no parseable fee data structures
- Industrial Bank and Library Of Congress Federal Credit Union both classified as PDF but extraction yielded zero fees—suggests PDF structure complexity rather than missing documents
- Industrial Bank and Library of Congress FCU both classified successfully as PDF but extraction returned 'no fees extracted' - suggests documents may be scanned images or contain non-standard fee table formats
- Industrial Bank: discover succeeded on privacy notice PDFs but extract failed despite document containing relevant data
- JavaScript-rendered pages show mixed extraction results
- JavaScript-rendered pages show mixed extraction results (some succeed, some fail with no fees extracted)
- JavaScript-rendered pages show mixed extraction results - some succeed while others fail completely despite proper classification
- JavaScript-rendered pages with fee schedules may fail extraction despite successful discovery and classification
- Library Of Congress Federal Credit Union: PDF classified successfully but extract failed with 'no fees extracted' — may indicate non-standard fee table formatting
- Low extraction counts may indicate partial fee schedules
- O.A.S. Staff FCU extract failed due to malformed URL fragment (incomplete path: https://www.oasfcu.org/wp-content/uploads/2), suggesting broken or incomplete fee document reference in source
- O.A.S. Staff Federal Credit Union failed with 404 error on truncated URL (https://www.oasfcu.org/wp-content/uploads/2), indicating PDF contains incomplete or malformed hyperlinks.
- O.A.S. Staff Federal Credit Union represents a broken URL case (404 error) - suggests institutional website restructuring or migrated content
- O.A.S. Staff Federal Credit Union returned 404 on wp-content URL, suggesting WordPress site migration or URL path change
- O.A.S. Staff Federal Credit Union: 404 error on PDF URL suggests document was moved or deleted after discovery
- PDF classification success does not guarantee extraction success
- PDF documents consistently classify and extract successfully across multiple institutions, suggesting PDF is a reliable format for fee schedule discovery
- PDF documents with 'no fees extracted' failures often contain fee schedules in non-standard layouts or embedded tables that standard extraction misses
- PDF format appears most reliable for automated fee schedule extraction; may warrant prioritizing PDF discovery paths
- PDF-based fee schedules consistently extract successfully across multiple institutions, while JS-rendered and HTML pages show higher extraction failure rates
- Policy aggregation pages (privacy policies, ethics policies, compliance pages) frequently misclassified as fee schedule candidates during discovery phase
- Prioritize HTML extraction paths; PDF extraction requires fallback strategies for complex layouts
- Privacy notice PDFs can contain fee information but may not be classified/extracted correctly as fee schedules
- Skipped discovery stage indicates curated/seed URLs in use; document source of initial URLs for reproducibility
- Some PDFs classified correctly but yield no extractable fees
- The National Capital Bank of Washington and Founders Bank: direct fee schedule links found through navigation yielded successful extractions (26 and 50 fees respectively)
- Treasury Department FCU (js_rendered) and Library of Congress FCU (pdf) both failed extraction despite successful classification
- Treasury Department Federal Credit Union (js_rendered) failed extraction while F R B Federal Credit Union and Advantage Financial Federal Credit Union (both js_rendered) succeeded. Indicates js_rendered classification alone doesn't predict extraction success.
- Treasury Department Federal Credit Union and F R B Federal Credit Union both classified as js_rendered, but only F R B extracted fees successfully - suggests content rendering variability
- Treasury Department Federal Credit Union rendered via js but failed extraction, while F R B Federal Credit Union and Advantage Financial (both js_rendered) succeeded—indicates variable fee schedule placement on dynamically-loaded pages
- Treasury Department Federal Credit Union: js_rendered content discovered on homepage but extract failed with 'no fees extracted'
- Very low fee counts (Dc Federal Credit Union: 1 fee) despite successful extraction suggests minimal or simplified fee schedules rather than extraction failure
- When institution URLs are pre-known, skip discover stage and move directly to classify—improves efficiency in targeted institution extraction
- js_rendered pages need content-level analysis post-rendering; rendering success ≠ structured fee data presence
Discovered: 0 | Extracted: 19 | Failed: 14
Discovered: 8 | Extracted: 19 | Failed: 14


## Pruned 2026-04-07

## Run #164 — 2026-04-07
## Run #165 — 2026-04-07
## Run #167 — 2026-04-07
## Run #169 — 2026-04-07
### New Patterns
### Site Notes
- **City First Bank**: Discovery failed—policies page contains mixed content (privacy, ethics, luxury); inadequate page filtering or classifier confusion
- **Dc Federal Credit Union**: Extracted only 1-3 fees despite successful classification—institution has minimal or single-category fee structure
- **Industrial Bank, Library Of Congress Federal Credit Union, Idb Global Federal Credit Union**: Classified as PDF but extraction returned no fees—documents likely image-based, encrypted, or structurally inconsistent
- **O.A.S. Staff Federal Credit Union**: 404 error on truncated URL (https://www.oasfcu.org/wp-content/uploads/2)—incomplete/malformed hyperlink in PDF
- **Treasury Department Federal Credit Union**: JS-rendered content failed extraction despite successful classification
- 404 errors on hosted documents indicate URL structure fragility
- Banks with 'policies' pages sometimes mislabel fee schedule location; discovery should check for separate 'fees' or 'pricing' sections
- Broken document links in PDF URLs prevent successful extraction
- City First Bank discover failure message mentions 'Privacy Notice, Luxury Expenditure Poli' - page classification logic incorrectly rejected policy document page
- City First Bank multi-document landing page caused discovery failure
- City First Bank policies page contains policy documents but no fee schedules - institution may not publish fee schedules online or keeps them behind login
- City First Bank's discover failed because the policies page aggregates multiple policy types rather than fee schedules
- City First Bank's policies page contains mixed document types (privacy, accessibility, ethics, terms) causing selective discovery to fail — not a no-publish case but a multi-category page issue.
- Classified documents can become unreachable during extraction phase; implement URL freshness check between classify and extract stages
- DC Federal Credit Union: successfully extracted but only 5 fees - minimal fee schedule suggests either very simple structure or incomplete document capture
- DC federal credit unions consistently publish standardized fee documents in discoverable formats; extraction consistency suggests predictable document structures
- DC run skipped discovery phase for all 15 institutions but still achieved 18 successful extractions. Suggests pre-known document URLs or direct linking.
- Dc Federal Credit Union extracted only 3 fees despite successful classification - lowest extraction count in dataset
- Department Of Commerce FCU (HTML), Dept Of Labor FCU (HTML), F R B (js_rendered), and Advantage Financial (js_rendered) all succeeded; PDF success rate appears lower due to structure variability.
- Develop fallback OCR detection for PDFs that classify successfully but contain zero extracted entities
- Discover phase skipped across nearly all institutions in this run
- Discovery skip with successful extraction indicates pre-populated/seed URLs in use; document source for reproducibility
- Discovery skipped universally in this run, yet classification succeeded on all documents
- Do not flag low extraction counts as failures for federal credit unions; validate that low counts represent complete rather than partial extraction
- Extraction failures on classified documents warrant investigation into PDF structural variations - may indicate need for format-specific extraction rules
- FCU sector shows high compliance with structured fee schedule publication
- Federal Credit Unions as a category show strong fee schedule publication rates - should be considered reliable sources across all states
- Federal Credit Unions in DC consistently publish fee schedules in discoverable formats
- Federal Credit Unions show near-universal success (12/14 successful extractions) while broader commercial banks show more variability
- Federal Credit Unions with low fee counts (5 fees) successfully validate, suggesting minimal fee schedules are legitimate
- Federal credit union fee schedules follow more standardized patterns than commercial banks - could optimize extraction rules by institution type
- HTML and HTML+JS pages show higher extraction success rate than PDFs
- HTML format more reliable than PDF or JavaScript-rendered content for automated extraction
- HTML-classified documents show 100% extraction success rate (prioritize HTML extraction paths)
- High success rate (19 extracted from 14 failures) suggests DC institutions generally publish fee schedules; Federal Credit Unions especially reliable
- Idb Global FCU, Industrial Bank, and Library of Congress FCU all classify as PDF but yield zero fees. Pattern suggests fee tables may use non-standard formatting or be embedded in images within PDFs.
- Implement URL validation and reconstruction logic for PDFs with incomplete hyperlinks before attempting extraction
- Implement URL validation and redirect-following logic before attempting document extraction to catch broken links early
- Implement URL validation and retry logic for hosted PDFs, particularly on WordPress-hosted sites
- Implement stricter content filtering to distinguish policy aggregation pages from actual fee schedule pages before failing discovery
- Industrial Bank and Library Of Congress Federal Credit Union both had PDFs successfully classified but returned 'no fees extracted' - suggests PDF content exists but parsing logic doesn't capture fee tables in these specific formats
- Industrial Bank and Treasury Department FCU both classified as extractable but returned no fees, suggesting PDFs with fee information in non-tabular formats
- Industrial Bank: classified as PDF but extraction failed with 'no fees extracted' - PDF may contain non-standard fee table format or fees embedded in narrative text
- JS-rendered classification alone is insufficient predictor; validate rendered page contains fee-related DOM elements after rendering
- JS-rendered pages need more granular handling - success/failure not predictable by rendering method alone
- JS-rendered pages require additional validation to confirm actual content availability after rendering, not just successful DOM load
- JS-rendered pages show mixed extraction results despite successful classification
- JavaScript-rendered pages (js_rendered) show higher extraction failure rate; rendering may not execute scripts that display fee tables
- JavaScript-rendered pages show consistent extraction success when properly classified
- JavaScript-rendered pages show mixed extraction results; rendering success ≠ structured fee data presence
- JavaScript-rendered pages show mixed results - some extract successfully, others fail completely
- Library of Congress FCU and DC FCU both extracted only 5 fees with successful validation, indicating small institutions may have genuinely limited fee structures
- Library of Congress Federal Credit Union: classified as PDF but extraction failed - despite classification passing, document structure may lack machine-readable fee tables
- Low extraction counts (5-20 fees) may indicate partial documents; compare against peer institutions for completeness
- Low extraction counts (<5 fees) indicate incomplete documents requiring manual review
- Low extraction counts may indicate minimal fee structures or summary-only documents rather than comprehensive fee schedules
- Multi-topic policy pages may require category-specific filtering logic rather than blanket discovery rejection
- Multiple PDFs labeled 'no fees extracted' despite successful document classification
- O.A.S. Staff FCU extract failed with 404 on wp-content URL, indicating outdated or incorrectly parsed document paths in their systems
- O.A.S. Staff Federal Credit Union returned 404 on wp-content PDF URL - suggests WordPress migration or URL pattern change
- O.A.S. Staff Federal Credit Union: PDF URL truncated during extraction process (https://www.oasfcu.org/wp-content/uploads/2), indicating potential issues with URL parsing in PDF contexts
- O.A.S. Staff Federal Credit Union: URL returned 404 after classification - linked document may be temporary or have moved; classification URL validation needed
- Only 1 discover attempt (City First Bank - failed with policy document detection), 14 skipped - suggests pre-identified institution list was used rather than discovery process
- PDF classification success does not guarantee extractable structured fee data; add secondary validation for presence of fee keywords/patterns before extraction attempt
- PDF classification success does not guarantee extraction success; implement secondary validation to detect image-only or unstructured PDFs before extraction
- PDF classification success doesn't guarantee extractable structured fee data; some PDFs have fees in unstructured/narrative format
- PDF documents classified correctly but extraction fails on some institutions despite successful classification
- PDF documents with embedded broken/incomplete URLs fail extraction with 404 errors
- PDF documents with no extractable fees (empty extractions) indicate missing or non-standard fee table formatting
- PDFs with fee schedule metadata may still lack structured data; extraction model struggles with certain PDF layouts
- Policies pages with mixed content (privacy, accessibility, ethics, terms) can trigger false discovery failures
- Policy document pages sometimes contain or link to fee schedules - rejection criteria may need refinement
- Review whether discover skip strategy is appropriate for financial institution fee schedule location
- Treasury Department FCU and F R B FCU both js_rendered but F R B succeeded (27 fees) while Treasury failed (0 fees), indicating rendering success varies by page structure
- Treasury Department FCU classified as js_rendered but failed extraction with 'no fees extracted', while F R B and Advantage Financial (also js_rendered) succeeded. Suggests inconsistent rendering or fee table structure.
- Treasury Department Federal Credit Union (js_rendered) failed extraction despite successful classification, while F R B Federal Credit Union and Advantage Financial Federal Credit Union (both js_rendered) succeeded - indicates inconsistent content structure across js-rendered fee pages
- Treasury Department Federal Credit Union: classified as js_rendered but extraction failed with 'no fees extracted' - JavaScript-rendered content may not expose fee data to extraction
- Truncated URLs in PDFs cause 404 errors; detect and handle incomplete hyperlinks or search institution domain for referenced documents
- Web-native formats outperform PDFs for fee extraction; prioritize HTML/JS sources when available
- When discovery is skipped systematically, document format distribution should be tracked separately to assess discovery necessity
- When institution URLs are pre-known, skip discover stage and move directly to classify for efficiency
Discovered: 0 | Extracted: 18 | Failed: 15
Discovered: 0 | Extracted: 20 | Failed: 13

