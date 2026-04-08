# MN Fee Schedule Knowledge


## Run #54 — 2026-04-07
Discovered: 67 | Extracted: 101 | Failed: 211

### New Patterns
- JavaScript-rendered pages with fee schedules show inconsistent extraction success
- PDF classification consistently outperforms other formats for fee extraction
- Some institutions with discovered fee content still fail extraction
- Direct navigation links to fee schedules are rare in discover phase

### Site Notes
- Wings Financial, Topline Financial, and Magnifi Financial all classified as js_rendered but extraction failed or yielded minimal fees (1-3 items), while PDF sources consistently succeeded
- All 9 PDF-classified institutions (Ameriprise, Trustone, Affinity Plus, Blaze, Think Mutual, City & County, Members Cooperative) achieved successful extraction with high fee counts (11-74)
- Tradition Capital Bank was successfully discovered with identified PDF, but extraction yielded zero fees despite correct resource location
- Think Mutual Bank's direct fee schedule link and Tradition Capital's business account PDF represent exceptions; most discoveries require educated guessing about likely pages
- 11 of 46 institutions failed discovery with 'no links found' or generic page content messages, suggesting homepage-only navigation or dynamic content loading issues
- Bridgewater Bank and Premier Bank discovery failed due to page load/connectivity issues rather than content absence

### Promoted to National
- JS-rendered fee content requires improved extraction logic or may need secondary PDF fallback discovery
- Prioritize PDF discovery and classification; PDFs are most reliable format for fee schedule data
- Discovery success does not guarantee extraction success; may indicate OCR/parsing failures or unusual fee table formatting
- Institutions inconsistently label or expose fee schedule links; contextual discovery (rates pages, account pages, disclosures) may be more reliable than direct link searches
- Homepage structure is unreliable for discovery; secondary page scraping or sitemap-based discovery may improve coverage
- Retry logic and error handling for transient load failures should be distinguished from permanent content unavailability

## Run #71 — 2026-04-07
Discovered: 8 | Extracted: 103 | Failed: 209

### New Patterns
- JS-rendered pages show lower extraction success rate than PDFs
- Discovery failures cluster around homepage navigation limitations
- Personal deposits/checking account pages may be misdirected discovery targets
- Credit unions with strong PDF delivery show reliable extraction
- Correspondent/wholesale banks may not publish retail fee schedules online

### Site Notes
- Wings Financial, Tradition Capital, Topline Financial all failed extraction despite successful classification as js_rendered. PDF-based institutions had 100% extraction success in MN run.
- Citizens Alliance Bank, North American Banking Company, Deerwood Bank reported 'No links found on homepage' — suggests these institutions bury fee schedules in non-standard navigation or behind account type selection flows
- Bridgewater Bank, Mayo Employees FCU, Park State Bank discovery failed despite heuristic expectation that 'checking account pages contain fee info' — actual pages contained features but not fee links
- 8 of 9 credit unions with PDF classification succeeded in extraction; only non-PDF (js_rendered) credit unions failed extraction
- United Bankers' Bank discovery revealed it serves other banks, not retail customers — homepage appropriately lacks consumer fee information

### Promoted to National
- Consider prioritizing PDF discovery paths or improving JS-rendered content extraction logic
- Develop secondary discovery strategy for institutions with sparse homepage fee schedule links (check account type landing pages, account comparison tools)
- Update discovery heuristics: checking account feature pages ≠ fee schedule pages; look for explicit 'Fee Schedule', 'Pricing', or 'Disclosures' sections instead
- Credit unions may standardize on PDF fee schedules more than commercial banks — prioritize PDF extraction for FCU discovery paths
- Add institution type filtering to skip correspondent banks and wholesale-only institutions in discovery phase

## Run #85 — 2026-04-07
Discovered: 4 | Extracted: 103 | Failed: 209

### New Patterns
- JS-rendered pages with fee schedules frequently fail extraction despite successful classification
- Discovery false positives on pages mentioning fees without containing actual fee schedules
- PDF classification shows highest extraction success rate
- Homepage-level link discovery struggles for some institution types
- Credit unions show mixed extraction success despite consistent classification

### Site Notes
- Wings Financial, Tradition Capital, Security Bank & Trust, Members Cooperative, and Topline Financial all classified as js_rendered but extraction failed with 'no fees extracted'. Suggests rendering may not be capturing dynamic fee table content properly.
- Multiple MN banks (Bridgewater, Frandsen, Stearns, Merchants, Mayo Employees, Park State, Deerwood) had discover=failed with notes indicating pages mention fees but lack structured schedules. Discovery LLM is correctly rejecting these.
- All 7 institutions with classify=ok (pdf) that proceeded to extraction succeeded (Ameriprise, Trustone, Affinity Plus, Blaze, Tradition Capital extraction failed, Think Mutual, City & County). PDFs are reliable sources.
- Citizens Alliance Bank and North American Banking Company both reported 'No links found on homepage'. These may require deeper site crawling or alternative entry points.
- Credit unions in MN have 50% extraction failure rate (Wings, Tradition Capital, Security, Members Coop, Topline all failed). Federal credit unions may structure fee disclosures differently than banks.

### Promoted to National
- JS-rendered fee schedule pages need enhanced extraction logic or secondary OCR/text fallback when initial parsing yields empty results
- Discovery rejection messages are accurate - these are legitimate non-matches, not failures
- Prioritize PDF-hosted fee schedules in discovery; they have consistent extraction success
- Federal credit union fee disclosure formats may require specialized extraction templates

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 39% (118/306 addressable)
- Total institutions: 312 (excluded: 6)
- Institutions with URL but no fees: needs investigation
