# MS Fee Schedule Knowledge


## Run #42 — 2026-04-07
Discovered: 5 | Extracted: 43 | Failed: 70

### New Patterns
- JS-rendered pages with fee content fail extraction despite successful classification
- HTTP/2 protocol errors indicate infrastructure issues at financial institutions
- Discover-phase hints reveal common fee schedule locations banks don't surface
- Security checkpoint pages block automated access
- Redirect to wrong content type indicates poor fee schedule organization
- PDF extraction consistently outperforms HTML and js_rendered formats

### Site Notes
- Cadence Bank and Story Bank both classified as js_rendered but extraction returned zero fees. Suggests rendering may not be capturing dynamic fee tables or content is loaded after initial render completes.
- Renasant Bank failed with net::ERR_HTTP2_PROTOCOL_ERROR - likely server-side HTTP/2 implementation problem, not client issue.
- Multiple failures noted fee schedules exist on 'personal checking account pages' (Guaranty Bank, Citizens Bank of Philadelphia) and Terms of Use PDFs (Bank of Commerce) but aren't linked from homepage. These require targeted navigation.
- PriorityOne Bank presents browser verification screen blocking discovery. Indicates modern bot detection is active.
- FNB Oxford Bank returned 404 on Customer Resources page; BNA Bank investor relations page instead of fee schedule; Hope Federal showed rates page instead of fee schedule.
- PDF sources (Keesler FCU: 8 fees, Citizens National: 49 fees, Merchants & Marine: 2 fees, Community Bank: 4 fees) show reliable extraction. HTML sources (First State Bank: 15, Peoples Bank: 47) also strong. JS-rendered sources (Cadence: 0, Story Bank: 0) consistently fail.

### Promoted to National
- JS-rendered fee schedules require validation that content actually rendered before extraction attempt; may need extended wait times or interaction simulation.
- HTTP/2 errors are infrastructure-specific and should be retried; may indicate institutions with outdated or misconfigured web servers.
- Standard homepage discovery is insufficient for ~25% of banks; secondary navigation paths (account type pages, terms documents) must be crawled systematically.
- Some institutions implement anti-bot verification that standard crawling cannot bypass; may require session handling or alternative access methods.
- Poor URL structure at some institutions means fee schedule URLs are either deprecated or mislabeled, requiring content-type validation during discovery.
- Prioritize discovery toward PDF and HTML fee schedules; js_rendered content requires enhanced rendering verification before extraction.

## Run #45 — 2026-04-07
Discovered: 1 | Extracted: 42 | Failed: 71

### New Patterns
- js_rendered pages show high failure rate in extraction despite successful classification
- PDF format shows consistently high success across institutions
- Discover failures with vague reasoning suggests weak discovery prompts
- HTTP/2 protocol errors indicate infrastructure issues beyond content classification
- HTML pages with high extraction counts outperform other formats in this run

### Site Notes
- Cadence Bank and Story Bank DBA Story Financial Partners both classified as js_rendered but extraction failed with 'no fees extracted'. Suggests JS rendering may not be capturing fee content properly or content is dynamically loaded after initial render.
- Keesler Federal Credit Union (8 fees), Community Bank of Mississippi (4), BankFirst Financial Services (3), The Citizens National Bank of Meridian (50), and Merchants & Marine Bank all classified as PDF. Only Merchants & Marine Bank failed extraction despite PDF classification.
- Multiple discover failures mention page content but dismiss it (e.g., 'Account Services page is likely to contain' for Guaranty Bank, 'Personal checking pages typically contain' for The Citizens Bank of Philadelphia). These suggest the discovery agent is second-guessing itself despite finding relevant pages.
- Renasant Bank failed at discover stage with net::ERR_HTTP2_PROTOCOL_ERROR. Not a content problem but a connection problem.
- First State Bank (15 fees) and The Peoples Bank, Biloxi (45 fees) both HTML format with strong extraction. Suggests well-structured HTML tables or semantic markup.

### Promoted to National
- js_rendered content type requires validation that extraction is actually working post-render; may need extended wait times or additional JS execution
- PDF-based fee schedules are more reliable for automated extraction; prioritize PDF discovery in future institution research
- Review discovery prompt logic to avoid false-negative rejections when landing pages clearly indicate fee schedule existence
- Implement retry logic with protocol downgrade (HTTP/1.1) for institutions experiencing HTTP/2 errors
- HTML pages with native table structures may yield better extraction than JS-heavy sites; investigate if source HTML is more maintainable than relying on JS rendering

## Run #49 — 2026-04-07
Discovered: 0 | Extracted: 42 | Failed: 71

### New Patterns
- js_rendered pages show high extraction failure rate despite successful classification
- PDF-based fee schedules consistently extract successfully
- Discovery failures on checking account pages often due to wrong landing page
- High-yield extractions from single institutions suggest concentrated fee documentation
- HTML pages show variable extraction success (2-44 fees)

### Site Notes
- Cadence Bank and Story Bank DBA Story Financial Partners both classified as js_rendered but failed extraction, suggesting rendered content may not contain structured fee data or extraction logic doesn't handle dynamic layouts well
- Keesler Federal Credit Union (8 fees), Community Bank of Mississippi (4 fees), BankFirst Financial Services (3 fees), and Merchants National Bank all used PDFs; only Merchants & Marine Bank failed despite PDF classification, indicating PDF format is reliable when extraction succeeds
- Multiple banks (Guaranty Bank, Citizens Bank of Philadelphia MS, PriorityOne Bank, Bank of Commerce) failed discovery because agent landed on security/rates/investor pages instead of personal checking/fee schedule pages—suggests need for better initial URL targeting
- The Citizens National Bank of Meridian (46 fees) and The Peoples Bank Biloxi (44 fees) massively outperformed peers—both HTML/classified as complex docs; may indicate these institutions publish detailed tiered fee matrices vs. simple schedules
- First Security Bank extracted 2 fees, First State Bank 13, The Peoples Bank 44—wide variance suggests HTML structure/formatting varies significantly across institutions; no consistent extraction failure pattern for HTML format itself
- Renasant Bank homepage discovery completely failed—may not publish fee schedules online or requires direct navigation to specific URL; confirm if institution intentionally obscures fee information

### Promoted to National
- None
