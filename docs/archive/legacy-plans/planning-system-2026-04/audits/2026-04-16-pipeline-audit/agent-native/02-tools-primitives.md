# Tools as Primitives Audit

## Tool Inventory

| Tool | File | Type | Reasoning |
|---|---|---|---|
| searchFees | tools.ts | PRIMITIVE | Single DB call: `getFeeCategorySummaries()` or `getFeeCategoryDetail()`. No branching business logic. |
| searchIndex | tools.ts | PRIMITIVE | Single DB call: `getNationalIndex()` or `getPeerIndex()`. Filter args are direct pass-through. |
| searchInstitutions | tools.ts | PRIMITIVE | Single DB call: `getInstitutionsByFilter()` with pagination. No orchestration. |
| getInstitution | tools.ts | PRIMITIVE | Two DB calls (`getInstitutionById()`, `getFeesByInstitution()`) but sequential, single-query pattern. |
| queryDistrictData | tools-internal.ts | PRIMITIVE | Single DB call: `getDistrictStats()` + single Beige Book lookup. No branching. |
| queryStateData | tools-internal.ts | PRIMITIVE | Single DB call: `getStateStats()`. Straightforward passthrough. |
| queryFeeRevenueCorrelation | tools-internal.ts | WORKFLOW | Dispatches to 3 different functions (`getFeeRevenueData()`, `getTierFeeRevenueSummary()`, `getCharterFeeRevenueSummary()`) based on view enum. Violates single-query principle. |
| queryOutliers | tools-internal.ts | PRIMITIVE | Single DB call: `getOutlierFlaggedFees()`. Maps result. |
| getCrawlStatus | tools-internal.ts | PRIMITIVE | Two DB calls (`getCrawlHealth()`, `getStats()`) but paired for single purpose. |
| getReviewQueueStats | tools-internal.ts | PRIMITIVE | Single DB call: `getReviewStats()`. |
| searchInstitutionsByName | tools-internal.ts | PRIMITIVE | Single SQL query with LIKE clause. Direct mapping. |
| rankInstitutions | tools-internal.ts | WORKFLOW | **Major issue**: Fetches all fees globally, computes P25/P75 in-memory, then queries institutions with complex branching. Four distinct metric branches (above_p75, below_p25, total_fees, outlier_flags) each with custom logic. ~120 lines of pure orchestration. |
| queryJobStatus | tools-internal.ts | PRIMITIVE | Single DB query (or two with minor branching on view param). No aggregation. |
| queryDataQuality | tools-internal.ts | PRIMITIVE | Single DB call per view (funnel, uncategorized, stale, review_status). Each is independent. |
| triggerPipelineJob | tools-internal.ts | WORKFLOW | **Medium issue**: Validates against allowlist, then calls `spawnJob()`. Mixes validation logic with job spawning. Should delegate allowlist to job runner. |
| queryNationalData | tools-internal.ts | WORKFLOW | **CRITICAL**: Mega-tool with 11 source handlers (call_reports, economic, health, complaints, fee_index, derived, fed_content, labor, demographics, research, deposits, external). Each handler calls 2–5 DB functions. Total ~200 lines. Acts as a query dispatcher/orchestrator that should be split into 11 separate tools. |
| queryRegulatoryRisk | tools-internal.ts | WORKFLOW | **Major issue**: Aggregates 3 independent signal sources (fee outlier computation + complaint summary + Fed speech filtering) with custom scoring logic. Fetches all fees for percentile math, queries complaints, filters speeches by keyword. 100+ lines with business rules. |
| searchIntelligence | hamilton-agent.ts | PRIMITIVE | Single DB call: `searchExternalIntelligence()`. Optional category filter. |
| triggerReport | hamilton-agent.ts | PRIMITIVE | Single HTTP call to report generation endpoint. No branching or aggregation. |

## Score: 15/19 (78.9%)

15 tools exhibit primitive behavior (single DB query, optional simple filtering, no branching).
4 tools are workflows that orchestrate multiple primitives or encode business logic.

## Problematic Tools (workflows that should be primitives)

### 1. queryNationalData (CRITICAL)
**Location:** `src/lib/research/tools-internal.ts:441–498`
**Issue:** Mega-tool dispatching to 11 independent source handlers, each making 2–5 DB calls.
- Handler complexity ranges from `handleCallReports()` (3 parallel calls) to `handleExternal()` (search + list).
- Violates single-responsibility: should be 11 separate tools (`queryCallReports`, `queryEconomic`, `queryHealth`, etc.).
- **Refactor hint:** Split into source-specific tools:
  ```typescript
  export const queryCallReports = tool({ view: "trend"|"top_institutions"|"by_tier"|"by_district", ... });
  export const queryEconomic = tool({ view: "fred"|"beige_book"|"national"|"district", ... });
  export const queryHealth = tool({ view: "metrics"|"by_charter"|"deposits"|"loans", ... });
  // ... etc for each source
  ```
  Then bundle them in `buildHamiltonTools()` as individual tools.

### 2. rankInstitutions
**Location:** `src/lib/research/tools-internal.ts:214–334`
**Issue:** Four distinct metric paths (above_p75, below_p25, total_fees, outlier_flags) with custom per-path logic.
- Fetches ALL fees globally, computes percentiles in-memory, then issues second query for institutions.
- Implements ranking business logic that should live in DB views or separate analytical tools.
- **Refactor hint:** Create separate tools per metric:
  ```typescript
  export const rankAboveP75 = tool({ ... fetch benchmarks, compute P75, filter institutions ... });
  export const rankBelowP25 = tool({ ... });
  export const rankByTotalFees = tool({ ... single GROUP BY ... });
  export const rankByOutlierFlags = tool({ ... single GROUP BY ... });
  ```

### 3. queryRegulatoryRisk
**Location:** `src/lib/research/tools-internal.ts:737–862`
**Issue:** Aggregates three independent signal sources (outlier detection, complaint analysis, Fed speech filtering) with custom scoring.
- Fetches all regulated-category fees, computes P75 per category, cross-joins institutions.
- Queries complaint summary via separate call.
- Filters Fed speeches by keyword regex.
- Scores: `(outlier_score + complaint_score + fed_score)` with capped 33-point scale per source.
- **Refactor hint:** Split into two tools:
  ```typescript
  // Primitive: fetch one signal source
  export const getFeeOutlierSignals = tool({ categories: string[], limit: number });
  export const getComplaintSignals = tool({ ... });
  export const getFedContentSignals = tool({ keywords?: string[], limit: number });
  
  // Agent orchestrates: "fetch all signals, then compute risk_score = (a+b+c)"
  // This moves orchestration to the agent, not the tool.
  ```

### 4. queryFeeRevenueCorrelation
**Location:** `src/lib/research/tools-internal.ts:93–122`
**Issue:** Dispatches to 3 different view handlers (`getFeeRevenueData()`, `getTierFeeRevenueSummary()`, `getCharterFeeRevenueSummary()`) based on enum.
- Not as severe as queryNationalData, but violates single-query principle.
- **Refactor hint:** Split into 3 separate tools:
  ```typescript
  export const getFeeRevenueByInstitution = tool({ limit: number });
  export const getFeeRevenueByTier = tool({ });
  export const getFeeRevenueByCharter = tool({ });
  ```

### 5. triggerPipelineJob (MINOR)
**Location:** `src/lib/research/tools-internal.ts:416–435`
**Issue:** Mixes allowlist validation with job spawning.
- Validates `command` against `SAFE_PIPELINE_COMMANDS` hardcoded in tool.
- Should delegate to job runner; tool becomes a simple single-step caller.
- **Refactor hint:** Move allowlist to job runner config or environment. Tool becomes:
  ```typescript
  export const triggerPipelineJob = tool({
    execute: async ({ command, dryRun }) => {
      try {
        const result = await spawnJob(command, dryRun ? ["--dry-run"] : [], "agent");
        return { success: true, jobId: result.jobId, ... };
      } catch (e) {
        return { error: String(e) };
      }
    }
  });
  ```

## Recommendations

1. **Immediate (High Impact):**
   - Split `queryNationalData` into 11 separate source-specific tools. This is the single largest violation of the primitives principle and will dramatically improve composability for specialized agents (e.g., a macro-economics agent only needs queryEconomic + queryHealth).
   
2. **High Priority (Medium Impact):**
   - Decompose `rankInstitutions` into 4 separate ranking tools (or push ranking logic into database views, then expose as 4 simple query tools).
   - Refactor `queryRegulatoryRisk` into 3 signal-source tools. Let the agent orchestrate the scoring.

3. **Medium Priority (Hygiene):**
   - Split `queryFeeRevenueCorrelation` into 3 tools by view.
   - Move `triggerPipelineJob` allowlist to config/job-runner, not tool.

4. **Architecture Note:**
   - Current design conflates two roles: **query primitives** (single DB operation) and **analytical workflows** (orchestrate multiple queries + business logic).
   - For agent-native architecture, primitives should enable agents to compose analysis, not encode it internally.
   - Targeted agents (Fee Analyst, Macro-Economics, Compliance Risk) should choose which primitives to call; the tools should not pre-compose them.

## Summary

The codebase is 78.9% primitive-aligned. Four tools (queryNationalData, rankInstitutions, queryRegulatoryRisk, queryFeeRevenueCorrelation) encode workflows that belong in agents, not tools. Decomposing these into 20+ primitive source-specific and metric-specific tools will unlock agent specialization while maintaining backward compatibility through agent-side bundling in `buildHamiltonTools()`.
