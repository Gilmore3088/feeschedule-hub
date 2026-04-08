# WA Fee Schedule Knowledge

## Run #215 — 2026-04-07
Discovered: 2 | Extracted: 64 | Failed: 43

### Key Patterns
- **JS-rendered pages**: High classification success but extraction fails consistently (Boeing Employees FCU, Washington Trust Bank show 0 fees). Likely requires dynamic content stabilization or extended wait time.
- **PDF documents**: Consistently extract successfully with high reliability (Spokane Teachers FCU: 49 fees, Peak FCU: 1 fee, Harborstone FCU: successful). Structure/layout variance explains fee count differences, not format itself.
- **HTML-classified pages**: Most reliable for extraction (WaFd, Banner, Heritage: 33-34 fees consistently). Sound Federal FCU is outlier (failed despite HTML classification).
- **Minimal fee disclosure**: Gesa, Peak, Numerica, Hapo (1-2 fees) extract successfully; likely reflects actual online publication limits rather than extraction failure.
- **Discovery bottleneck**: 0 discoveries in recent runs despite process success. Run #215 achieved 2 discoveries with keyword-based page detection; others relied on pre-identified URLs.

### Site Notes
- **Boeing Employees FCU, Washington Trust Bank**: JS-rendered, 0 fees extracted despite classification success. Contrast with Washington State Employees FCU and Coastal Community Bank (JS-rendered, successful extraction).
- **Spokane Teachers FCU vs Harborstone FCU**: Both PDFs but 49 vs 0 fees. PDF structure inconsistency significant.
- **1st Security Bank of Washington**: Discover failed with hint "Fee schedules found in Security and Privacy section"—requires non-standard navigation.
- **Sound Federal FCU**: HTML-classified but extraction failed—investigate outlier status.

### Promoted to National
- JS-rendered fee schedules need dynamic content stabilization before extraction; classification success insufficient
- PDF extraction reliable; prioritize PDF discovery paths
- Low fee counts (1-2) likely reflect actual disclosure limits; flag for manual verification if anomalous
- Keyword-based discovery filtering effective; implement for financial institution pages
- Discover skipping masks accessible content; restore discovery process with pre-filtering
## v3.0 Campaign Summary — 2026-04-07
- Coverage: 74% (78/105 addressable)
- Total institutions: 107 (excluded: 2)
- Institutions with URL but no fees: needs investigation
