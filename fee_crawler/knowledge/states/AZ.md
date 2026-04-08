# AZ Fee Schedule Knowledge


## Run #119 — 2026-04-07
Discovered: 5 | Extracted: 24 | Failed: 22

### New Patterns
- PDF-based fee schedules extract reliably; HTML and js_rendered formats show extraction fragility
- Discovery skip strategy masks actual discovery capability gaps
- Extract failures on classified documents indicate extraction logic doesn't match document structure

### Site Notes
- AZ: 9/11 successful extractions were from PDFs. JS-rendered documents (USAA, Truwest, 1st Bank Yuma) failed extraction despite successful classification, suggesting rendering doesn't guarantee structured fee data.
- AZ: 11 institutions skipped discovery entirely; 4 institutions had explicit discover=failed. Pattern suggests systematic skipping may hide institutions without online fee schedules (USAA Federal, Truwest, Pima, Tucson FCU, 1st Bank Yuma all failed extract despite PDF classification).
- AZ: Pima FCU, Tucson FCU, and 1st Bank Yuma classified successfully but yielded zero fees. Suggests extraction templates or regex patterns miss institutional fee formatting variations.
- AZ: Western Alliance Bank and BNC National Bank discovery failed with 'checking product page' type errors—institutions hosting fee schedules only behind account-type-specific pages rather than dedicated disclosure pages.

### Promoted to National
- Credit unions outperform banks in fee schedule publication rates. AZ shows 14/15 credit unions attempted (12 successful extracts) vs 4/5 banks (1 successful extract). Federal credit union charter may mandate fee transparency differently than commercial banks.

## Run #122 — 2026-04-07
Discovered: 0 | Extracted: 23 | Failed: 23

### New Patterns
- JS-rendered pages consistently fail at extraction despite successful classification
- PDF-based fee schedules show strong extraction success rate
- Extract failures on PDFs classified as containing no visible fee content
- Discover skipping represents majority of workflow (20/23 classified directly)
- Discover failures cite lack of visible links on product pages

### Site Notes
- USAA, Truwest, 1st Bank Yuma, First Federal Credit Union all classified as js_rendered but extraction failed or yielded minimal fees. Suggests rendering may not be capturing fee tables or extraction logic doesn't handle JS-rendered layouts well.
- Hughes Federal (49 fees), Southwest Heritage (54 fees), Oneaz (30 fees), Copper State (28 fees) all PDFs with successful extractions. Consistent performance across multiple Arizona credit unions.
- Desert Financial, Pima Federal, Tucson Federal all classified as PDF but extraction failed with 'no fees extracted'. May indicate PDFs exist but don't contain traditional fee schedule format.
- Most Arizona institutions had discover step skipped, suggesting URLs were pre-populated rather than discovered. Limits learning about actual fee schedule discoverability on these sites.
- Western Alliance, Vantage West, BNC National Bank all failed discover with messages about feature pages lacking fee schedule links. Indicates fee schedules may be behind account login or in non-obvious locations.

### Promoted to National
- JS-rendered fee schedule pages require different extraction strategy than PDF/HTML; consider specialized parser for dynamic content
- PDF documents remain most reliable format for automated fee extraction; prioritize PDF discovery in workflows
- PDF classification alone insufficient; need secondary validation that PDF contains structured fee data before extraction attempt
- Consider re-running subset with discover enabled to assess actual website structure and fee schedule accessibility
- Arizona banks show pattern of hiding fee schedules; may require authenticated access or separate disclosure documents

## Run #130 — 2026-04-07
Discovered: 1 | Extracted: 25 | Failed: 21

### New Patterns
- JS-rendered fee schedule pages frequently fail extraction despite successful classification
- PDF-based fee schedules show high extraction success rate (6/8 successful extractions)
- Discover failures on generic banking pages that lack direct fee disclosure links
- HTML-classified pages show mixed but functional results
- Extract failures on js_rendered pages may indicate timeout or incomplete page load

### Site Notes
- USAA, Truwest, and 1st Bank Yuma all classified as js_rendered but extraction returned zero fees. Suggests rendering may not be capturing dynamic fee tables or content structure differs from expected format.
- Desert Financial, Oneaz, Hughes, Southwest Heritage, Arizona Central, Copper State, and Sunwest all successfully extracted fees from PDFs with strong counts (28-54 fees). Only Pima and Tucson PDFs failed.
- Western Alliance, Vantage West, and BNC National Bank all failed discovery on pages with general checking account info but no direct fee schedule links. Discovery logic may need to follow secondary navigation paths.
- Arizona Financial extracted only 1 fee from HTML while Credit Union West extracted 45 from HTML. Format alone doesn't predict extraction quality.
- Pima (PDF classified but extract failed) and Tucson (PDF classified but extract failed) suggest classification may be mislabeling or extraction pipeline has conditional failures on certain document structures.

### Promoted to National
- JS-rendered fee pages warrant investigation of extraction logic—may need DOM structure adjustment or post-render content parsing verification
- PDF extraction pipeline is reliable; prioritize PDF discovery in financial institution websites
- Banking sites increasingly bury fee schedules behind secondary navigation or account type pages; static discovery URLs insufficient
