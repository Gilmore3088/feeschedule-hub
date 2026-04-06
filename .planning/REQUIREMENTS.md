# Requirements: Bank Fee Index v2.0 Hamilton

**Defined:** 2026-04-06
**Core Value:** Accurate, complete, timely fee intelligence wrapped in McKinsey-grade reports that establish Bank Fee Index as the national authority

## v2.0 Requirements

### Hamilton Foundation

- [ ] **HAM-01**: Hamilton persona module with locked voice file, system prompt, and 5-7 concrete stylistic rules versioned in src/lib/hamilton/
- [ ] **HAM-02**: Hamilton generateSection() API that accepts typed data JSON and returns narrative — never invents statistics
- [ ] **HAM-03**: Post-generation numeric validator that cross-checks all numbers in Hamilton output against source data before publication

### Template System

- [ ] **TMPL-01**: Shared report base layout with cover page, section headers, data tables, chart containers, footnotes
- [ ] **TMPL-02**: Per-report-type template composition — each template is a pure function (data, narratives) => HTML
- [ ] **TMPL-03**: Report design system produces McKinsey-grade visual output (not dashboards, not data dumps)

### Report Engine

- [ ] **ENG-01**: Modal render worker — Playwright HTML-to-PDF generation on existing Modal image
- [ ] **ENG-03**: R2 artifact storage with presigned download URLs (never store public URLs)
- [ ] **ENG-04**: Supabase report_jobs table (pending → assembling → rendering → complete | failed) with data manifest for audit trail
- [ ] **ENG-05**: Next.js API routes — trigger report generation, poll status, download via presigned URL
- [ ] **ENG-06**: Data freshness gate — refuse to publish if median crawl age exceeds threshold (120 days national, 90 days state)

### National Quarterly Report

- [ ] **NQR-01**: National Fee Index quarterly report covering all 49 fee categories with medians, P25/P75, and institution counts
- [ ] **NQR-02**: Hamilton narrative per section — situation, complication, key finding, recommendation
- [ ] **NQR-03**: Sliceable by charter type (FDIC vs NCUA) and asset tier within the national report
- [ ] **NQR-04**: Fed district and Beige Book economic context woven into Hamilton's analysis

### State Fee Index Reports

- [ ] **SFI-01**: Per-state fee index report using State Agent coverage data
- [ ] **SFI-02**: State reports include Fed district economic indicators and Beige Book context
- [ ] **SFI-03**: Comparison to national medians (delta analysis — above/below national per category)

### Monthly Pulse

- [ ] **PULSE-01**: Automated monthly report — what moved, notable movers, trend lines
- [ ] **PULSE-02**: Template-driven with minimal Hamilton narrative (1-2 paragraphs)
- [ ] **PULSE-03**: Cron-triggered generation and publication

### Competitive Briefs

- [ ] **BRIEF-01**: Hamilton-heavy on-demand competitive brief — institution vs peers by asset tier, charter, geography
- [ ] **BRIEF-02**: Peer group confirmation UI before generation (subscriber selects/confirms peer definition)
- [ ] **BRIEF-03**: 3-6 Hamilton section calls per brief with full narrative analysis
- [ ] **BRIEF-04**: Fee change event analysis — "who moved first" tracking where data exists

### Methodology

- [ ] **METH-01**: Methodology paper explaining how the index works — data sources, crawl process, categorization, confidence scoring
- [ ] **METH-02**: Published at public URL before sales outreach begins

### Pro Portal

- [ ] **PRO-01**: Authenticated report library — browse, filter, download past reports
- [ ] **PRO-02**: On-demand competitive brief generation trigger with polling UI
- [ ] **PRO-03**: Report access gated by subscription tier via Supabase RLS

### Public Catalog

- [ ] **PUB-01**: Public report catalog with ISR-cached landing pages
- [ ] **PUB-02**: Executive summary + 2 charts visible publicly; full PDF behind CTA/signup
- [ ] **PUB-03**: OG metadata and SEO optimization for report landing pages

## Future Requirements

### Billing (v2.1)
- **BILL-01**: Stripe subscription integration ($2,500/mo tier)
- **BILL-02**: Per-report pricing for competitive briefs
- **BILL-03**: Stripe Customer Portal for self-service management

### Consumer (v2.1+)
- **CONS-01**: Public institution fee lookup
- **CONS-02**: Affiliate link integration
- **CONS-03**: Ad revenue placement

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pipeline/agent infrastructure | Owner building in parallel — no overlap |
| Self-serve dashboard portal | UX/onboarding investment premature; reports first |
| API access for data subscribers | Premature before report product proven |
| Real-time fee monitoring | Crawl cadence can't support; batch is sufficient |
| Mobile app | Web-first |
| Stripe billing | Deferred to v2.1 — need reports to exist before billing |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HAM-01 | Phase 1 | Pending |
| HAM-02 | Phase 1 | Pending |
| HAM-03 | Phase 1 | Pending |
| TMPL-01 | Phase 1 | Pending |
| TMPL-02 | Phase 1 | Pending |
| TMPL-03 | Phase 1 | Pending |
| ENG-01 | Phase 2 | Pending |
| ENG-03 | Phase 2 | Pending |
| ENG-04 | Phase 2 | Pending |
| ENG-05 | Phase 2 | Pending |
| ENG-06 | Phase 2 | Pending |
| NQR-01 | Phase 3 | Pending |
| NQR-02 | Phase 3 | Pending |
| NQR-03 | Phase 3 | Pending |
| NQR-04 | Phase 3 | Pending |
| SFI-01 | Phase 3 | Pending |
| SFI-02 | Phase 3 | Pending |
| SFI-03 | Phase 3 | Pending |
| PULSE-01 | Phase 3 | Pending |
| PULSE-02 | Phase 3 | Pending |
| PULSE-03 | Phase 3 | Pending |
| BRIEF-01 | Phase 4 | Pending |
| BRIEF-02 | Phase 4 | Pending |
| BRIEF-03 | Phase 4 | Pending |
| BRIEF-04 | Phase 4 | Pending |
| METH-01 | Phase 1 | Pending |
| METH-02 | Phase 5 | Pending |
| PRO-01 | Phase 4 | Pending |
| PRO-02 | Phase 4 | Pending |
| PRO-03 | Phase 4 | Pending |
| PUB-01 | Phase 5 | Pending |
| PUB-02 | Phase 5 | Pending |
| PUB-03 | Phase 5 | Pending |

**Coverage:**
- v2.0 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after v2.0 milestone start*
