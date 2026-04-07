# Requirements: Bank Fee Index v5.0 National Data Layer

**Defined:** 2026-04-07
**Core Value:** Build the data foundation for credible national analysis — fix queries, create summaries, build admin views for all national data sources

## v5.0 Requirements

### Call Report Revenue (CALL)
- [ ] **CALL-01**: Revenue queries return correct dollar amounts (fix thousands scaling)
- [ ] **CALL-02**: YoY revenue trend available for last 8 quarters with growth rate
- [ ] **CALL-03**: Bank vs credit union revenue split queryable
- [ ] **CALL-04**: Top institutions by service charge income queryable with name, assets, charter
- [ ] **CALL-05**: Fee income ratio (service charges / total revenue) computed per institution
- [ ] **CALL-06**: Revenue segmented by asset tier (community, mid-size, regional, large, mega)

### FRED Economic Data (FRED)
- [ ] **FRED-01**: CPI year-over-year change computed correctly (not raw index)
- [ ] **FRED-02**: Consumer sentiment (UMCSENT) available — ingest if missing
- [ ] **FRED-03**: National economic summary available (fed funds rate, unemployment, CPI YoY, sentiment)
- [ ] **FRED-04**: District-level economic indicators queryable (per-district unemployment, etc.)

### Beige Book (BEIGE)
- [ ] **BEIGE-01**: District economic narratives condensed into 2-3 sentence summaries
- [ ] **BEIGE-02**: National economic summary derived from all 12 district reports
- [ ] **BEIGE-03**: Key themes extracted (growth, employment, prices, lending conditions)

### Industry Health (HEALTH)
- [ ] **HEALTH-01**: Industry-wide ROA, ROE, efficiency ratio averages computed
- [ ] **HEALTH-02**: Deposit and loan growth trends (YoY) from institution_financials
- [ ] **HEALTH-03**: Institution count trends (new charters, closures if detectable)
- [ ] **HEALTH-04**: Health metrics segmented by charter type (bank vs CU)

### Derived Analytics (DERIVE)
- [ ] **DERIVE-01**: Revenue concentration analysis (% of total SC income from top N categories)
- [ ] **DERIVE-02**: Fee dependency ratio (SC income / total revenue) by charter, tier
- [ ] **DERIVE-03**: Revenue per institution averages by asset tier and charter

### Admin Portal (ADMIN)
- [ ] **ADMIN-01**: National data summary page at `/admin/national` showing all data sources
- [ ] **ADMIN-02**: Call Report revenue dashboard (trends, top institutions, charter split)
- [ ] **ADMIN-03**: Economic conditions panel (FRED + Beige Book summaries)
- [ ] **ADMIN-04**: Industry health panel (ROA, efficiency, deposits, loans)
- [ ] **ADMIN-05**: Hamilton can access all summary data via existing tool/query layer

### External Intelligence (INTEL)
- [ ] **INTEL-01**: Admin can upload/paste external reports, surveys, or research with source attribution
- [ ] **INTEL-02**: Hamilton can cite external sources in analysis
- [ ] **INTEL-03**: External intelligence stored with metadata (source, date, category, relevance tags)
- [ ] **INTEL-04**: Hamilton's tools can search/query external intelligence alongside internal data

## Traceability

| Requirement | Phase | Status |
|------------|-------|--------|
| (populated by roadmap) | | |

## Future (v6.0)

- State/regional report data layer (state-specific Call Reports, FRED by district, Beige Book per district)
- MSA-level drill-down queries
- Consumer insights and guides layer (plain language summaries, how-tos)
- State summary pages at `/admin/national/state/[code]`

## Out of Scope

- Report template redesign (v4.2 is locked)
- Interactive web dashboards (PDF reports only for now)
- Real-time data feeds (batch/quarterly cadence)
