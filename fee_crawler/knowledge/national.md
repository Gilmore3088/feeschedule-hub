# National Fee Schedule Knowledge Base

## CMS & Platform Patterns
- WordPress sites: fee schedules often at /wp-content/uploads/fee-schedule.pdf
- Kentico CMS: all pages are JS-rendered, always use Playwright
- Wix/Squarespace: PDFs hosted on CDN (cdn.prod.website-files.com), check document links
- Sites with <5KB homepage HTML are almost always JS-rendered

## Document Type Handling
- ~40% of bank/CU sites are JS-rendered and need Playwright
- Scanned PDFs: pdfplumber returns empty text, need OCR fallback
- Link index pages (e.g., Space Coast Credit Union): page lists links to fee schedule PDFs/pages, must follow sub-links
- Rate schedule PDFs often contain some fees but are mostly rate tables — extract what's there but expect low fee count

## Discovery Patterns
- Fee schedules are often 3-4 clicks deep under Disclosures/Resources/Documents
- Always check /disclosures page and scan all PDFs there
- Direct link detection: scan link text for "fee schedule", "schedule of fees", "truth in savings" before asking Claude
- Common paths that work: /fee-schedule, /fees, /disclosures, /rates-and-fees, /forms-and-disclosures
- Credit union patterns: /members/fees, /learn/information/fee-schedule, /rates/fee-schedule

## Common Failure Modes
- "Download is starting" Playwright error: URL is a direct PDF download, can't navigate to it — use requests.get() instead
- Sites with only privacy/terms disclosures but no fee schedule
- Trust companies and wealth management firms don't have consumer fee schedules
- Small community banks/CUs (<$1M assets) often don't publish fee schedules online — skip after first verification

## Extraction Tips
- Claude Haiku with tool_use (extract_fees tool) is reliable and cheap (~$0.002/institution)
- Send up to 12K chars of document text (was 8K, increased for better coverage)
- Broader system prompt listing all common fee categories improves extraction
- Always build fee_categories from extractor output, never trust Claude to re-categorize

## Promoted — 2026-04-06
- Discovery strategy may need to expand beyond dedicated 'fee schedule' pages to capture institutions that disclose fees inline on product pages

## Promoted — 2026-04-06
- PDF classification success does not guarantee extractable fee content. Implement post-classification validation to detect fee-bearing vs. non-fee PDFs before extraction.
- JS-rendered pages need content inspection post-rendering; classification alone insufficient. Rendering quality or timing may affect fee table accessibility.
- Implement pre-discovery validation: check for 404 status and confirm page content type before attempting discovery. About Us and account features pages are common false positives.
- HTML documents appear most reliable for fee extraction. Prioritize HTML format detection and scraping strategies.
- Low fee counts may indicate institutions with minimal published fee structures; validate against known fee-bearing account types to confirm data completeness.

## Promoted — 2026-04-06
- Add /disclosures to standard discovery paths for all institutions
- JS-rendered fee schedule extraction needs debugging; may require explicit wait for specific DOM elements or different parsing approach
- Prioritize PDF discovery paths and consider format-specific extraction strategies
- Develop institution-type-specific URL patterns for credit unions (e.g., /fees, /fee-schedule, /service-charges) to bypass homepage discovery

## Promoted — 2026-04-06
- Extraction failure on PDFs warrants secondary validation—some PDFs may require OCR or manual review before marking as processed
- JavaScript-rendered content requires renderer capability verification; current extraction may need post-render content stabilization
- Credit union fee schedules often exist in separate documents from disclosure agreements; discovery logic should distinguish fee schedules from general disclosures
- Skipped discovery stages may indicate pre-loaded document URLs; validate whether these represent cached/known URLs versus genuine discovery gaps
- Low extraction counts may reflect actual minimal fee publications rather than extraction failure—validate against institution size and product scope

## Promoted — 2026-04-06
- JS-rendered fee schedules may require enhanced DOM parsing or post-render content analysis; current extraction logic may miss fees in dynamically-loaded tables or interactive elements
- PDF documents remain most reliable format for fee schedule extraction; prioritize PDF discovery for efficiency gains
- Skipped discovery should trigger URL validation check to catch broken resource links before classification
- Implement URL freshness validation between discovery and extraction phases, especially for PDF resources
- Single-digit fee extractions from institutional pages warrant secondary verification; may signal extraction coverage gaps or institution-specific limited fee disclosures
- Discovery algorithm should recognize indirect fee references ('service charges,' 'account fees,' 'pricing') as discovery signals, not just explicit 'fee schedule' links

## Promoted — 2026-04-06
- js_rendered pages appear more reliable for fee schedule extraction than PDF-only approaches; consider prioritizing js_rendered classification in extraction workflows
- PDF classification alone is insufficient; extraction failures on PDFs suggest document structure variation within PDF format requires format-specific handling
- Many institutions appear to segment fee information across multiple pages rather than consolidating; discovery logic should account for product-specific fee pages and cross-reference multiple disclosure sections
- URL validation should occur during classification before extraction attempt to reduce downstream failures
- Validation success across varied fee counts indicates extraction logic is robust to document size differences
- js_rendered classification is necessary but not sufficient for success; some dynamically-rendered pages may require additional parsing or JavaScript simulation depth

## Promoted — 2026-04-06
- JS-rendered fee schedule content requires enhanced extraction logic; current pipeline may be missing dynamically-loaded fee tables
- PDF classification success does not guarantee extractable structured fee data; OCR or PDF parsing may be inconsistent
- Credit unions may have more standardized, accessible fee schedule publishing practices than commercial banks
- Direct fee schedule links on homepage yield better discovery than inference from rates pages; worth prioritizing direct link patterns
- Discovery skip logic may be too conservative; consider retry or alternative discovery methods for skipped institutions

## Promoted — 2026-04-06
- JS rendering may not be capturing dynamic fee table content properly - extraction logic may need adjustment for rendered DOM state or timing issues
- Static content formats (HTML, PDF) are more reliable for fee extraction than JS-rendered pages in this state
- Discovery strategy should systematically check compliance/disclosures/security pages, not just homepage and primary navigation
- Need better filtering to distinguish between general disclosure pages and actual fee schedule pages during discovery phase
- Prioritize PDF extraction reliability; current PDF failures in ME may indicate extraction logic gaps specific to banking fee PDFs

## Promoted — 2026-04-06
- Credit unions outperform banks in SD dataset - 5 credit unions all extracted successfully (total 194 fees) vs mixed results for banks, suggesting credit unions may publish fee schedules more consistently or in more extraction-friendly formats

## Promoted — 2026-04-06
- Add /disclosures to standard discovery paths for financial institutions
- JS-rendered pages require validation that content fully loads before extraction; discovery success doesn't guarantee extraction success
- Validate URL format before navigation attempts to prevent net::ERR_NAME_NOT_RESOLVED failures
- Regulation E PDFs should be revisited with alternative extraction methods; format may differ from standard fee schedules
- Prioritize homepage link extraction before navigating to nested account pages
- Document institutions confirmed to not publish fee schedules publicly; avoid repeated discovery attempts
- HTML-rendered fee schedules have higher extraction success than JS-rendered alternatives

## Promoted — 2026-04-06
- PDF extraction reliability is a critical bottleneck - Trugrocer, Lookout, and Connections FCUs all had discoverable PDFs but zero fees extracted. Investigate PDF parsing/OCR quality issues.
- Manual curation of direct fee schedule URLs significantly outperforms automated discovery for this state

## Promoted — 2026-04-06
- js_rendered fee schedules may require enhanced parsing or alternative extraction methods - consider whether content is dynamically loaded after page render or if fee tables use non-standard markup
- Maintain registry of institutions with predictable fee schedule URLs to accelerate discovery phase for repeat collections
- PDF extraction reliability is significantly higher than JavaScript-rendered content; prioritize PDF identification during discovery
- Flag institutions with security blocks or 404s for manual review or alternative contact methods rather than repeated automated attempts
- Disclosure pages vary in fee schedule inclusion; need enhanced content matching beyond document title matching

## Promoted — 2026-04-06
- JS-rendered fee schedules require specialized extraction handling; current approach extracts structure but not populated content
- PDF-based fee schedules are more reliably extractable; prioritize PDF discovery and classification
- Many institutions bury fee schedules; discovery may need to check /disclosures, /rates, /legal URLs as fallbacks
- Some PDFs pass classification but fail extraction due to non-standard formatting; may need institution-specific parsing rules

## Promoted — 2026-04-07
- Credit unions overall higher success rate (8 of 12 attempted) vs. traditional banks (3 of 5 attempted) - credit unions more likely to publish structured fee schedules online or in standardized formats

## Promoted — 2026-04-07
- PDF-hosted fee schedules are more reliable extraction targets than HTML or JS-rendered pages; prioritize PDF discovery in future workflows
- HTML-based fee schedules require more sophisticated parsing than PDFs; consider HTML as secondary extraction target after exhausting PDF sources

## Promoted — 2026-04-07
- PDF-based fee schedules are more reliable extraction targets than HTML pages. Prioritize PDF discovery in initial screening.
- JavaScript-rendered pages require validation that content actually loaded before extraction; classification alone is insufficient.
- Improve discovery filtering to distinguish between financial institution pages and fee schedule pages; current keyword matching produces false positives on related documents.
- Large national banks may require different discovery paths than regional institutions; consider institution-specific URL patterns for major chains.
- Implement retry logic for protocol errors in discover phase; these are often transient.

## Promoted — 2026-04-07
- Fee schedule format (PDF vs HTML vs dynamic rendering) is a stronger predictor of extraction success than discovery method. Prioritize PDF extraction pipeline validation.
- js_rendered classification alone doesn't guarantee extractable content. Implementation needs to differentiate between successfully-rendered fee tables vs rendered pages with missing fee data.
- HTML pages may contain partial fee information or summary-only content. Low extraction counts (1-3 fees) from HTML may indicate landing pages rather than comprehensive schedules.
- Credit union fee schedules are more complete and standardized. May warrant separate extraction strategies or templates for credit unions vs commercial banks.
- Discovery algorithm is confusing corporate pages with fee schedule pages. Needs refinement to identify actual fee disclosure pages vs general banking information.
- Distinguish between 'skipped' (pre-identified URL) vs 'failed' (attempted but unsuccessful). Current tagging conflates different scenarios.

## Promoted — 2026-04-07
- High skipped discover rate (12 of 18 institutions) with successful downstream classification and extraction indicates discover step may be unnecessarily conservative — consider reducing discover skip criteria or validating that classification/extraction can reliably replace discovery

## Promoted — 2026-04-07
- Implement post-classification validation: sample PDF pages for text layer presence and fee keyword frequency before full extraction to reduce wasted processing on non-extractable documents
- HTML extraction may require institution-level template tuning; consider building selector libraries per credit union format rather than generic HTML parsing
- JS-rendered fee pages may require longer DOM settlement waiting or post-render validation; current approach appears to capture incomplete datasets
- Bank discovery pages appear more prone to navigation complexity; credit unions may have more standardized disclosure page locations, enabling skip-to-classification approach for known institutional types
- Validate whether discovery step is functional or redundant in current pipeline; extraction success implies URLs already known through other means

## Promoted — 2026-04-07
- Prioritize PDF discovery links in fee schedule discovery phase; HTML pages may require DOM parsing refinement or structured data extraction methods
- Distinguish between 'partial fee mention' discovery failures and access-blocking failures; may need secondary discovery attempt targeting fee schedule PDFs specifically

## Promoted — 2026-04-07
- PDF classification success does not guarantee extractable fee content; implement secondary validation to detect empty or mislabeled fee documents before extraction attempt.
- JS-rendered fee schedules require validation that content actually loaded post-render; check for placeholder elements or lazy-load failures.
- Maintain parallel discovery method for credit unions; direct PDF links may be more reliable than homepage navigation for this institution type.
- Implement site-specific link patterns for fee schedule location; T&C pages are distinct from fee schedules and should be filtered out.
- Validate institution records have website URLs before running discovery; incomplete registry prevents coverage.
- Homepage-level fee schedule links correlate with successful extraction; prioritize institutions with visible fee disclosures.

## Promoted — 2026-04-07
- Prioritize PDF discovery and extraction pipelines; HTML parsing may require enhanced table/structure detection for fee schedules
- JS-rendered fee schedule pages need specialized DOM parsing; current extraction may timeout or miss dynamically-loaded fee tables
- PDF structure varies significantly; implement fallback OCR or template-based extraction for PDF documents that pass classification but fail extraction
- When homepage link extraction fails, implement secondary discovery: search for 'fees', 'rates', 'disclosures' in site structure or rely on direct URL patterns
- HTML fee schedules benefit from multi-strategy extraction (tables, definition lists, paragraph patterns) rather than single parsing approach

## Promoted — 2026-04-07
- Implement retry logic or alternative discovery methods for security-protected institutional sites
- PDF format alone doesn't guarantee extractable content; may require additional validation step for PDF structure/OCR quality
- JS-rendered content classification doesn't correlate with extraction success - may indicate dynamic content loading issues or fee data embedded in scripts rather than DOM
- Improve discovery filtering to exclude comparison pages, about pages, and financial highlights pages that match finance keywords but lack fee data
- Some institution types (particularly smaller regional/international banks) may not publish fee schedules online; document as unlocatable rather than extraction failure
- Extraction templates may not match regional/institution-specific fee table layouts; requires layout analysis of failed extractions to identify missing patterns

## Promoted — 2026-04-07
- Many institutions (5+ in NV) lack active website URLs in data sources, blocking discovery entirely—data quality issue affecting all states

## Promoted — 2026-04-07
- Review extraction pipeline for JS-rendered content — classification success doesn't guarantee extractable fee data
- Implement fallback discovery for institutions where rates pages are found but fee schedules not linked

## Promoted — 2026-04-07
- Extraction failures on successfully-classified PDFs warrant investigation into extraction logic

## Promoted — 2026-04-07
- PDF fee schedules require specialized parsing beyond generic classification—may need document structure analysis or OCR validation before extraction attempt
- JS rendering infrastructure is working; failures are content-specific rather than technical
- HTML fee schedules are more reliably extractable than PDF—prioritize HTML discovery paths
- Skipping discovery in favor of direct classification may bypass important link/structure validation—reconsider workflow ordering

## Promoted — 2026-04-07
- Review extraction patterns for JavaScript-rendered content; may need different parsing strategy than static PDFs
- Implement validation that PDF contains structured fee tables before attempting extraction; many 'fee disclosure' PDFs use narrative format
- Add secondary discovery pattern: pages containing 'fees subject to change' language should trigger follow-up search for linked disclosures
- Direct homepage/navigation links correlate with successful extraction; this is a reliable signal for credit union fee availability
- Prioritize PDF discovery over HTML for credit unions/banks; PDFs likely contain comprehensive fee tables
- Implement multi-step navigation discovery for credit unions; single-page assessment misses accessible fee schedules

## Promoted — 2026-04-07
- PDF fee schedules are highest-confidence discovery and extraction targets
- Secondary navigation paths and URL pattern exploration needed when homepage discovery fails
- Extraction template mismatch is distinct failure mode worth investigating for scaling

## Promoted — 2026-04-07
- JS-rendered fee schedule pages require validation of extraction logic—classification success does not guarantee extractable content
- Prioritize PDF discovery paths; they are institutional standard for fee schedules
- HTML extraction requires stricter fee-table pattern matching than PDFs
- PDF classification success without extraction warrants review of table parsing logic and fee-identifier keywords
- Require discovery phase for all institutions to distinguish 'not published' from 'extraction failed'
- Banks with FAQ-heavy or rates-focused pages are less likely to have linked fee schedules; consider alternate discovery strategies

## Promoted — 2026-04-07
- JS-rendered fee schedules need enhanced extraction logic beyond standard classification
- PDF format correlates with reliable fee schedule extraction; prioritize PDF parsing improvements
- Rate pages and FAQ pages are common dead-ends; implement early filtering to avoid wasting discovery cycles
- PDF classification alone insufficient; implement secondary validation for extractable text/tables before extraction attempt
- Credit unions show stronger fee schedule transparency than banks; may reflect regulatory or competitive dynamics worth investigating nationally

## Promoted — 2026-04-07
- Standardize PDF extraction pipeline to handle fee tables in CRA public files and disclosure PDFs separately from general Terms & Conditions
- Investigate SoFi Bank's page structure for replicable JS rendering patterns; consider longer waits for dynamic fee table population
- Implement retry logic with protocol fallbacks and extended timeouts for discover phase; separate technical failures from intentional non-publication
- When discover is skipped, ensure extraction pipeline is calibrated for that document type; current pipeline may have classify-ok → extract path issues
- HTML table extraction is production-ready; PDF extraction from discovery phase needs debugging—likely document format/layout variance not handled
- Consider targeted outreach to failed institutions or alternative discovery methods (regulatory filings, cached versions) for institutions with empty resource pages or hidden disclosures

## Promoted — 2026-04-07
- Federal Credit Unions with skipped discovery but successful PDF classification suggest a pattern where union fee schedules are reliably in PDF format; consider implementing targeted PDF discovery for federal credit unions

## Promoted — 2026-04-07
- PDF fee schedules are most reliable extraction source for financial institutions; prioritize PDF discovery in workflow

## Promoted — 2026-04-07
- PDF extraction reliability is inconsistent; may indicate need for OCR verification or manual review workflow
- JavaScript-rendered fee schedule pages may use dynamic content loading or obfuscated fee tables that resist structured extraction
- HTML-based fee schedules show 100% extraction success vs 60% for other formats in this run

## Promoted — 2026-04-07
- When institution URLs are pre-known, skip discover stage and move directly to classify—improves efficiency in targeted institution extraction
- Prioritize HTML extraction paths; PDF extraction requires fallback strategies for complex layouts

## Promoted — 2026-04-07
- PDF format appears most reliable for automated fee schedule extraction; may warrant prioritizing PDF discovery paths

## Promoted — 2026-04-07
- Include EFT disclosure documents in discovery heuristics for banking institutions
- JS-rendered pages require validation that content actually loads fee tables; classification success doesn't guarantee extractable fee content
- Prioritize PDF fee schedule discovery; they show higher yield and consistency than HTML or JS pages

## Promoted — 2026-04-07
- Credit unions systematically publish fee schedules more consistently than commercial banks in Hawaii

## Promoted — 2026-04-07
- Implement secondary validation after PDF classification to detect image-only or unstructured PDFs before extraction attempt
- js_rendered pages need content-level analysis post-rendering; rendering success ≠ structured fee data presence
- Detect and handle truncated URLs in PDFs; consider following partial URLs or searching institution domain for referenced documents
- Skipped discovery stage indicates curated/seed URLs in use; document source of initial URLs for reproducibility
- Flag institutions with extraction counts <5 for manual review; may indicate incomplete documents or single-fee-type institutions
- Improve discovery filtering to exclude policies pages that bundle unrelated content; consider keyword-based pre-filtering

## Promoted — 2026-04-07
- HTML format may be more reliable for automated extraction than PDF or JavaScript-rendered content
- FCU sector shows high compliance with structured fee schedule publication

## Promoted — 2026-04-07
- JS_rendered classification does not guarantee extractable fee data; requires validation that dynamic content fully populates before extraction
- PDF-based fee schedules are most reliable extraction source; prioritize PDF discovery
- Account comparison pages are false positives; discovery should skip or distinguish from actual fee schedule pages
- Static HTML fee schedules reliably extract; good fallback when dynamic content fails

## Promoted — 2026-04-07
- Implement URL validation and reconstruction logic for PDFs with incomplete hyperlinks before attempting extraction
- JS-rendered pages require additional validation to confirm actual content availability after rendering, not just successful DOM load
- Develop fallback OCR detection for PDFs that classify successfully but contain zero extracted entities
- When discovery is skipped systematically, document format distribution should be tracked separately to assess discovery necessity
- Multi-topic policy pages may require category-specific filtering logic rather than blanket discovery rejection
- Web-native formats outperform PDFs for fee extraction; prioritize HTML/JS sources when available

## Promoted — 2026-04-07
- PDF classification alone does not guarantee extractable fee data; PDF content quality/structure varies significantly
- Product detail pages should be re-examined with different extraction logic rather than rejected outright

## Promoted — 2026-04-07
- Implement stricter content filtering to distinguish policy aggregation pages from actual fee schedule pages before failing discovery
- PDF classification success does not guarantee extractable structured fee data; add secondary validation for presence of fee keywords/patterns before extraction attempt
- Implement URL validation and redirect-following logic before attempting document extraction to catch broken links early
- JS-rendered classification alone is insufficient predictor; validate rendered page contains fee-related DOM elements after rendering
- Do not flag low extraction counts as failures for federal credit unions; validate that low counts represent complete rather than partial extraction

## Promoted — 2026-04-07
- Extraction failures on classified documents warrant investigation into PDF structural variations - may indicate need for format-specific extraction rules
- JS-rendered pages need more granular handling - success/failure not predictable by rendering method alone
- Review whether discover skip strategy is appropriate for financial institution fee schedule location
- Implement URL validation and retry logic for hosted PDFs, particularly on WordPress-hosted sites
- Policy document pages sometimes contain or link to fee schedules - rejection criteria may need refinement
- Federal credit union fee schedules follow more standardized patterns than commercial banks - could optimize extraction rules by institution type

## Promoted — 2026-04-07
- HTML-based fee presentation should be prioritized in extraction templates; PDF parsing logic needs debugging as 5 of 7 PDF extractions failed

## Promoted — 2026-04-07
- Credit unions publishing fee schedules as standalone PDFs have higher extraction success than those embedding in web pages; may indicate need for format-specific extraction strategies
- JS-rendered content represents systematic extraction weakness; may require enhanced DOM parsing or content stabilization before extraction attempt
- Financial institutions often have 'disclosures' or 'policies' sections that don't contain fee schedules; discovery URLs need validation that page contains actual fee data, not just regulatory boilerplate
- Pure HTML fee schedules deliver reliable, high-volume extraction; may indicate these institutions use more standardized fee table markup

## Promoted — 2026-04-07
- js_rendered content requires validation that fee tables are actually present post-render, not just that page loads
- PDF extraction success rate high; failures warrant manual review for PDF quality issues rather than process failure
- Homepage link-discovery method misses institutions with embedded/inline fee disclosure; secondary search strategy needed for fee pages not linked from homepage
- HTML fee pages may contain less structured data or fewer products; validation needed on whether low extraction reflects actual fee count or extraction method limitation

## Promoted — 2026-04-07
- Federal Credit Unions as a category show strong fee schedule publication rates - should be considered reliable sources across all states

## Promoted — 2026-04-07
- JS-rendered fee schedule pages may require post-rendering content validation before extraction attempt—rendering may not fully populate fee tables or structured data.
- PDF-based fee schedules are most reliable extraction source when located; prioritize PDF discovery paths.
- Institutions using CAPTCHA or heavy JS-dependent content loading require alternative discovery methods (API, cached pages, or manual research).
- Many institutions lack clear fee schedule landing pages; consider searching for account disclosure documents, terms of service, or product-specific pages as secondary discovery paths.
- HTML pages with tabular or list-structured fee data are reliable; extraction failures on HTML likely indicate poorly formatted tables or missing semantic markup.

## Promoted — 2026-04-07
- Access-denied errors on fee documents suggest need for authenticated crawling or manual retrieval processes for credit unions
- Prioritize JS rendering for banks with dynamically-loaded fee schedules; standard HTML parsing insufficient
- Single-page consolidated fee schedules are more reliably extractable than multi-page or scattered disclosures
- Homepage inaccessibility warrants manual verification; some institutions may deliberately not publish fee schedules online
- Corporate vs. consumer banking distinction matters - institutions serving businesses may not publish retail fee schedules
- Tracking URL changes and maintaining fallback discovery methods needed for institutions that reorganize disclosure locations

## Promoted — 2026-04-07
- 0% discovery success with 100% classification success indicates pre-population strategy is masking discovery method effectiveness—recommend re-running with discovery enabled on sample to assess true discovery capability

## Promoted — 2026-04-07
- Network and infrastructure failures occur during discovery (HTTP/2 protocol error for First Technology Federal Credit Union) - need robust error handling and retry logic for discovery phase to avoid false negatives

## Promoted — 2026-04-07
- JS-rendered fee schedule pages need enhanced extraction logic; current approach may not be parsing dynamically-loaded fee tables correctly
- Prioritize PDF discovery links; PDF extraction is more reliable than HTML/JS rendering for fee schedules
- HTML-classified pages have highest success rate; focus crawler on static HTML fee schedule pages
- Track discovery success + extraction failure separately; may indicate extraction logic broken specifically for certain page structures, not discovery failure
- Discovery module works; these are true negatives confirming institutions don't have accessible online fee schedules in standard locations

## Promoted — 2026-04-07
- JS-rendered fee pages may require DOM selector refinement or post-render timing adjustment before extraction
- Prioritize PDF extraction for credit unions and institutions publishing fee schedules as downloadable documents
- Security-protected institutions require alternative discovery methods; consider user-agent rotation or secondary URL patterns
- HTML-based fee pages may contain more comprehensive fee schedules than JS-rendered equivalents
- Discover phase needs secondary link-following logic to distinguish landing pages from actual fee schedule documents
- Validate institution dataset completeness before running discovery; missing URLs block entire institutions

## Promoted — 2026-04-07
- Credit unions outperformed banks in fee schedule availability and extraction volume in DE run (avg 34 fees vs 15 for banks). Pattern worth investigating: credit unions may publish more comprehensive fee disclosures or use more standardized formats.

## Promoted — 2026-04-07
- JS-rendered fee schedule pages require enhanced JavaScript execution or multi-step navigation handling; current approach misses content

## Promoted — 2026-04-07
- JS-rendered fee schedule pages may require additional rendering time or DOM inspection before extraction; current extraction logic may not be waiting for dynamic content to fully load
- Static format fee schedules (PDF/HTML) are reliable extraction targets; prioritize these formats over JS-rendered content
- Pre-discovery filtering needed to avoid wasting discovery agent effort on pages that are obviously not fee schedules; implement page-type pre-classification
- Credit union fee schedules follow same format vulnerability pattern as banks

## Promoted — 2026-04-07
- js_rendered fee schedules need specialized extraction handling for credit union documents
- PDF extraction success for credit unions unpredictable—may require template-specific parsing by institution
- Federal credit union fee document standards less uniform than commercial bank standards
- Direct fee schedule links are reliable indicators of extractable content unless page uses JavaScript rendering

## Promoted — 2026-04-07
- Investigate whether js_rendered classification requires secondary extraction strategy or stricter content validation before declaring extraction success
- PDF documents require content-type verification—some PDFs may be scanned images or have non-standard structures
- Flag extractions under 10 fees for manual review—may indicate discovery/classification errors or genuinely minimal fee schedules
- WA run may have used pre-identified institution URLs rather than discovery crawl; consider whether this represents a process deviation
- Consider institution type (bank vs. credit union) in extraction validation thresholds
