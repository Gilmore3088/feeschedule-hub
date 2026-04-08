# CO Fee Schedule Knowledge


## Run #82 — 2026-04-07
Discovered: 35 | Extracted: 62 | Failed: 70

### New Patterns
- Cloudflare security blocks automated discovery - affects fee schedule access at some institutions
- PDF documents titled 'Disclosure of Account Terms' or 'Privacy Notice and Unified Disclosure' frequently contain fee schedules but extraction often fails
- JavaScript-rendered pages show inconsistent extraction results - some succeed (Bellco, Premier, Westerra all classify as js_rendered but extraction fails)
- HTML-classified pages show higher extraction success than PDFs or JS-rendered content
- Some institutions publish fee information on /resources, /disclosures pages rather than main banking products pages
- FirstBank, ANB Bank, Bank of Colorado discovered pages contain interest rate/APY info but explicitly lack fee schedule links

### Site Notes
- Elevations Federal Credit Union: Cloudflare blocks crawler, preventing fee discovery entirely
- Points West Community Bank, Colorado Federal Savings Bank: PDF found but extraction yielded 0 or minimal fees despite correct document identification
- Bellco Federal Credit Union, Premier Members Federal Credit Union, Westerra Federal Credit Union: All js_rendered classified but extraction=failed with no fees
- Air Academy (html, 53 fees), Credit Union of Colorado (html, 38 fees), First Western Trust (html, 20 fees) - HTML extraction substantially outperformed other formats
- Alpine Bank (/resources page), The Eastern Colorado Bank (/disclosures page) - discovery strategy must check secondary navigation paths
- Multiple Colorado banks embed rate pages in discovery but these are rates-only, not fee schedules - requires better filtering

### Promoted to National
- Cloudflare-protected sites need alternative retrieval methods or manual intervention strategy
- Disclosure PDFs require improved extraction parsing - may use tables or non-standard formatting
- JS-rendered content extraction reliability is low - requires DOM state verification or alternative rendering approach
- Prioritize HTML page extraction; investigate why PDF and JS extraction underperforms despite successful discovery
- Expand discovery crawl to include /resources, /disclosures, /legal paths as standard practice
- APY/interest rate pages frequently appear in search but lack fee data - implement filtering to skip non-fee pages

## Run #87 — 2026-04-07
Discovered: 0 | Extracted: 63 | Failed: 69

### New Patterns
- JS-rendered pages show mixed extraction results - some succeed (Bellco, Premier) while others fail despite successful classification
- PDF format shows highest success rate with consistent extractions
- Homepage discovery failures often lead to skipped discovery entries for same institution
- Cloudflare blocking represents infrastructure barrier to discovery
- HTML-classified pages show variable success - some excellent (Air Academy 54 fees, Eastern Colorado 39 fees) others complete failures
- Extract failures on classified documents suggest content exists but doesn't match extraction patterns
- Generic informational pages (About Us, overview pages) are common homepage content that don't contain fee schedules

### Site Notes
- Bellco Federal Credit Union and Premier Members Federal Credit Union both classified as js_rendered but extraction failed with 'no fees extracted', suggesting rendering may not capture fee tables or content structure differs from expected format
- NBH Bank, Alpine Bank, Colorado Federal Savings Bank, Credit Union of Denver, Solera National Bank all extracted successfully from PDFs, but some PDFs still fail (Alpine Bank, Westerra, Points West)
- Multiple institutions (FirstBank, Bank of Colorado, Canvas Federal Credit Union, ANB Bank) failed discovery because fee schedules weren't linked from homepage, but system eventually accessed content through skipped discovery pathway
- Air Academy Federal Credit Union extracted 54 fees from HTML while other HTML pages extracted 19-39, suggesting HTML format preserves more granular fee data when properly structured
- Alpine Bank, Bellco, Westerra, Premier Members, Points West all classified successfully but extraction failed - indicates pattern mismatch rather than missing documents

### Promoted to National
- Elevations Federal Credit Union blocked by Cloudflare - may need specialized handling or alternate access method for security-protected sites
- FirstBank, Bank of Colorado, ANB Bank, Fortis Bank, Timberline Bank, AMG National Trust Bank show pattern of fee schedules being deeper in site architecture, not on homepage or main navigation

## Run #91 — 2026-04-07
Discovered: 4 | Extracted: 63 | Failed: 69

### New Patterns
- JS-rendered pages with fee schedule links often fail extraction despite successful discovery
- PDF format shows highest extraction success rate relative to discovery
- HTML-based fee pages extract well when accessible
- Security blocks prevent discovery but should be treated as publishable content
- Wrong page discovery (About Us, Contact, Client Resources) suggests inadequate link following depth
- Extract failures on PDF/HTML after successful classification indicate content structure issues rather than format problems

### Site Notes
- FirstBank, Bellco, Timberline Bank, Premier Members all discovered but extraction failed on js_rendered content - suggests rendering may strip or obscure fee table structure
- NBH Bank, Ent Federal, Alpine, Colorado Federal Savings, Credit Union of Denver, Solera all classified as PDF with mostly successful extractions (4-38 fees) - PDFs appear more consistently structured
- Credit Union of Colorado (38 fees) and Air Academy Federal (50 fees) both HTML format with strong extraction - suggests native HTML fee tables are reliably parseable
- Elevations Federal Credit Union blocked by security service - indicates institution publishes fee schedules but access requires bypassing security barriers
- Bank of Colorado, ANB Bank, Fortis Bank all discovered wrong pages - indicates homepage navigation links to fee schedules may require 2+ hops or specific navigation patterns
- Canvas Federal and NBH Bank skipped discovery but NBH succeeded in extraction - some institutions may have fee schedules in predictable locations without discoverable links
- Alpine Bank (PDF), Westerra, Points West (all PDFs) classify correctly but extract fails - suggests some institutions embed fee information in non-standard PDF layouts or tables

### Promoted to National
- PDF format appears most reliable for fee extraction across institutions - prioritize PDF discovery and classification
