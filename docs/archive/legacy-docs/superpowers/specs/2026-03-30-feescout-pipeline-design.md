# FeeScout Pipeline Design

Port the FeeScout v7 artifact (browser-only) into the feeschedule-hub Next.js app as a server-side pipeline with SSE streaming.

## Problem

FeeScout v7 runs entirely in the browser (Claude artifact). Two calls fail due to CORS:
1. Scout agent hits a Supabase edge function (`fee-lookup`) -- cross-origin blocked
2. Analyst agent calls Anthropic API directly -- cross-origin blocked

## Solution

Move all 4 pipeline agents server-side behind a single SSE streaming endpoint. The browser sends a query, reads the stream, and renders progress + report using the same React UI from v7.

## Architecture

```
Browser (FeeScout.tsx)
  |
  +-- GET  /api/scout/institutions?q=...   <- autocomplete
  |
  +-- POST /api/scout/pipeline             <- SSE stream
            |
            +-- Agent 1: Scout        (DB lookup via postgres `sql`)
            +-- Agent 2: Classifier   (pure function, data quality assessment)
            +-- Agent 3: Extractor    (pure function, maps DB records to report schema)
            +-- Agent 4: Analyst      (Claude Sonnet via @anthropic-ai/sdk)
            |
            <- SSE events: agent status, log messages, final report
```

All 4 agents run sequentially server-side. Each emits SSE events as it runs. The client reads the stream and dispatches events to a `useReducer` (same state machine from v7).

## File Structure

```
src/
  lib/
    scout/
      types.ts              <- SSEEvent, Institution, ExtractedFee, MappedFee, FeeReport
      db.ts                 <- 3 queries using existing postgres sql connection
      agents.ts             <- Scout, Classifier, Extractor, Analyst + helpers
  app/
    api/
      scout/
        pipeline/
          route.ts          <- POST: SSE streaming endpoint (orchestrator)
        institutions/
          route.ts          <- GET: autocomplete search
    admin/
      scout/
        page.tsx            <- Server component, renders FeeScout client component
  components/
    scout/
      FeeScout.tsx          <- Main client component (ported from v7)
```

6 new files. One modification: add "Scout" entry to admin nav.

## Data Flow

### Autocomplete

```
GET /api/scout/institutions?q=cha
-> Query crawl_targets WHERE institution_name ILIKE '%cha%'
   ORDER BY asset_size DESC LIMIT 8
<- [{id, institution_name, state_code, asset_size_tier}, ...]
```

User selects an institution from the autocomplete dropdown. The selected institution's name populates the search input.

### Pipeline

```
POST /api/scout/pipeline  {query: "Chase"}

Content-Type: text/event-stream
Each event: "data: " + JSON + "\n\n"
Client reads via fetch() + ReadableStream reader (NOT EventSource, which only supports GET)

SSE stream:
  data: {type:"agent", agentId:"scout", status:"running"}
  data: {type:"log", agentId:"scout", msg:"Found 3 matches..."}
  data: {type:"agent", agentId:"scout", status:"ok", durationMs:120}
  ... (classifier, extractor logs) ...
  data: {type:"agent", agentId:"analyst", status:"running"}
  data: {type:"log", agentId:"analyst", msg:"Sending to Claude Sonnet..."}
  data: {type:"agent", agentId:"analyst", status:"ok", durationMs:3200}
  data: {type:"report", report:{...FeeReport...}}
  data: {type:"done", success:true}
```

### Pipeline Orchestrator Logic (route.ts)

The orchestrator in `route.ts` handles the glue between receiving a query and running agents:

1. Parse `{query}` from POST body
2. Call `searchInstitutions(query)` -- if no results, emit error event and close
3. Select first result (largest by assets) as the primary institution
4. Call `getExtractedFees(id)` and `getCrawlResults(id)` in parallel
5. Pass institution + fees + crawlResults to Agent 1 (Scout)
6. Pass ScoutResult to Agent 2 (Classifier)
7. Pass ScoutResult + ClassifierResult to Agent 3 (Extractor)
8. Pass all results to Agent 4 (Analyst)
9. Emit final report, close stream

## SSE Event Types

```typescript
type SSEEvent =
  | {type: "agent", agentId: AgentId, status: AgentStatus, durationMs?: number}
  | {type: "log", agentId: AgentId, msg: string}
  | {type: "report", report: FeeReport}
  | {type: "done", success: boolean}
  | {type: "error", msg: string}
```

## Database Queries (db.ts)

Uses the existing `sql` connection from `src/lib/crawler-db/connection.ts`. Four queries:

1. `searchInstitutions(query)` -- ILIKE search on crawl_targets, ordered by asset_size DESC, limit 10. Used by the pipeline orchestrator.
2. `getExtractedFees(crawlTargetId)` -- all extracted_fees for an institution, limit 500
3. `getCrawlResults(crawlTargetId)` -- recent crawl_results for an institution, limit 10
4. `autocompleteInstitutions(query)` -- lightweight search returning id, name, state_code, asset_size_tier, limit 8. Used by the autocomplete API route only.

These mirror the Supabase edge function logic but use the direct postgres connection.

## Agent Details

### Agent 1: Scout (DB lookup, no AI)
- Receives pre-fetched institution, fees, crawlResults
- Emits log messages about what was found
- Returns ScoutResult with institution metadata and primary doc URL

### Agent 2: Classifier (pure function, no AI)
- Assesses data quality: fee count, categories, amounts, crawl status
- Computes availability rating: high (10+ fees, 5+ amounts), medium (3+ fees), low
- Returns ClassifierResult

### Agent 3: Extractor (pure function, no AI)
- Maps raw DB fee records to normalized MappedFee schema
- Uses normCategory() to bucket into 7 display categories: account_maintenance, overdraft_nsf, atm, wire, card, foreign, other. These are display groupings for the report UI, not a replacement for the 49-category fee-taxonomy.ts system.
- Computes confidence based on fee count (10+ = 95%, 5+ = 80%, fewer = 60%)
- Returns ExtractorResult

### Agent 4: Analyst (Claude Sonnet call)
- Sends institution metadata + extracted fees to Claude Sonnet via @anthropic-ai/sdk
- Claude returns: data_quality, consumer_score (1-10), peer_context, highlights, warnings, tips, verdict
- Consumer score rubric: 8-10 = low/no fees, fee-competitive; 5-7 = market average; 1-4 = above-market, fee-heavy. Score must reference specific fees and amounts.
- Fee categories in the report come from Extractor (not Claude) to prevent hallucination
- Error handling: 30s timeout on Claude call. On failure, emit error event with message, mark analyst agent as "error", still return partial results (scout/classifier/extractor data) if available
- Returns the final FeeReport

## UI Components (FeeScout.tsx)

Ported from v7 with these adaptations:

- **Fonts/styling**: Uses existing Geist font and admin design tokens instead of custom Google Fonts and inline brand object
- **SSE client**: Replaces direct `runPipeline()` call with `fetch()` + `EventSource`-style stream reader
- **Reducer**: Same `useReducer` state machine from v7 (RESET, STATUS, AGENT_START, AGENT_DONE, LOG, PIPELINE_ERROR, REPORT)
- **Admin mode**: Shows full pipeline logs in AgentCards (expandable)
- **Future public mode**: Would show simplified progress (no raw logs)

Components:
- `FeeScout` -- main shell with search input, pipeline cards, report
- `AgentCard` -- pipeline step card with status, timing, live log feed, expandable detail
- `ScoreRing` -- SVG ring chart for consumer score (1-10)
- `FeeTable` -- fee schedule table grouped by 7 categories
- `Report` -- full report layout: header, score, verdict, highlights/warnings, tips, fee table

## Auth

- Pipeline route: `getCurrentUser()` from existing auth.ts
- Required role: admin or analyst (via `hasPermission(user, 'research')`)
- Admin page: protected by existing admin layout auth check
- No rate limiting beyond auth for now
- Premium users: not included in initial launch; add after proving out

## Dependencies

New dependency:
- `@anthropic-ai/sdk` -- direct Anthropic SDK for the Analyst agent

Not using:
- `@supabase/supabase-js` -- uses existing postgres connection instead
- Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) -- parallel system, not integrated

## Environment Variables

Already configured:
- `DATABASE_URL` -- existing postgres connection
- `ANTHROPIC_API_KEY` -- already in .env for existing research agents

No new env vars needed.

## Testing

- **Unit tests (vitest)**: Classifier and Extractor are pure functions -- test with fixture data. Cover normCategory() edge cases, confidence thresholds, availability ratings.
- **Analyst agent**: Mock `@anthropic-ai/sdk` in tests. Verify JSON parsing, error handling on malformed responses, timeout behavior.
- **DB queries**: Integration tests against the real database (existing pattern).
- **SSE stream**: Test that route.ts produces valid SSE format and handles errors gracefully.

## Scope Boundaries

Building:
- Server-side pipeline with SSE streaming
- Admin page at /admin/scout
- Autocomplete API route
- Full UI port from v7

Not building:
- Public route (future, after proving out)
- Conversation history / message persistence
- Cost tracking integration with research_usage table
- Rate limiting beyond auth
- Integration with existing research agent framework

## Migration Path

This is a parallel build. Once proven:
1. FeeScout pipeline replaces the Vercel AI SDK research agents
2. The existing `/api/research/[agentId]/` routes and `useChat` pattern retire
3. Other features (Content Writer, Custom Query) get rebuilt on the same SSE pattern
4. `@ai-sdk/anthropic` and `ai` packages eventually removed
