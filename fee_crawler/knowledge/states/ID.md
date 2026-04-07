# ID Fee Schedule Knowledge


## Run #22 — 2026-04-06
Discovered: 6 | Extracted: 13 | Failed: 23

### New Patterns
- Footer disclosure links ('Disclosures', 'Important Notices & Policies') frequently indicate fee schedule locations but are not directly discoverable via automated link extraction
- PDF-based fee schedules that are discovered and classified correctly still fail extraction at high rates (3 out of 5 PDF discoveries failed extraction)
- JavaScript-rendered pages show mixed results: some extract successfully (Farmers Bank: 38 fees) while others fail completely (Freedom Northwest, Lewis Clark)
- Product comparison pages (checking account comparisons) do not contain fee details - users must navigate to individual product pages
- Product brochure PDFs (as opposed to fee schedule PDFs) rarely contain structured fee data suitable for extraction
- Six institutions succeeded with skipped discovery phase - indicates prior knowledge/manual seed URLs were effective for 40% of successful extractions

### Site Notes
- The Bank of Commerce and Capital Educators FCU have fee information behind footer disclosure links that standard discovery methods miss
- Freedom Northwest and Lewis Clark (both js_rendered) failed extraction despite successful classification, suggesting rendering inconsistency or dynamic content loading issues
- Idaho First Bank's checking comparison page required individual product navigation that wasn't automatically followed
- Westmark FCU published product brochures as PDFs but these were marketing materials rather than fee schedules

### Promoted to National
- PDF extraction reliability is a critical bottleneck - Trugrocer, Lookout, and Connections FCUs all had discoverable PDFs but zero fees extracted. Investigate PDF parsing/OCR quality issues.
- Manual curation of direct fee schedule URLs significantly outperforms automated discovery for this state
