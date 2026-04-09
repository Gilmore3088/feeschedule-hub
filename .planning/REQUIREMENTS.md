# Requirements: Bank Fee Index

**Defined:** 2026-04-09
**Core Value:** Accurate, complete, timely fee data with rich analysis — the kind of insight a bank executive would pay a consulting firm $15K to produce, generated on demand from live pipeline data.

## v8.1 Requirements

Requirements for Hamilton Pro Live Data Wiring. Each maps to roadmap phases.

### Settings

- [ ] **SET-01**: User's fed_district column exists in production DB (migration 041 runs)

### Monitor

- [ ] **MON-01**: Signal feed queries real hamilton_signals table with empty state when no data
- [ ] **MON-02**: User can add/remove watchlist items (institutions, Fed agencies) against real hamilton_watchlists table
- [ ] **MON-03**: FloatingChatOverlay streams real Hamilton responses
- [ ] **MON-04**: Monitor uses full canvas width (no wasted left/right margins)

### Home / Briefing

- [ ] **HOME-01**: HamiltonViewCard calls real generateGlobalThesis() with user's peer context
- [ ] **HOME-02**: PositioningEvidence queries real getNationalIndex() for user's institution fee categories
- [ ] **HOME-03**: WhatChangedCard + PriorityAlertsCard query real signal/alert tables
- [ ] **HOME-04**: RecommendedActionCard derives from thesis, links to Simulate with suggested category
- [ ] **HOME-05**: All data shown traces to pipeline-verified sources — no hallucinated data or fabricated recommendations

### Analyze

- [ ] **ANL-01**: AnalyzeWorkspace streaming works with real Hamilton API (mode: analyze)
- [ ] **ANL-02**: Focus tabs (Pricing/Risk/Peer/Trend) inject correct context into system prompt
- [ ] **ANL-03**: User can save/load analyses via hamilton_saved_analyses table
- [ ] **ANL-04**: All hardcoded/demo analysis content stripped
- [ ] **ANL-05**: User can export any analysis as a branded PDF report (client brand if uploaded, BFI brand default)

### Simulate

- [ ] **SIM-01**: Category selector works for all 49 fee categories (not just overdraft)
- [ ] **SIM-02**: Fee distribution data fetched from real getNationalIndex() for selected category
- [ ] **SIM-03**: canSimulate() blocks categories with insufficient data (confidence gating)
- [ ] **SIM-04**: Hamilton interpretation streams real API with scenario context — surfaces complaints, peer behavior, revenue subcategories (no concrete dollar predictions)

### Reports

- [ ] **RPT-01**: Report library displays curated Hamilton publications (annual, quarterly, Fed, monthly pulse)
- [ ] **RPT-02**: User can browse, read, and download published reports
- [ ] **RPT-03**: Report generation uses real generateSection() with client-specific data context
- [ ] **RPT-04**: PDF export via @react-pdf/renderer works end-to-end
- [ ] **RPT-05**: Scenario-linked reports pull from hamilton_scenarios when user comes from Simulate

### Pro Navigation

- [ ] **NAV-01**: Existing Pro nav tabs (Pricing, Peer, etc.) wired to real fee data
- [ ] **NAV-02**: All Pro screens use full canvas width — no wasted margins

### Integration

- [ ] **INT-01**: Home CTA links navigate correctly to target screens (Simulate, Analyze)
- [ ] **INT-02**: Simulate -> Report flow passes scenario context
- [ ] **INT-03**: Analyze -> branded PDF export flow works end-to-end
- [ ] **INT-04**: Cross-screen data consistency (same institution/peer context everywhere)

## Future Requirements

Deferred beyond v8.1. Tracked but not in current roadmap.

### Automation

- **AUTO-01**: Signal pipeline automation (auto-generate signals from fee change events)
- **AUTO-02**: Scheduled report generation (auto-publish quarterly/annual on cadence)

### Branding

- **BRAND-01**: Client brand asset upload (logo, colors) for white-labeled reports
- **BRAND-02**: Brand preview before PDF export

### Billing

- **BILL-01**: Stripe billing portal wiring (manage subscription button)
- **BILL-02**: Usage-based billing for Hamilton API calls

### Advanced Export

- **EXP-01**: Charts rendered as PNG inside PDF reports (chart-to-PNG pipeline)
- **EXP-02**: Word/PPTX export formats

## Out of Scope

| Feature | Reason |
|---------|--------|
| New UI components or screen redesigns | v8.0 built all shells; v8.1 is data wiring only |
| Signal pipeline automation | Manual/dev-only seeding for now; automation deferred post-v8.1 |
| Concrete dollar predictions in Simulate | Risk of inaccuracy; use contextual intelligence (complaints, peer behavior, revenue subcategories) instead |
| Admin Hamilton changes | Admin content engine is separate; v8.1 is Client Hamilton only |
| A/B testing settings variants | Deferred to post-launch polish |
| Real-time WebSocket signals | Batch/poll cadence sufficient |
| Charts in PDF | Recharts cannot render in react-pdf; stat callout boxes instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SET-01 | Phase 47 | Pending |
| NAV-01 | Phase 48 | Pending |
| NAV-02 | Phase 48 | Pending |
| MON-04 | Phase 48 | Pending |
| MON-01 | Phase 49 | Pending |
| MON-02 | Phase 49 | Pending |
| MON-03 | Phase 49 | Pending |
| HOME-01 | Phase 50 | Pending |
| HOME-02 | Phase 50 | Pending |
| HOME-03 | Phase 50 | Pending |
| HOME-04 | Phase 50 | Pending |
| HOME-05 | Phase 50 | Pending |
| ANL-01 | Phase 51 | Pending |
| ANL-02 | Phase 51 | Pending |
| ANL-03 | Phase 51 | Pending |
| ANL-04 | Phase 51 | Pending |
| ANL-05 | Phase 51 | Pending |
| SIM-01 | Phase 52 | Pending |
| SIM-02 | Phase 52 | Pending |
| SIM-03 | Phase 52 | Pending |
| SIM-04 | Phase 52 | Pending |
| RPT-01 | Phase 53 | Pending |
| RPT-02 | Phase 53 | Pending |
| RPT-03 | Phase 53 | Pending |
| RPT-04 | Phase 53 | Pending |
| RPT-05 | Phase 53 | Pending |
| INT-01 | Phase 54 | Pending |
| INT-02 | Phase 54 | Pending |
| INT-03 | Phase 54 | Pending |
| INT-04 | Phase 54 | Pending |

**Coverage:**
- v8.1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after roadmap creation (v8.1 Phases 47-54)*
