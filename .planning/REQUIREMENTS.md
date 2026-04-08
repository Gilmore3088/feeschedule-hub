# Requirements: Bank Fee Index

**Defined:** 2026-04-07
**Core Value:** Accurate, complete, timely fee data with rich analysis -- the kind of insight a bank executive would pay a consulting firm $15K to produce, generated on demand from live pipeline data.

## v6.0 Requirements

Requirements for Two-Sided Experience milestone. Each maps to roadmap phases.

### Audience Shell

- [ ] **SHELL-01**: Consumer and pro audiences have distinct navigation components with separate visual identities
- [ ] **SHELL-02**: Pro route auth guard is centralized in pro/layout.tsx (not scattered per-page)
- [ ] **SHELL-03**: Personalization service derives user context (institution, district, tier, peer group) from account profile for dashboard use

### Consumer Landing

- [ ] **CLND-01**: Landing page replaces split-panel gateway as the universal entry point for all visitors (consumer and B2B alike)
- [ ] **CLND-02**: Landing page hero immediately communicates the value proposition with quantified impact ("see what your bank charges vs. the national median")
- [ ] **CLND-03**: Fee Scout search is embedded in the hero -- visitor can look up any institution without authentication
- [ ] **CLND-04**: Landing page displays trust signals that establish authority (institution count, data freshness, data source provenance)
- [ ] **CLND-05**: Landing page includes a clear "how it works" section (Search, Compare, Save / Act)
- [ ] **CLND-06**: Landing page surfaces 2-3 consumer guide teasers for education and SEO
- [ ] **CLND-07**: Landing page includes a clear B2B value section ("For Financial Institutions") with professional upgrade path -- not a gate, a door
- [ ] **CLND-08**: Landing page design meets Salesforce Connected FINS / McKinsey quality bar (editorial typography, generous whitespace, consulting-grade presentation)

### Institution Pages

- [ ] **INST-01**: Institution page displays "why does this matter?" contextual callouts per fee category
- [ ] **INST-02**: Institution page shows peer percentile indicator per fee ("higher than 72% of similar banks")
- [ ] **INST-03**: Institution page includes fee distribution chart showing where the institution sits nationally
- [ ] **INST-04**: Institution page surfaces relevant B2B reports and links for professional users

### B2B Launchpad

- [ ] **B2B-01**: Pro dashboard displays four primary action doors (Hamilton, Peer Builder, Reports, Federal Data)
- [ ] **B2B-02**: Pro dashboard shows peer snapshot panel with subscriber's peer group vs national median
- [ ] **B2B-03**: Pro dashboard surfaces recent activity (last Hamilton conversations, recent reports)
- [ ] **B2B-04**: Pro dashboard displays personalized Beige Book digest based on subscriber's district
- [ ] **B2B-05**: Pro experience is positioned as one-stop shop for premium consulting (replacing $15K engagements)

### Scoped Reports

- [ ] **RPT-01**: Pro user can select from structured report types (peer brief, competitive snapshot, district outlook, monthly pulse)
- [ ] **RPT-02**: Pro user can download generated reports as PDF
- [ ] **RPT-03**: Generated reports are persisted and retrievable from report history
- [ ] **RPT-04**: Report templates are scoped and small (3-5 pages, not flagship national reports)

## v5.0 Requirements (Previous Milestone)

### Call Report Revenue (CALL)
- [ ] **CALL-01**: Revenue queries return correct dollar amounts (fix thousands scaling)
- [ ] **CALL-02**: YoY revenue trend available for last 8 quarters with growth rate
- [ ] **CALL-03**: Bank vs credit union revenue split queryable
- [ ] **CALL-04**: Top institutions by service charge income queryable with name, assets, charter
- [ ] **CALL-05**: Fee income ratio (service charges / total revenue) computed per institution
- [ ] **CALL-06**: Revenue segmented by asset tier (community, mid-size, regional, large, mega)

### FRED Economic Data (FRED)
- [ ] **FRED-01**: CPI year-over-year change computed correctly (not raw index)
- [ ] **FRED-02**: Consumer sentiment (UMCSENT) available -- ingest if missing
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

## Future Requirements

### v6.1

- **CFPB-01**: Institution pages display CFPB complaint count benchmarked against district and national averages
- **HIST-01**: Institution pages show fee history timeline when re-crawl data exists
- **PERS-01**: Competitive landscape snapshot on B2B launchpad ("3 institutions in your peer group changed fees")
- **BRFG-01**: Hamilton generates weekly "morning briefing" narrative for subscribers
- **RVER-01**: Report versioning -- re-run same scope with fresh data and show what changed

### v7+

- **GEO-01**: "Banks near you charging less" contextual consumer suggestion with geo-aware peer query
- **ANNO-01**: Hamilton annotation layer -- pro users can edit/annotate reports before PDF export
- **BRAND-01**: Branded PDF export with subscriber institution name on cover page

## Out of Scope

| Feature | Reason |
|---------|--------|
| Star ratings / letter grades for institutions | Legally ambiguous, editorially unstable; use objective language ("above median", "top quartile") |
| Consumer dark mode toggle | Dark mode CSS only exists for admin; consumer pages use hardcoded warm palette tokens |
| URL restructuring / new prefixes | SEO regression risk; all consumer redesign happens in-place inside existing (public) route group |
| Free-form-only report prompts | Structured scope forms produce more consistent output; free-form is secondary |
| Unlimited report generation without controls | Per-user daily limits required before pro access to prevent cost runaway |
| Real-time crawl activity feed for pro users | Admin-level noise; subscribers get peer-relevant freshness indicators only |
| Report template redesign | v4.2 template is locked |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | Pending | Pending |
| SHELL-02 | Pending | Pending |
| SHELL-03 | Pending | Pending |
| CLND-01 | Pending | Pending |
| CLND-02 | Pending | Pending |
| CLND-03 | Pending | Pending |
| CLND-04 | Pending | Pending |
| CLND-05 | Pending | Pending |
| CLND-06 | Pending | Pending |
| CLND-07 | Pending | Pending |
| CLND-08 | Pending | Pending |
| INST-01 | Pending | Pending |
| INST-02 | Pending | Pending |
| INST-03 | Pending | Pending |
| INST-04 | Pending | Pending |
| B2B-01 | Pending | Pending |
| B2B-02 | Pending | Pending |
| B2B-03 | Pending | Pending |
| B2B-04 | Pending | Pending |
| B2B-05 | Pending | Pending |
| RPT-01 | Pending | Pending |
| RPT-02 | Pending | Pending |
| RPT-03 | Pending | Pending |
| RPT-04 | Pending | Pending |

**Coverage:**
- v6.0 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after initial definition*
