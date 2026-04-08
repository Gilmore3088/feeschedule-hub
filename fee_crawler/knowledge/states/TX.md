# TX Fee Schedule Knowledge


## Run #83 — 2026-04-07
Discovered: 175 | Extracted: 265 | Failed: 475

### New Patterns
- JS-rendered pages with fee schedule content discoverable but extraction failing
- Security service blocking (Cloudflare, security check pages)
- PDF-based fee schedules extract successfully
- Discover skipped → classify succeeds at higher rates
- HTTP/2 protocol errors on specific domains
- Direct fee schedule PDF links on homepage = 100% extraction success

### Site Notes
- Charles Schwab Bank, Prosperity Bank, Southside Bank, TBK BANK all show 'Page contains fee schedule content' or similar discovery success but extract=failed with 'no fees extracted'. Suggests fee content is dynamically loaded or structured in ways standard extraction doesn't capture.
- First Financial Bank (security service blocks), Sunflower Bank (Cloudflare denied), Broadway National Bank (captcha screen). These are discovery failures due to bot detection rather than missing content.
- Randolph-Brooks FCU, Security Service FCU, American Airlines FCU all classify as PDF and extract 36+, 39, 5 fees respectively with high success rate.
- Frost Bank, Texas Capital Bank, Randolph-Brooks FCU, Security Service FCU, Amarillo National Bank, International Bank of Commerce, Woodforest all skipped discovery but classified and extracted successfully. Suggests discovery skip is not predictive of extraction failure.
- Comerica Bank failed with net::ERR_HTTP2_PROTOCOL_ERROR. Single incident but reproducible.
- American Airlines FCU: 'Direct fee schedule link found on homepage' → classify PDF → extract 5 fees with validation pass. Vantage Bank Texas: Fee link found on /fee-schedule.pdf.

### Promoted to National
- JS-rendered fee schedules may require enhanced DOM parsing or waitForSelector strategies; consider secondary extraction pass on dynamically-loaded content
- Security-blocked sites may require headless browser authentication workarounds or manual intervention flagging; not actual missing data
- PDF extraction pipeline is reliable; prioritize discovering PDF fee schedule links over HTML parsing
- Discovery skip may be overly conservative; consider proceeding to classification/extraction on all institutions regardless of discovery status
- HTTP/2 connection issues may require fallback to HTTP/1.1 or connection retry logic
- Discover should explicitly search for direct fee schedule PDF links; these are high-confidence extraction targets

## Run #123 — 2026-04-07
Discovered: 12 | Extracted: 273 | Failed: 467

### New Patterns
- JS-rendered pages with fee content classified correctly but extraction fails
- PDF-based fee schedules consistently successful
- Security services blocking discovery at homepage level
- HTML static pages yield high fee counts
- Landing/resource pages mislabeled or absent fee information
- Missing website_url prevents discovery entirely

### Site Notes
- Charles Schwab Bank, Prosperity Bank, Southside Bank, TBK BANK all classify as js_rendered but extract=failed (no fees extracted). Suggests fee information exists in DOM but extraction logic cannot locate it.
- Randolph-Brooks FCU (37 fees), Security Service FCU (39 fees), American Airlines FCU (4 fees) all extracted successfully from PDF format. PDF classification and extraction appears reliable.
- Comerica (net::ERR_HTTP2_PROTOCOL_ERROR), First Financial Bank (security service blocks), Sunflower Bank (security service blocks), Broadway National Bank (captcha/security check). Affects discover phase before content analysis possible.
- Texas Capital Bank (47 fees, HTML), International Bank of Commerce (48 fees, HTML). Static HTML without JS rendering produces larger, more complete extractions.
- NexBank (news article page), PlainsCapital (empty content), Stellar Bank (resources/FAQ links only), Third Coast (privacy notice). Discovered URLs are not actual fee schedule pages.
- Charles Schwab Premier Bank, SSB and Charles Schwab Trust Bank both failed with 'no website_url'. Data source issue rather than extraction problem.

### Promoted to National
- JS-rendered fee pages may require DOM selector refinement or post-render timing adjustment before extraction
- Prioritize PDF extraction for credit unions and institutions publishing fee schedules as downloadable documents
- Security-protected institutions require alternative discovery methods; consider user-agent rotation or secondary URL patterns
- HTML-based fee pages may contain more comprehensive fee schedules than JS-rendered equivalents
- Discover phase needs secondary link-following logic to distinguish landing pages from actual fee schedule documents
- Validate institution dataset completeness before running discovery; missing URLs block entire institutions
