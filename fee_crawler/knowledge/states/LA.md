# LA Fee Schedule Knowledge


## Run #70 — 2026-04-07
Discovered: 42 | Extracted: 82 | Failed: 162

### New Patterns
- JS-rendered pages with fee schedule content often fail extraction despite successful discovery and classification
- PDF-based fee schedules show inconsistent extraction success rates even when correctly classified
- Direct fee schedule links (discovered via navigation/search) correlate with successful extraction
- Security/access blocks are a major blocker class at institutions
- Skipped discovery (direct classification from prior knowledge) has higher extraction success than failed discovery attempts
- Banks with no homepage fee links often do not publish fee schedules online or use buried discovery paths

### Site Notes
- Origin Bank: page renders fee schedule content but extraction returned zero fees. Suggests rendering completes but fee parsing logic misses dynamically-loaded content structure.
- First American Bank and Trust: PDF classified but no fees extracted; contrast with First Federal Bank (9 fees) and Carter Federal (53 fees) from PDFs. Indicates PDF structure/format variation affects parser.
- Neighbors Federal (44 fees) and The Evangeline Bank (7 fees) both had explicit 'fee schedule' or 'accounts table' links found during discovery. Recommend prioritizing navigation-based discovery over homepage scanning.
- First Guaranty Bank blocked by security service; Resource Bank returned 403 Forbidden during extraction. These are hard stops requiring institutional contact or authentication.
- Institutions where discover was skipped (Sabine State, FIDELITY BANK, Efcu Financial, Jonesboro, Pelican, Carter) show 60% extraction success rate vs 18% for those with failed discovery. Suggests a-priori routing to correct document type is valuable.
- b1BANK, Gulf Coast Bank, BOM Bank: multiple reports of 'No links found on homepage.' Likely candidates for manual outreach or non-publishing institutions.

### Promoted to National
- High extraction failure rate (162/286 = 57%) indicates parser is over-sensitive to content structure variance. Recommend: audit successful extractions (Origin, Neighbors, Evangeline) for common HTML/PDF patterns to relax parsing rules.

## Run #78 — 2026-04-07
Discovered: 8 | Extracted: 90 | Failed: 154

### New Patterns
- Discovery phase produces many plausible-sounding hypotheses about where fees live (T&Cs, Disclaimers, Additional Services, Privacy pages) that fail in practice
- Skipped discovery phase followed by successful extraction indicates pre-cached or known URLs bypassing discovery entirely
- JS-rendered pages successfully extract fees despite failing discovery
- Cloudflare and access restriction failures are unrecoverable at discovery stage
- PDF documents with successful discovery consistently extract fees
- Homepage link discovery failure is common but doesn't correlate with fee unavailability online

### Site Notes
- Red River Bank, Investar Bank, Synergy Bank, Century Next Bank, Campus FCU all marked 'discover=failed' with confident descriptions of where fees 'should' be, but extraction never occurs
- Neighbors FCU, FIDELITY BANK, Efcu Financial, First Federal Bank of Louisiana all show discover=skipped but extract=ok with high fee counts (3-36)
- Origin Bank, Neighbors FCU, Sabine State Bank, The Evangeline Bank extract successfully from js_rendered content (36, 1, 6 fees respectively)
- First Guaranty Bank blocked by Cloudflare; Resource Bank returns 403 Forbidden during extraction—both represent institutional blocking, not missing content
- Barksdale FCU (52 fees), First Federal Bank of Louisiana (9 fees)—both PDFs discovered and extracted successfully
- b1BANK, Gulf Coast Bank, BOM Bank all 'discover=failed (No links found on homepage)' but extraction never attempted—suggests discovery method too narrow

### Promoted to National
- Improve discovery agent accuracy: page categorization confidence is misleading. Consider validation step before marking discover=ok.
- Maintain institution-specific URL inventory for known publishing patterns rather than relying on discovery for common publishers.
- JS rendering is viable extraction method; discovery failure on these sites doesn't indicate content absence.
- Flag blocked sites separately from missing-content failures; different remediation needed (technical access vs. content discovery).
- Prioritize PDF discovery links in financial institution sites; high success rate warrants dedicated extraction pipeline.
- Homepage-only discovery insufficient for banking sites; implement secondary discovery via site structure crawling or known banking fee page patterns (/fees, /disclosures, /pricing).

## Run #89 — 2026-04-07
Discovered: 4 | Extracted: 86 | Failed: 158

### New Patterns
- JavaScript-rendered fee schedules are extractable but often yield zero fees
- Cloudflare blocking prevents discovery entirely
- Homepage discovery fails for community/regional banks; fees often nested deeper
- PDF extraction more reliable than HTML/js_rendered when classification succeeds
- Access control errors block extraction after successful classification
- Disclaimers/T&C pages mention fees but don't contain schedules
- Skip logic inconsistently applied; no clear skip criteria

### Site Notes
- Origin Bank, Neighbors Federal Credit Union, Sabine State Bank, The Evangeline Bank all classified as js_rendered but extraction failed or returned minimal fees (1-44). Content may be dynamically loaded but incomplete.
- First Guaranty Bank blocked by Cloudflare security service during discovery phase. Cannot progress past this barrier.
- 8 Louisiana banks failed discovery because homepages lack direct fee schedule links (b1BANK, Gulf Coast Bank, BOM Bank, etc.). Suggests fees are buried in disclosure/legal sections rather than main navigation.
- PDFs that reach extraction stage (Barksdale FCU: 54 fees, First Federal Bank of Louisiana: 8 fees, EFCU: 1 fee) produced results. HTML/js_rendered either failed extraction or returned minimal data.
- Resource Bank classified as html but returned 403 Forbidden on extraction attempt (https://www.resource.bank/personal-checking). Page may be behind authentication or have IP-based restrictions.
- Red River Bank (T&C page), Investar Bank (disclaimers page), Home Bank (account documents page) all failed because they reference fees without listing them. Crawler stopped at non-schedule pages.
- 14 institutions marked 'skipped' on discover phase but progressed to classify/extract (Origin Bank, Barksdale FCU, Neighbors FCU, First American Bank, Sabine State Bank, FIDELITY BANK, EFCU, Jonesboro State Bank, First Federal Bank, Evangeline Bank, Resource Bank, Pelican FCU). Skip reason empty ().

### Promoted to National
- js_rendered classification doesn't guarantee fee data presence; may indicate obfuscated or incomplete rendering of fee tables
- Cloudflare-protected sites require alternative discovery approach; standard web scraping fails at initial access
- Small regional banks rarely link fee schedules from homepage; crawlers need to probe disclosure/legal/compliance sections specifically
- PDF-based fee schedules have higher extraction success rate; may warrant prioritizing PDF discovery over web pages
- HTML pages reachable during classification may become inaccessible during extraction; requires retry logic or session handling
- Fee mentions in legal text should trigger deeper crawl; current discovery stops at pages that mention but don't display fee data
- Skip logic needs clarification: if institution is skipped during discovery, clarify why it proceeds to classification/extraction
