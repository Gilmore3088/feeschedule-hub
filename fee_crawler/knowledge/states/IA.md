# IA Fee Schedule Knowledge


## Run #37 — 2026-04-07
Discovered: 58 | Extracted: 79 | Failed: 217

### New Patterns
- PDF-based fee schedules extract reliably when accessible; HTML-rendered pages frequently fail extraction even after successful discovery
- JS-rendered pages show 0% extraction success in this run despite successful classification
- Security/access blocks during discovery are unrecoverable without manual intervention
- Discovery failures cluster around vague homepage analysis rather than targeted footer/disclosure/compliance pages
- Skipped discoveries (no attempt made) represent missed opportunities; several skipped institutions later classified successfully

### Site Notes
- Veridian, West Bank, Dupaco, Bank Iowa, Luana Savings, Security National all succeeded with PDFs (36-56 fees each). Central Bank discovered Disclosures link but JS-rendered page yielded no fees.
- Principal Bank, MidWestOne Bank, Central Bank, Collins Community Federal Credit Union all classified as js_rendered but failed extraction
- Bankers Trust blocked by security service; Cedar Rapids returned 403 on extracted PDF URL; Farmers State Bank connection failed to onbase.fsb1879.com
- Greenstate, Hills Bank, Northwest, Quad City, United Bank, First Citizens, Lincoln Savings, Availa, CBI Bank, American State, Bank Midwest all failed discovery with generic page descriptions
- Community State Bank discovered ACH Reference Guide but extracted only 1 fee—suggests partial/incomplete document or extraction targeting wrong section
- Principal Bank, MidWestOne, Veridian, West Bank, Dupaco, Cedar Rapids, Bank Iowa, Luana, Security National, Farmers State, Collins Community were skipped but mostly classified OK

### Promoted to National
- Prioritize PDF discovery/classification pathways over JS-rendered HTML for fee extraction success rates
- JS-rendered content requires different extraction strategy; current approach ineffective for this format
- Flag institutions using external document hosting (onbase, LPL) or security-gated content as requiring special handling
- Improve discovery prompts to specifically check footer sections, compliance/disclosures pages, and 'about/legal' sections before homepage analysis
- Validate extracted fees against document length; single-digit extractions from multi-page PDFs indicate extraction scope problems
- Review skip logic; automated classification succeeded where discovery was skipped, suggesting skip criteria may be too conservative

## Run #50 — 2026-04-07
Discovered: 10 | Extracted: 79 | Failed: 217

### New Patterns
- Help Center is a common location for fee schedules and account disclosures at FIs
- PDF-hosted fee schedules consistently extract successfully when accessible
- JavaScript-rendered pages fail extraction despite successful classification
- Security/WAF blocks prevent discovery crawl completion
- Third-party document hosting causes extraction failures via 403/connectivity errors
- Generic account feature pages without explicit fee schedule links are difficult discovery targets
- Skipped institutions (no attempted discovery) correlates with later successful extractions

### Site Notes
- Greenstate Federal Credit Union discovery failed - Help Center should be targeted as primary discovery location for credit unions
- Iowa institutions using PDFs (Veridian, West Bank, Dupaco, Bank Iowa, Luana, Security National, Community State, Farmers State) had 7/8 successful extractions
- Principal Bank, MidWestOne Bank, Central Bank, Collins Community Federal Credit Union all classified as js_rendered but extracted zero fees - rendering may not preserve fee table structure
- Bankers Trust Company blocked by security service during discovery - indicates aggressive blocking of automated access
- Cedar Rapids Bank (403 on lpl.com), Farmers State Bank (onbase.fsb1879.com connection timeout) - external document repositories require special handling
- Northwest Bank, Quad City Bank, United Bank of Iowa, First Citizens Bank, Lincoln Savings Bank, Availa Bank, CBI Bank, American State Bank, Bank Midwest, Iowa State Bank all discovered to generic product/education pages rather than fee schedules
- All 10 successful discoveries were skipped in discovery phase but succeeded in extraction - suggests skipped may indicate institutions with known/reliable PDF hosting patterns

### Promoted to National
- PDF-based fee schedules are most reliable format for automated extraction; prioritize PDF discovery paths over HTML/JS-rendered content

## Run #63 — 2026-04-07
Discovered: 3 | Extracted: 83 | Failed: 213

### New Patterns
- JS-rendered pages frequently fail extraction even when classified correctly
- PDF extraction failures often result from access restrictions rather than format issues
- Cloudflare and security services block discovery phase
- Credit unions with simple PDFs on primary domain perform best
- Discovery fails when fee information mentioned inline without dedicated link
- Skipped discover phase correlates with successful extraction when classification succeeds

### Site Notes
- Principal Bank, MidWestOne Bank, Central Bank, Collins Community Federal Credit Union all classified as js_rendered but yielded no fees
- Cedar Rapids Bank (403 Forbidden), Dupaco (404 Not Found), Farmers State Bank (connection timeout) - all PDFs but inaccessible
- Bankers Trust Company blocked by Cloudflare security service during discover phase
- Veridian (41 fees), West Bank (44), Bank Iowa (37), Luana Savings (41), Security National Bank (41) all succeeded with direct PDF classification
- United Bank of Iowa, CBI Bank & Trust show fees in account descriptions but no dedicated fee schedule link; discovery algorithm misses these
- All skipped discovers that reached extract phase with PDF/HTML classification succeeded (5 of 6 succeeded)
- Iowa State Bank discover succeeded with 'View Disclosures' link pattern - validates that disclosure-focused language is reliable indicator

### Promoted to National
- JS-rendered fee schedule pages may require additional rendering time or post-render parsing; consider timeout/retry strategy
- PDF URLs frequently protected by indirect hosting (CDNs, document servers); implement pre-flight HTTP checks before extraction attempt
- Security services interfere with automated discovery; may need to classify these as 'blocked' rather than failed
- Institutions publishing fee schedules as public PDFs on main domain are most reliably extractable
- Need fallback discovery pattern for institutions that embed fee info in product pages rather than linking to schedules
- Skip discover phase for known-good URLs; move directly to classification for faster processing
- Prioritize searching for 'Disclosures' link text in discovery; more reliable than generic 'fee schedule' terminology
