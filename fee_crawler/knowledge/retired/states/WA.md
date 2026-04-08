
## Pruned 2026-04-07

## Run #188 — 2026-04-07
## Run #189 — 2026-04-07
## Run #201 — 2026-04-07
## Run #214 — 2026-04-07
### New Patterns
- 'Direct fee schedule link found' discovery notes correlate with successful extraction except for js_rendered cases
- 1st Security Bank of Washington discover failed with hint 'Fee schedules and disclosures are often found in the Security and Privacy section' - suggests custom navigation rules needed for banks organizing fees in non-standard locations
- 1st Security Bank of Washington failed discovery—documents flagged as forms/applications rather than fee schedules. Suggests some banks don't publish fee schedules in standard discoverable locations.
- All 20 institutions show discover=skipped or discover=failed. The one discovery failure note ('Rates pages typically include fee schedules') suggests a specific URL pattern was tested but rejected.
- Boeing Employees FCU and Washington Trust Bank both classified as js_rendered but failed extraction with 'no fees extracted', while js_rendered pages like Washington State Employees FCU and Coastal Community Bank succeeded
- Boeing Employees FCU, Washington Trust Bank, Hapo Community FCU all discovered/classified correctly but extraction failed on js_rendered content. Suggests JavaScript rendering may obfuscate fee table structures.
- Boeing Employees FCU, Washington Trust Bank, Hapo Community FCU all use js_rendered format with 0 fees extracted despite successful classification. Suggests rendering is incomplete or fee tables are dynamically populated post-render.
- Boeing Employees FCU, Washington Trust Bank, Washington State Employees FCU, Coastal Community Bank all classified as js_rendered but Boeing and Washington Trust failed extraction with 'no fees extracted'. This suggests rendering succeeded but fee content structure differs from expected patterns.
- Boeing Employees FCU, Washington Trust Bank, and Washington State Employees FCU all classified as js_rendered but Boeing and Washington Trust failed extraction despite successful classification. JS rendering may not fully load fee schedule content.
- Commercial banks (WaFd, Banner, Heritage) all extracted 33-38 fees with consistent success. Federal credit unions show 1-64 fee extraction variance despite higher discovery success rate.
- Consider institution type (bank vs. credit union) in extraction validation thresholds
- Credit unions range from 1-61 fees extracted (high variance), banks range 33-37 fees (consistent). May indicate credit unions use less standardized fee schedule formatting.
- Credit unions show higher extraction variance than banks
- Credit unions with js_rendered fee documents frequently fail extraction despite successful discovery and classification
- Credit unions with minimal fee data (1-2 fees) appear to publish fee schedules in formats that extract successfully
- Direct fee schedule links are reliable indicators of extractable content unless page uses JavaScript rendering
- Discover failure reason provides actionable content hints
- Discovery skipping may be masking accessible fee schedules; implement keyword-based pre-filtering for financial institutions
- Federal credit union fee document standards less uniform than commercial bank standards
- Federal credit unions show better structured fee pages than commercial banks in WA
- Flag extractions under 10 fees for manual review—may indicate discovery/classification errors or genuinely minimal fee schedules
- Gesa (1 fee), Numerica (2 fees), Hapo (1 fee), and Peak (4 fees) all show very low extraction counts despite validate=ok. These may be partial extractions or institutions publishing minimal fee data.
- Gesa FCU (1), Peak FCU (4), Numerica FCU (2), Columbia Community FCU (4) show minimal extracted fees despite successful extraction. May indicate partial online publication of fee schedules.
- Gesa FCU, Peak FCU, Numerica FCU all extracted 1-2 fees despite successful page classification. May intentionally limit published fees or use different structures.
- Gesa FCU, Peak FCU, Numerica FCU, and Hapo FCU all extracted 1-2 fees without validation issues
- HTML-classified pages show consistent successful extraction (33-34 fees)
- HTML-classified pages show highest consistency in extraction success
- HTML-formatted fee schedules are most consistently parseable across institutions.
- Institutions with very low fee counts (1-5) may have incomplete online disclosure
- Investigate whether js_rendered classification requires secondary extraction strategy or stricter content validation before declaring extraction success
- JS rendering classification success does not guarantee extractable fee content; may need separate extraction patterns for dynamically-rendered fee schedules
- JS-rendered fee schedule pages may require dynamic content stabilization or additional wait time before extraction; classification success does not guarantee extractable structured data in JS contexts
- JS-rendered financial pages may require additional wait time or interaction simulation beyond basic rendering for fee extraction.
- JS-rendered pages classified successfully but extraction fails completely
- JS-rendered pages correlate with extraction failures
- JS-rendered pages show higher extraction failure rate despite successful classification
- JS-rendered pages with fee schedules often fail extraction despite successful classification
- Low fee count may indicate simplified or summary schedules; verify these institutions actually publish complete schedules rather than extracts
- Manual discovery trigger identified successful page for 1st Security Bank of Washington
- No discovery attempts despite 0 discovered institutions
- Only institution with discover=ok, suggesting keyword-based page detection ('Page contains fee schedule content') works; others skipped discovery
- PDF documents consistently extract successfully across varied fee counts
- PDF documents require content-type verification—some PDFs may be scanned images or have non-standard structures
- PDF extraction success for credit unions unpredictable—may require template-specific parsing by institution
- PDF fee extraction success correlates with document structure/layout, not just format type.
- PDF fee schedules from credit unions show high variability in extraction success (1-59 fees)
- PDF format institutions show high variance in fee count (1-51 fees)
- PDF format shows mixed reliability for extraction
- PDF-format fee schedules show high extraction reliability
- PDF-formatted fee schedules are reliable extraction targets; prioritize PDF discovery paths
- Single-digit fee extraction may indicate incomplete scraping
- Small credit unions publish minimal fee data online
- Smaller financial institutions may not publish comprehensive fee schedules online; extraction limits may reflect actual content availability.
- Sound Federal Credit Union classified as html but extraction failed with no fees found - outlier among html-classified institutions that otherwise succeeded consistently.
- Spokane Teachers FCU (49 fees), Peak FCU (1 fee), and Harborstone FCU all classified as pdf with successful extraction, indicating reliable PDF parsing
- Spokane Teachers FCU (58 fees), Peak FCU (4 fees), Harborstone FCU extracted from PDFs with high yield, but Harborstone failed extraction despite PDF classification. PDF format itself not deterministic.
- Spokane Teachers FCU (PDF, 57 fees) and Sound Federal FCU (HTML, 61 fees) extracted well, but Harborstone FCU (PDF) and Columbia Community FCU (PDF) failed. PDF extraction appears format-dependent, not format-guaranteed.
- Spokane Teachers FCU extracted 51 fees from PDF vs Peak FCU and Gesa FCU with only 1 fee each. Indicates PDF structure or content density varies dramatically even within same format classification.
- Spokane Teachers FCU extracted 59 fees from PDF vs Harborstone FCU extracted 0 from PDF despite both being PDFs. PDF structure inconsistency is significant.
- Spokane Teachers, Washington State Employees, Columbia Community FCU: direct links found → extraction ok. Hapo Community FCU: direct link found but js_rendered → extraction failed.
- WA run may have used pre-identified institution URLs rather than discovery crawl; consider whether this represents a process deviation
- WaFd Bank, Banner Bank, Heritage Bank all classified as html with 33-34 fees extracted. Most reliable format for extraction in this run.
- WaFd Bank, Banner Bank, Heritage Bank, Gesa FCU, Numerica FCU all html-classified with successful extraction (33, 34, 33, 1, 2 fees). Only Sound FCU (html) failed with 'no fees extracted'.
- js_rendered fee schedules need specialized extraction handling for credit union documents
Discovered: 0 | Extracted: 62 | Failed: 45
Discovered: 0 | Extracted: 64 | Failed: 43
Discovered: 0 | Extracted: 65 | Failed: 42
Discovered: 20 | Extracted: 64 | Failed: 43

