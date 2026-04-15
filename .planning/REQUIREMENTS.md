# Requirements: Bank Fee Index v7.0 Hamilton Reasoning Engine

**Defined:** 2026-04-08
**Core Value:** Upgrade Hamilton from section-based report writer to unified intelligence engine — the gateway that turns national noise into actionable, accessible intelligence across compliance, regulation, industry trends, performance, and fee strategy.

## v7.0 Requirements

### Global Thesis (THESIS)
- [ ] **THESIS-01**: Hamilton generates a global thesis per quarter from full data payload (core thesis, key tensions, revenue model, competitive dynamics)
- [ ] **THESIS-02**: Each report section receives and references the global thesis — output reads as a single argument, not isolated observations
- [ ] **THESIS-03**: Hamilton uses think-then-compress reasoning — reasons in 5-8 sentences internally, outputs 2-3 most important (150-200 word budget per section)
- [ ] **THESIS-04**: Insights are framed as tensions between competing forces ("pricing converges while revenue diverges") not observations ("fees are clustered")
- [ ] **THESIS-05**: Revenue implications are prioritized over pricing observations in every output — if revenue data exists, it leads

### Unified Hamilton (UNIFY)
- [ ] **UNIFY-01**: Four chat agents (Ask/Analyst/ContentWriter/CustomQuery) consolidated into one Hamilton that adjusts depth and language based on user role (consumer/pro/admin)
- [ ] **UNIFY-02**: Unified Hamilton shares one reasoning layer (voice rules, insight hierarchy, tension model, revenue prioritization) across chat and report modes
- [ ] **UNIFY-03**: Consumer mode produces plain-language explanations of institutional position, fee structure, and financial health
- [ ] **UNIFY-04**: Pro mode produces peer-focused competitive analysis with revenue context
- [ ] **UNIFY-05**: Admin mode produces full-depth analysis with operational flags and data quality signals

### Section Generator (SECTION)
- [ ] **SECTION-01**: Each report section receives global thesis + section data + macro context + revenue context + peer context (not just section-specific data)
- [ ] **SECTION-02**: Sections reference FRED economic indicators, Beige Book themes, and CFPB complaint data when relevant to the analysis
- [ ] **SECTION-03**: Section word budget is 150-200 words (up from 75) matching Salesforce Connected FINS depth

### Voice & Editor (VOICE)
- [ ] **VOICE-01**: Hamilton voice v3 system prompt encodes revenue prioritization, tension model, and think-then-compress instruction
- [ ] **VOICE-02**: Editor v2 validates global thesis alignment across all sections — no section contradicts the core thesis
- [ ] **VOICE-03**: Editor v2 checks that revenue implications appear before pricing observations in every section where revenue data exists
- [ ] **VOICE-04**: Editor v2 flags sections that describe data without stating implications ("so what?" check)

### Tool & Data Access (TOOLS)
- [ ] **TOOLS-01**: All 16 tool descriptions upgraded with strategic guidance — when to pull what data for what type of question
- [ ] **TOOLS-02**: Hamilton has access to all 13 ingestion sources through queryNationalData (verify BLS, Census, NY Fed, OFR, SOD are wired)
- [ ] **TOOLS-03**: Tool descriptions guide Hamilton to cross-reference data sources (e.g., "when analyzing a district, always pull Beige Book themes + FRED indicators + CFPB complaints")

### Regulation & Compliance Intelligence (REG)
- [ ] **REG-01**: Hamilton connects regulatory signals (CFPB enforcement, OCC guidance, Fed policy) to internal fee data — "this enforcement action affects N institutions in our database with similar fee structures"
- [ ] **REG-02**: Hamilton identifies compliance risk patterns from fee data + complaint data (institutions with above-median fees AND above-average complaint rates)
- [ ] **REG-03**: Hamilton references industry performance metrics (ROA, efficiency, deposit growth) alongside fee analysis to provide full financial context

## Future Requirements (v8.0+)

### Signal Detection (v8.0)
- **SIGNAL-01**: Automated change detection on ingested data — what's newsworthy
- **SIGNAL-02**: Morning brief generator — 3-5 actionable bullets daily
- **SIGNAL-03**: Intelligence feed — continuous, admin-first
- **SIGNAL-04**: Monthly pulse v2 with global thesis + signals

### Consumer Delivery (v9.0)
- **CONSUMER-01**: Per-institution consumer briefings in plain language
- **CONSUMER-02**: Consumer-facing Hamilton chat
- **CONSUMER-03**: Scheduled email delivery
- **CONSUMER-04**: Event-triggered content (CFPB action → instant brief)

### Operational Reliability (OPS) — Phase 60.1
- [ ] **OPS-01**: Modal scheduled jobs fail loudly on subprocess errors via shared helper that raises on non-zero exit with stdout/stderr tails
- [ ] **OPS-02**: One authoritative schema source for crawler pipeline tables — SQLite matches Postgres or SQLite execution is formally retired
- [ ] **OPS-03**: Report jobs transition to `failed` when Modal trigger fails — no stuck `pending` jobs
- [ ] **OPS-04**: CI and Modal install the same Python dependency set — unified requirements manifest
- [ ] **OPS-05**: FFIEC scaling contract consistent across ingest, tests, and migrations — shared helper restored
- [ ] **OPS-06**: Phase 59 test regressions resolved — `test_stealth_fetcher.py` and `test_call_report_scaling.py` pass
- [ ] **OPS-07**: `run_monthly_pulse` explicitly manual-only or scheduled, using `BFI_APP_URL` consistent with report stack

## Out of Scope

| Feature | Reason |
|---------|--------|
| Signal detection / automated monitoring | v8.0 — needs ingestion layer changes |
| Scheduled report generation (cron) | v8.0 — needs signal layer first |
| Consumer email delivery | v9.0 — needs consumer translator + delivery infra |
| New data source ingestion | 13 sources already exist — this milestone uses them, doesn't add more |
| Report template visual redesign | Existing template works — this milestone upgrades content quality, not layout |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| THESIS-01 | Phase 33 | Pending |
| THESIS-02 | Phase 33 | Pending |
| THESIS-03 | Phase 33 | Pending |
| THESIS-04 | Phase 33 | Pending |
| THESIS-05 | Phase 33 | Pending |
| VOICE-01 | Phase 34 | Pending |
| SECTION-01 | Phase 34 | Pending |
| SECTION-02 | Phase 34 | Pending |
| SECTION-03 | Phase 34 | Pending |
| UNIFY-01 | Phase 35 | Pending |
| UNIFY-02 | Phase 35 | Pending |
| UNIFY-03 | Phase 35 | Pending |
| UNIFY-04 | Phase 35 | Pending |
| UNIFY-05 | Phase 35 | Pending |
| TOOLS-01 | Phase 36 | Pending |
| TOOLS-02 | Phase 36 | Pending |
| TOOLS-03 | Phase 36 | Pending |
| REG-01 | Phase 36 | Pending |
| REG-02 | Phase 36 | Pending |
| REG-03 | Phase 36 | Pending |
| VOICE-02 | Phase 37 | Pending |
| VOICE-03 | Phase 37 | Pending |
| VOICE-04 | Phase 37 | Pending |

**Coverage:**
- v7.0 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0

---
*Requirements defined: 2026-04-08*
*Last updated: 2026-04-08 after milestone v7.0 roadmap creation*
