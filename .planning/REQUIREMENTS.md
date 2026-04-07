# Requirements: Bank Fee Index v3.0 National Coverage Push

**Defined:** 2026-04-06
**Core Value:** Maximize fee database coverage across all 50 states through systematic wave-based crawl campaigns with iterative deepening

## v3.0 Requirements

### Wave Orchestration

- [ ] **WAVE-01**: User can define a wave of 5-10 states and launch all state agents in batch
- [ ] **WAVE-02**: System auto-prioritizes states by institution count (largest first) and generates recommended wave order
- [ ] **WAVE-03**: Waves trigger via Modal HTTP endpoint or CLI command, respecting existing cron slots
- [ ] **WAVE-04**: If a wave fails midway, user can resume from the last incomplete state without re-running completed ones

### Iterative Deepening

- [ ] **ITER-01**: System runs State Agent 3-5 times per state automatically, injecting prior learnings into each subsequent pass
- [ ] **ITER-02**: Each iteration escalates discovery strategy (pass 1: easy URLs, pass 2: harder discovery/Playwright, pass 3+: PDF search, fee schedule keywords)
- [ ] **ITER-03**: After each pass, system logs fees discovered, coverage delta, and new patterns found

### Knowledge Automation

- [ ] **KNOW-01**: Each iteration auto-logs learnings to state knowledge file and promotes cross-state patterns to national.md
- [ ] **KNOW-02**: Knowledge pruning scales to 50 states without degrading prompt quality

### Coverage Reporting

- [ ] **COV-01**: After each wave completes, system generates wave summary report (states improved, national coverage delta, top discoveries)

## Future Requirements

### Billing (v2.1+)
- **BILL-01**: Stripe subscription integration ($2,500/mo tier)
- **BILL-02**: Per-report pricing for competitive briefs

### Consumer (v2.1+)
- **CONS-01**: Public institution fee lookup
- **CONS-02**: Affiliate link integration

## Out of Scope

| Feature | Reason |
|---------|--------|
| Report engine improvements | v2.0 shipped Hamilton and report pipeline — not this milestone |
| Admin UI changes | Existing dashboards and coverage tracking sufficient |
| New fee categories | Taxonomy is stable at 49 categories |
| Real-time monitoring | Batch/iterative cadence is sufficient |
| Coverage dashboard rebuild | Existing per-state tracking infrastructure works |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WAVE-01 | Phase 19 | Pending |
| WAVE-02 | Phase 19 | Pending |
| WAVE-03 | Phase 19 | Pending |
| WAVE-04 | Phase 19 | Pending |
| ITER-01 | Phase 20 | Pending |
| ITER-02 | Phase 20 | Pending |
| ITER-03 | Phase 20 | Pending |
| KNOW-01 | Phase 21 | Pending |
| KNOW-02 | Phase 21 | Pending |
| COV-01 | Phase 22 | Pending |

**Coverage:**
- v3.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-04-06*
