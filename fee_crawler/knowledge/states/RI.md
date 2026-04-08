# RI Fee Schedule Knowledge

## Run #220 — Pass 1 (tier1) — 2026-04-07
Discovered: 1 | Extracted: 6 | Failed: 14

### Key Patterns
- **Format Success Hierarchy**: PDFs extract reliably (100% credit union success); HTML mixed (1/many success); JS-rendered consistently fail despite correct classification
- **Discovery Validation Weak**: False positives on 'Rates' and T&C pages without actual fee tables; discovery pattern matching fails to validate content presence
- **Institution Type Correlation**: Credit unions prefer PDFs (6/12 success); banks use JS-rendered (1/3 success)
- **Data Quality Issue**: Multiple institutions lack website_url, blocking discovery entirely

### Site-Specific Notes
- **PDF Success**: Centreville Bank, Greenwood FCU, Peoples FCU, Shoreham Bank all extracted successfully
- **JS-Rendered Failures**: Citizens Bank, Washington Trust, Coastal1 FCU, Rhode Island FCU, Blackstone River FCU classify correctly but extract zero fees
- **Partial Successes**: Westerly Community FCU (HTML, 2 fees); Community & Teachers FCU (JS-rendered, 31 fees—exception to pattern)
- **Missing Data**: Pawtucket Municipal EE FCU, Natco EE FCU lack website URLs
- **Secondary Navigation Pattern**: BankNewport requires multi-step navigation (homepage → account type → fees)

### Action Items
- **JS-Rendered Extraction**: Apply secondary HTML parsing or text extraction post-rendering; current pipeline misses JS-rendered fee tables
- **Discovery Validation**: Confirm pages contain actual fee/charge tables before classification success
- **Institution-Specific Tuning**: Investigate Community & Teachers FCU JS-rendered success to refine extraction logic
- **Data Quality**: Populate website_url field for all institutions before discovery
- **Alternative Paths**: Implement multi-path discovery for common patterns (homepage → account pages, /disclosures, /fees, /fee-schedule)
## Run #221 -- Pass 1 (tier1) — 2026-04-07
Discovered: 0 | Extracted: 7 | Failed: 13

### New Patterns
- PDF-based fee schedules show consistent extraction success across credit unions
- JS-rendered pages consistently fail fee extraction despite successful page classification
- Discover failures show improved error specificity in later attempts
- HTML pages rarely contain extractable fees
- Missing website URLs completely block discovery attempts

### Site Notes
- Navigant FCU, Centreville Bank, Greenwood FCU, Peoples FCU, Shoreham Bank all successfully extracted from PDFs (13-63 fees each)
- Citizens Bank, Washington Trust, Coastal1 FCU, RI Federal FCU, Blackstone River FCU, Community & Teachers FCU all classified as js_rendered with extraction failures except Community & Teachers
- BankNewport, Ocean State FCU, Wave FCU, Independence Bank, Cumberland Municipal Employees FCU generated detailed failure reasons (privacy pages, footer-only content, wrong page types)
- Only Westerly Community FCU (html classified) succeeded, extracting just 2 fees
- Community & Teachers FCU uniquely succeeded despite js_rendered classification with 31 extracted fees
- Pawtucket Municipal Employees FCU and Natco Employees FCU marked as discover=failed with 'no website_url' reason

### Promoted to National
- Prioritize PDF classification pathway for credit unions; PDF format appears more standardized for fee disclosure than JS-rendered pages
- JS-rendered pages require enhanced extraction logic or may indicate obfuscated/dynamic fee content; Community & Teachers FCU exception warrants analysis
- Failure messages are becoming more specific; use these patterns to improve pre-discovery filtering
- HTML format appears less reliable than PDF; likely indicates fee information is minimal or not presented in structured format
- JS-rendered pages with successful extraction warrant pattern analysis to improve extraction logic for similar institutions
- Data quality issue: prioritize validating source institution data before pipeline execution

## v3.0 Campaign Summary — 2026-04-07
- Coverage: 61% (11/18 addressable)
- Total institutions: 20 (excluded: 2)
- Institutions with URL but no fees: needs investigation
