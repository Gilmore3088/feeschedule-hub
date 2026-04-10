# Phase 36: Tool & Regulation Intelligence - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade all tool descriptions with full cross-reference guidance, wire all 13 data sources into Hamilton's queryNationalData tool, add a dedicated queryRegulatoryRisk tool, and add regulation-awareness instruction to Hamilton's system prompt. Resolves the STATE.md blocker about verifying all sources are wired.

</domain>

<decisions>
## Implementation Decisions

### Missing data sources
- **D-01:** Wire ALL 7 remaining sources into queryNationalData: Fed Content (speeches/papers), BLS (labor), Census ACS (demographics), Census Tracts, NY Fed, OFR, SOD.
- **D-02:** Add new source categories to queryNationalData: `fed_content`, `labor`, `demographics`, `research` (for NY Fed + OFR combined), `deposits` (for SOD). Total sources: 6 existing + 5 new = 11 categories.
- **D-03:** Each new source category needs a corresponding TypeScript query function in crawler-db/ if one doesn't exist yet. Check what query functions exist for BLS, Census, NY Fed, OFR, SOD before creating new ones.

### Tool description strategy
- **D-04:** Full cross-reference rules in every tool description. Each description includes:
  - What the tool returns
  - When to use it (question types)
  - What to combine it with (cross-reference partners)
  - Example: "For district analysis, combine with queryNationalData(economic) + queryNationalData(complaints) + queryNationalData(fed_content)"
- **D-05:** Upgrade all 12 existing internal tool descriptions + 4 public tool descriptions + the queryNationalData tool description itself (17 total).

### Regulatory connection
- **D-06:** Add regulation-awareness instruction to Hamilton's system prompt (voice.ts or agents.ts role prefix): "When analyzing fees that are subject to regulatory scrutiny (overdraft, NSF, junk fees), always check CFPB complaint data and Fed Content for enforcement signals. Flag institutions with above-median fees AND above-average complaint rates as potential compliance risks."
- **D-07:** Create new `queryRegulatoryRisk` tool that cross-references:
  - CFPB complaints (volume, categories, trends)
  - Fee outliers (institutions above P75 in scrutinized categories)
  - Fed Content (recent speeches/papers mentioning fee-related topics)
  - Returns: risk score, affected institutions count, regulatory signals
- **D-08:** The regulatory risk tool is used when someone asks specifically about compliance, enforcement risk, or regulatory exposure. Hamilton's prompt instruction makes it aware; the tool makes it actionable.

### Claude's Discretion
- Which existing TypeScript query functions cover BLS/Census/NYFed/OFR/SOD (audit needed)
- Exact cross-reference language per tool description
- Risk scoring methodology for queryRegulatoryRisk
- Whether queryRegulatoryRisk belongs in tools-internal.ts or a separate regulatory.ts module

</decisions>

<canonical_refs>
## Canonical References

### Tool definitions (being upgraded)
- `src/lib/research/tools-internal.ts` — 12 internal tools + queryNationalData
- `src/lib/research/tools.ts` — 4 public tools

### Data sources (check for existing query functions)
- `fee_crawler/commands/ingest_bls.py` — BLS ingestion (check if TS query layer exists)
- `fee_crawler/commands/ingest_census_acs.py` — Census demographics
- `fee_crawler/commands/ingest_census_tracts.py` — Census tracts
- `fee_crawler/commands/ingest_fed_content.py` — Fed speeches + Fed in Print
- `fee_crawler/commands/ingest_nyfed.py` — NY Fed data
- `fee_crawler/commands/ingest_ofr.py` — Office of Financial Research
- `fee_crawler/commands/ingest_sod.py` — Summary of Deposits

### Existing crawler-db query modules
- `src/lib/crawler-db/fed.ts` — getDistrictContent(), getRecentSpeeches() (Fed Content queries exist!)
- `src/lib/crawler-db/financial.ts` — economic indicators
- `src/lib/crawler-db/complaints.ts` — CFPB queries

### Voice (for regulation instruction)
- `src/lib/hamilton/voice.ts` — v3.1.0 system prompt
- `src/lib/research/agents.ts` — getHamilton() role prefixes

</canonical_refs>

<code_context>
## Existing Code Insights

### Already wired (6 sources)
- call_reports, economic (FRED), health, complaints (CFPB), fee_index, derived

### Partially wired (have TS query functions but not in queryNationalData)
- Fed Content: `getDistrictContent()`, `getRecentSpeeches()` in fed.ts — just need routing
- BLS/Census/NYFed/OFR/SOD: need to check if TS query functions exist

### Integration point
- queryNationalData tool in tools-internal.ts — add new case statements for each source
- New queryRegulatoryRisk tool — add to internalTools object

</code_context>

<deferred>
## Deferred Ideas

- Automated regulatory signal monitoring (RSS scraping for CFPB/OCC press releases) — v8.0 signal layer
- Regulatory risk dashboard in admin portal — future phase
- Compliance alert emails to subscribers — v9.0 delivery

</deferred>

---

*Phase: 36-tool-regulation-intelligence*
*Context gathered: 2026-04-08*
