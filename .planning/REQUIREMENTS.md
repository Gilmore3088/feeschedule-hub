# Requirements: Bank Fee Index

**Defined:** 2026-04-09
**Core Value:** Accurate, complete, timely fee data with rich analysis -- the kind of insight a bank executive would pay a consulting firm $15K to produce, generated on demand from live pipeline data.

## v9.0 Requirements

Requirements for v9.0 Data Foundation & Production Polish. Each maps to roadmap phases.

### Taxonomy & Data Consolidation

- [ ] **TAX-01**: DB schema adds canonical_fee_key and variant_type columns to extracted_fees (expand-and-contract migration)
- [ ] **TAX-02**: Canonical key map authored with ~200 canonical keys and alias lists covering the 15K+ long-tail categories
- [ ] **TAX-03**: Backfill classifies all existing extracted_fees rows with canonical_fee_key and fee_family
- [ ] **TAX-04**: NEVER_MERGE guard tests enforce NSF/OD, domestic/intl wire, ATM/card replacement distinctions
- [ ] **TAX-05**: Roomba data cleanup agent flags/rejects statistical outliers and long-tail noise in extracted fees

### Auto-Classification Pipeline

- [ ] **CLS-01**: classify_fee() runs inline at INSERT time during extraction -- every new crawl auto-maps to canonical taxonomy
- [ ] **CLS-02**: LLM fallback classification via Claude Haiku when fuzzy match score < 80, with classification_cache table to prevent repeat API calls
- [ ] **CLS-03**: Roomba integration wired into post-extraction pipeline to flag/reject outliers automatically

### Admin UX

- [ ] **ADM-01**: SortableTable component wired to all admin pages (currently only on /admin/index)
- [ ] **ADM-02**: Server-side sort via URL params for unbounded tables (review queue, fees catalog) where in-memory sort fails at 15K+ rows
- [ ] **ADM-03**: Districts pages consume Phase 23-24 district queries (Beige Book summaries, economic indicators, CFPB data)
- [ ] **ADM-04**: All admin pages responsive on tablet/mobile breakpoints
- [ ] **ADM-05**: Institution-specific pages display rich FFIEC Call Report financial data (assets, deposits, service charge revenue, ratios)

### Report Quality

- [ ] **RPT-01**: Call Report thousands-scaling bug fixed -- service charge revenue displays real numbers, not $0
- [ ] **RPT-02**: FRED economic data and Beige Book commentary wired into report generation pipeline
- [ ] **RPT-03**: PDF reports upgraded to Salesforce-grade layout: stat callout boxes, numbered chapters, editorial structure, professional typography

### Hamilton Pro Polish

- [ ] **PRO-01**: All hardcoded/sample/demo text stripped from all 5 Pro screens (Home, Analyze, Simulate, Reports, Monitor)
- [ ] **PRO-02**: Stripe ManageBillingButton wired into Pro settings page
- [ ] **PRO-03**: Pro screens responsive via Tailwind v4 container queries

### Pipeline Coverage

- [ ] **COV-01**: PDF direct-link strategy for big bank fee schedules (target direct PDF URLs, higher ROI than stealth browsing)
- [ ] **COV-02**: Playwright stealth upgrade to bypass bot detection on JS-rendered fee schedule pages
- [ ] **COV-03**: FFIEC CDR (banks) and NCUA 5300 (credit unions) quarterly financial data ingestion pipeline

## Future Requirements

### Deferred from v9.0

- **API-01**: Public REST API for institution data and fee index (backlog 999.15)
- **SIG-01**: Signal pipeline automation (currently manual/dev-only seeding)
- **LEFT-01**: Screen-aware left rail with per-screen content slots (backlog 999.8/999.11)
- **SEC-01**: bcrypt migration for legacy password hashes (backlog 999.7)
- **CHART-01**: Charts rendered as PNG inside PDF reports (chart-to-PNG pipeline -- needs design spike)
- **BRAND-01**: Client brand asset upload for white-labeled reports

## Out of Scope

| Feature | Reason |
|---------|--------|
| Admin UI redesign | Existing admin works; polish only, no new screens |
| Mobile native app | Web-first, responsive web covers mobile needs |
| Real-time fee monitoring | Batch/quarterly cadence is sufficient for B2B clients |
| Chart embedding in PDF | react-pdf can't render Recharts; defer to post-v9.0 design spike |
| A/B testing | Premature before paying customer base established |
| Concrete dollar predictions | Risk of inaccuracy; contextual intelligence only |
| Signal pipeline automation | Manual seeding sufficient for now |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAX-01 | Phase 55 | Pending |
| TAX-02 | Phase 55 | Pending |
| TAX-03 | Phase 55 | Pending |
| TAX-04 | Phase 55 | Pending |
| TAX-05 | Phase 55 | Pending |
| CLS-01 | Phase 56 | Pending |
| CLS-02 | Phase 56 | Pending |
| CLS-03 | Phase 56 | Pending |
| ADM-01 | Phase 57 | Pending |
| ADM-02 | Phase 57 | Pending |
| ADM-03 | Phase 57 | Pending |
| ADM-04 | Phase 57 | Pending |
| ADM-05 | Phase 58 | Pending |
| RPT-01 | Phase 60 | Pending |
| RPT-02 | Phase 60 | Pending |
| RPT-03 | Phase 60 | Pending |
| PRO-01 | Phase 61 | Pending |
| PRO-02 | Phase 61 | Pending |
| PRO-03 | Phase 61 | Pending |
| COV-01 | Phase 59 | Pending |
| COV-02 | Phase 59 | Pending |
| COV-03 | Phase 58 | Pending |

**Coverage:**
- v9.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after roadmap creation (phases 55-61 assigned)*
