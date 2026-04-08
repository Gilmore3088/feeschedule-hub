# WA Fee Schedule Knowledge


## Run #188 — 2026-04-07
Discovered: 20 | Extracted: 64 | Failed: 43

### New Patterns
- Credit unions with js_rendered fee documents frequently fail extraction despite successful discovery and classification
- PDF fee schedules from credit unions show high variability in extraction success (1-59 fees)
- Federal credit unions show better structured fee pages than commercial banks in WA
- 'Direct fee schedule link found' discovery notes correlate with successful extraction except for js_rendered cases

### Site Notes
- Boeing Employees FCU, Washington Trust Bank, Hapo Community FCU all discovered/classified correctly but extraction failed on js_rendered content. Suggests JavaScript rendering may obfuscate fee table structures.
- Spokane Teachers FCU extracted 59 fees from PDF vs Harborstone FCU extracted 0 from PDF despite both being PDFs. PDF structure inconsistency is significant.
- Commercial banks (WaFd, Banner, Heritage) all extracted 33-38 fees with consistent success. Federal credit unions show 1-64 fee extraction variance despite higher discovery success rate.
- Spokane Teachers, Washington State Employees, Columbia Community FCU: direct links found → extraction ok. Hapo Community FCU: direct link found but js_rendered → extraction failed.
- 1st Security Bank of Washington failed discovery—documents flagged as forms/applications rather than fee schedules. Suggests some banks don't publish fee schedules in standard discoverable locations.

### Promoted to National
- js_rendered fee schedules need specialized extraction handling for credit union documents
- PDF extraction success for credit unions unpredictable—may require template-specific parsing by institution
- Federal credit union fee document standards less uniform than commercial bank standards
- Direct fee schedule links are reliable indicators of extractable content unless page uses JavaScript rendering

## Run #189 — 2026-04-07
Discovered: 0 | Extracted: 62 | Failed: 45

### New Patterns
- JS-rendered pages correlate with extraction failures
- PDF format shows mixed reliability for extraction
- Single-digit fee extraction may indicate incomplete scraping
- No discovery attempts despite 0 discovered institutions
- Credit unions show higher extraction variance than banks

### Site Notes
- Boeing Employees FCU, Washington Trust Bank, and Washington State Employees FCU all classified as js_rendered but Boeing and Washington Trust failed extraction despite successful classification. JS rendering may not fully load fee schedule content.
- Spokane Teachers FCU (PDF, 57 fees) and Sound Federal FCU (HTML, 61 fees) extracted well, but Harborstone FCU (PDF) and Columbia Community FCU (PDF) failed. PDF extraction appears format-dependent, not format-guaranteed.
- Gesa (1 fee), Numerica (2 fees), Hapo (1 fee), and Peak (4 fees) all show very low extraction counts despite validate=ok. These may be partial extractions or institutions publishing minimal fee data.
- All 20 institutions show discover=skipped or discover=failed. The one discovery failure note ('Rates pages typically include fee schedules') suggests a specific URL pattern was tested but rejected.
- Credit unions range from 1-61 fees extracted (high variance), banks range 33-37 fees (consistent). May indicate credit unions use less standardized fee schedule formatting.

### Promoted to National
- Investigate whether js_rendered classification requires secondary extraction strategy or stricter content validation before declaring extraction success
- PDF documents require content-type verification—some PDFs may be scanned images or have non-standard structures
- Flag extractions under 10 fees for manual review—may indicate discovery/classification errors or genuinely minimal fee schedules
- WA run may have used pre-identified institution URLs rather than discovery crawl; consider whether this represents a process deviation
- Consider institution type (bank vs. credit union) in extraction validation thresholds
