# CRUD Completeness Audit

**Audit Date:** 2026-04-16  
**Principle:** Every user-manipulable entity must have full Create/Read/Update/Delete operations accessible via agent tools.

## Entity CRUD Matrix

| Entity | Create | Read | Update | Delete | Score |
|---|:-:|:-:|:-:|:-:|---|
| crawl_targets | ✗ | ✓ | ✗ | ✗ | 1/4 |
| crawl_runs | ✗ | ✓ | ✗ | ✗ | 1/4 |
| crawl_results | ✗ | ✓ | ✗ | ✗ | 1/4 |
| extracted_fees | ✗ | ✓ | ✗ | ✗ | 1/4 |
| users | ✗ | ✓ | ✗ | ✗ | 1/4 |
| fee_reviews | ✗ | ✓ | ✗ | ✗ | 1/4 |
| institution_financials | ✗ | ✓ | ✗ | ✗ | 1/4 |
| institution_complaints | ✗ | ✓ | ✗ | ✗ | 1/4 |
| fed_beige_book | ✗ | ✓ | ✗ | ✗ | 1/4 |
| fed_content | ✗ | ✓ | ✗ | ✗ | 1/4 |
| fed_economic_indicators | ✗ | ✓ | ✗ | ✗ | 1/4 |
| hamilton_conversations | ✓ | ✓ | ✓ | ✗ | 3/4 |
| hamilton_messages | ✓ | ✓ | ✗ | ✗ | 2/4 |
| hamilton_saved_analyses | ✗ | ✓ | ✗ | ✗ | 1/4 |
| hamilton_scenarios | ✗ | ✓ | ✗ | ✗ | 1/4 |
| hamilton_reports | ✓ | ✓ | ✗ | ✗ | 2/4 |
| hamilton_watchlists | ✗ | ✓ | ✗ | ✗ | 1/4 |
| hamilton_signals | ✗ | ✓ | ✗ | ✗ | 1/4 |
| hamilton_priority_alerts | ✗ | ✓ | ✗ | ✗ | 1/4 |
| saved_peer_sets | ✓ | ✓ | ✗ | ✓ | 3/4 |
| articles | ✓ | ✓ | ✓ | ✓ | 4/4 |
| report_jobs | ✗ | ✓ | ✗ | ✗ | 1/4 |
| published_reports | ✗ | ✓ | ✗ | ✗ | 1/4 |
| external_intelligence | ✓ | ✓ | ✗ | ✓ | 3/4 |
| alert_subscriptions | ✓ | ✓ | ✗ | ✓ | 3/4 |

**Total Entities Audited:** 25  
**Entities with Full CRUD (4/4):** 1 (articles only)  
**Incomplete Entities:** 24  

## Overall Score: 1/25 entities with full CRUD (4%)

## Detailed CRUD Coverage

### Complete Implementations ✓

**articles** (1/25 — 4%)
- Create: `createArticle()` in `src/lib/crawler-db/articles.ts`
- Read: `getArticles()`, `getArticleBySlug()`, `getArticleById()`, `getPublishedArticles()`
- Update: `updateArticle()` + `incrementViewCount()`
- Delete: `deleteArticle()`
- **Status:** Fully agent-accessible, no Hamilton/research tool integration needed

### Partial Implementations (3/4)

**hamilton_conversations**
- Create: `createConversation()` — ✓
- Read: `loadConversationHistory()`, `listConversations()` — ✓
- Update: `updateConversationTitle()` — ✓
- Delete: No agent tool; T-17-04 scopes reads but no deletion endpoint
- **Gap:** No `deleteConversation()` operation for agents

**saved_peer_sets**
- Create: `savePeerSet()` — ✓
- Read: `getSavedPeerSets()` — ✓
- Update: No operation (immutable after creation)
- Delete: `deletePeerSet()` — ✓
- **Gap:** Update missing; peer sets are immutable by design

**external_intelligence**
- Create: `insertIntelligence()` — ✓
- Read: `searchExternalIntelligence()`, `listIntelligence()` — ✓
- Update: No operation (immutable records)
- Delete: `deleteIntelligence()` — ✓
- **Gap:** Update missing; intelligence is append-only

**alert_subscriptions**
- Create: `addAlertSubscription()` — ✓
- Read: `getAlertSubscriptions()`, `getAlertSubscriptionCount()` — ✓
- Update: No operation
- Delete: `removeAlertSubscription()` — ✓
- **Gap:** Update missing; subscriptions are created fresh

### Minimal Implementations (1–2/4)

**hamilton_reports**
- Create: `saveHamiltonReport()` — ✓
- Read: `getPublishedReports()`, `getRecentHamiltonReports()`, `getHamiltonReportById()` — ✓
- Update: ✗
- Delete: ✗
- **Gaps:** No update or delete; reports are immutable after creation

**hamilton_messages**
- Create: `appendMessage()` — ✓
- Read: `loadConversationHistory()` — ✓
- Update: ✗
- Delete: ✗
- **Gaps:** Messages are immutable (append-only audit trail)

**Core Crawler Entities** (all 1/4: read-only)
- crawl_targets, crawl_runs, crawl_results, extracted_fees, users, fee_reviews, institution_financials, institution_complaints, fed_beige_book, fed_content, fed_economic_indicators, report_jobs, published_reports
- **Pattern:** All defined in migrations (`.sql`) but no agent-accessible CRUD operations in `src/lib/crawler-db/`
- **Exception:** admin UI has server actions (`src/app/admin/*/actions.ts`) that modify these but are not agent tools

**Hamilton Pro Tables** (all 1/4: read-only)
- hamilton_saved_analyses, hamilton_scenarios, hamilton_watchlists, hamilton_signals, hamilton_priority_alerts
- **Pattern:** Seeded or created on-demand by Hamilton Pro layout but no agent mutation endpoints

## Incomplete Entities

### Read-Only Data Access (1/4)

These entities have strong read support via `src/lib/crawler-db/` but **zero agent mutation capability**:

1. **crawl_targets** — No agent tool to create/update/delete institutions
2. **crawl_runs** — No agent tool to trigger/modify crawl runs
3. **crawl_results** — No agent tool to create/update/delete results
4. **extracted_fees** — No agent tool to create/approve/reject fees (must use UI workflow)
5. **users** — No agent tool for user management (auth-gated)
6. **fee_reviews** — No agent tool to create reviews or change review status
7. **institution_financials** — No agent tool to ingest financial data
8. **institution_complaints** — No agent tool to ingest complaint data
9. **fed_beige_book** — No agent tool to ingest Beige Book content
10. **fed_content** — No agent tool to ingest Fed content
11. **fed_economic_indicators** — No agent tool to ingest economic data
12. **report_jobs** — No agent tool to create/query/update jobs
13. **published_reports** — No agent tool to create/unpublish reports
14. **hamilton_saved_analyses** — No agent tool to save/archive analyses
15. **hamilton_scenarios** — No agent tool to create/archive scenarios
16. **hamilton_watchlists** — No agent tool to create/update watchlists
17. **hamilton_signals** — No agent tool to create signals (immutable by design)
18. **hamilton_priority_alerts** — No agent tool to create/update alerts

### Update-Missing Entities (3/4)

1. **saved_peer_sets** — No update; designed immutable
2. **external_intelligence** — No update; append-only by design
3. **alert_subscriptions** — No update; subscription model is add/remove only

### Delete-Missing Entities (3/4)

1. **hamilton_conversations** — No agent delete; read-gated by user_id
2. **hamilton_reports** — No agent delete; immutable
3. **hamilton_messages** — No agent delete; immutable audit trail

## Root Causes

### Primary: Admin-Only Mutation Paths

**Finding:** Core entities (crawl_targets, extracted_fees, fee_reviews, etc.) are modified ONLY via:
- Supabase admin dashboard (direct SQL)
- Python crawler CLI (`fee_crawler/` scripts)
- Admin UI server actions (`src/app/admin/*/actions.ts`)

**Evidence:**
- `src/lib/crawler-db/` has 0 export functions matching `/^export.*function.*(create|insert|update|delete)/` for these tables
- All table definitions in `fee_crawler/db.py` and Postgres migrations are schema authority only
- No REST API endpoints expose CRUD for core entities (v1 routes are read-only; Hamilton routes are chat-only)

### Secondary: Immutable-by-Design Tables

**Finding:** 6 entities are intentionally append-only or immutable:
- fed_content, fed_economic_indicators, fed_beige_book (external data ingestion)
- hamilton_messages (audit trail)
- hamilton_signals (detected events)
- external_intelligence (research records)

**Design Decision:** These are correct immutability patterns, but they block agent autonomy for any mutation workflows.

### Tertiary: Soft-Delete Not Exposed

**Finding:** hamilton_saved_analyses and hamilton_scenarios support soft-delete (archived_at + status columns per D-07, D-08) but NO agent tool exposes archive/restore.

## Recommendations

### Critical (Blocks Agent Autonomy)

1. **Expose extracted_fees CRUD to agents:**
   - Add `approveExtractedFee(feeId, confident=true)` → updates review_status
   - Add `rejectExtractedFee(feeId, reason)` → updates review_status + validation_flags
   - Add `bulkApproveByCategory(category, filter)` for batch workflows
   - This unblocks research agents from autonomous fee curation

2. **Expose fee_reviews as agent-accessible:**
   - Create operation for agents to record review actions (approve/reject/flag)
   - Scope to user_id + timestamp for auditability
   - Required for Hamilton research workflows to log analysis decisions

3. **Expose hamilton_scenarios CRUD to agents:**
   - Add `createScenario(institutionId, feeCategory, currentValue, proposedValue, userId)` → stores result_json from analysis
   - Add `archiveScenario(scenarioId, userId)` → soft-delete via archived_at
   - This lets research agents save analysis outputs as scenarios for later reference

4. **Expose hamilton_watchlists to agents:**
   - Add `createWatchlist(userId, filters)` → mutation endpoint
   - Add `updateWatchlist(watchlistId, userId, filters)` → mutation endpoint
   - Let agents create watchlists dynamically based on analysis results

5. **Expose hamilton_conversations DELETE to agents:**
   - Add `deleteConversation(conversationId, userId)` → hard-delete with CASCADE
   - Scoped to user_id for safety
   - Allows cleanup of conversation histories without manual intervention

### High Priority (Completes Partial Implementations)

6. **Add UPDATE to saved_peer_sets:**
   - `updatePeerSet(id, userId, name, filters)` for agents to modify saved analysis contexts
   - Maintains immutability of the filter data itself (create new row if filters change)

7. **Expose report_jobs as agent-queryable:**
   - Add read-only tool `getReportJobStatus(jobId)` for polling
   - Add `createReportJob(reportType, params, userId)` for async report generation
   - Unblocks agents from initiating report requests

8. **Add soft-delete support for hamilton_saved_analyses:**
   - `archiveAnalysis(analysisId, userId)` → sets archived_at, status='archived'
   - `restoreAnalysis(analysisId, userId)` → unarchives
   - Maintains audit trail while preventing read

### Medium Priority (Quality of Life)

9. **Bulk operations for extracted_fees:**
   - `bulkUpdateFeeCategory(feeIds, newCategory)` for taxonomy corrections
   - `bulkSetValidationFlags(feeIds, flags)` for quality assurance workflows

10. **Hamilton watchlist subscriptions:**
    - `notifyWatchlistChange(watchlistId, changeType, data)` to push alerts
    - Currently signals are immutable; coupling to watchlist requires event-driven updates

## Conclusion

**CRUD Completeness: 1/25 entities (4%)**

Bank Fee Index exhibits a critical architectural asymmetry:
- **Read paths are well-distributed:** 25 entities have strong read coverage via `crawler-db/` + public tools
- **Write paths are centralized:** Mutations flow exclusively through CLI, admin UI, or Python backend — **zero agent access**

This design reflects the project's maturity stage (data ingestion pipelines + UI workflows) but blocks next-generation autonomous research agents from:
- Batch-approving extracted fees based on validation rules
- Archiving stale analyses or scenarios
- Creating dynamic watchlists based on real-time signals
- Recording agent-driven review decisions in the audit trail

**Recommendation:** Implement the Critical tier (CRUD for extracted_fees, fee_reviews, hamilton_scenarios, hamilton_watchlists, hamilton_conversations DELETE) as Phase 60.2, unblocking research agent autonomy while maintaining user_id scoping for safety.
