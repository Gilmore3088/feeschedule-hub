# DE Fee Schedule Knowledge


## Run #17 — 2026-04-06
Discovered: 9 | Extracted: 15 | Failed: 17

### New Patterns
- Discovery success rate higher when explicit 'Rates & Fees' or 'Fee Schedule' navigation links present vs. relying on homepage content analysis
- PDF fee documents discovered but extraction fails - likely due to unstructured layouts or image-based PDFs
- Skipped discovery (no action taken) followed by successful extraction indicates classifier/extractor can work without discovery phase
- HTTP/2 protocol errors on specific institutional websites - potential systematic blocking or infrastructure issues
- Trust companies and investment-focused institutions redirect to corporate/investment banking fee pages rather than consumer account fees

### Site Notes
- Dexsta Federal Credit Union succeeded with direct fee schedule link; Louviers Federal Credit Union found 'Rates & Fees' link but extraction failed on js_rendered content
- Santander Bank, BNY Mellon Trust of Delaware, and Louviers all had discoverable fee documents but zero fee extraction
- Del-One FCU, Dover FCU, Tidemark FCU, Community Powered FCU, Delaware State Police FCU all skipped discovery but extracted successfully - suggests pre-indexed or cached URLs
- PNC Bank failed with net::ERR_HTTP2_PROTOCOL_ERROR suggesting server misconfiguration or bot detection
- Deutsche Bank Trust Company Delaware and Stifel Trust Company (no website) appear to publish corporate rather than consumer fee schedules
- Barclays Bank Delaware: explicit 'Truth-in-Savings Disclosure and Fees' section discovered in HTML but extraction failed - indicates page structure mismatch with extraction templates

### Promoted to National
- None
