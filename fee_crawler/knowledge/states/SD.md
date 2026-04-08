# SD Fee Schedule Knowledge


## Run #20 — 2026-04-06
Discovered: 22 | Extracted: 24 | Failed: 65

### New Patterns
- PDF documents consistently extract better than HTML/JS-rendered pages
- JS-rendered pages discovered successfully but fail at extraction
- Account disclosure/comparison pages are poor discovery targets
- Footer links to compliance disclosures may not contain actionable fee data
- Direct fee schedule URLs dramatically improve extraction success

### Site Notes
- Black Hills Federal Credit Union (68 fees), American Bank & Trust (46 fees), Dakotaland Federal Credit Union (42 fees), and Levo Federal Credit Union (42 fees) all successfully extracted from PDFs, while js_rendered and html pages frequently fail at extraction stage despite successful discovery
- The Bancorp Bank, First PREMIER Bank, First Dakota National Bank, and Black Hills Community Bank all had discover=ok with js_rendered classification, yet extract=failed, suggesting JavaScript-rendered content discovery methods don't reliably capture extractable fee data
- Multiple institutions (Sunrise Banks, The First National Bank in Sioux Falls, First Fidelity Bank) failed discover when agent targeted account feature/comparison pages rather than dedicated fee schedules, indicating these pages show features but lack structured fee links
- First Dakota National Bank had discover=ok on 'Deposit Account Disclosures' footer link with js_rendered classification, but extract=failed, suggesting compliance disclosure pages structure data differently than fee schedules
- The Bancorp Bank (/fee-schedule.pdf), CorTrust Bank, and Wells Fargo all discovered direct fee schedule pages/PDFs and achieved extract=ok, while institutions requiring navigation through product pages had higher failure rates

### Promoted to National
- Credit unions outperform banks in SD dataset - 5 credit unions all extracted successfully (total 194 fees) vs mixed results for banks, suggesting credit unions may publish fee schedules more consistently or in more extraction-friendly formats

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 34% (30/87 addressable)
- Total institutions: 89 (excluded: 2)
- Institutions with URL but no fees: needs investigation
