# feat: On-Demand Research Agents — Premium AI Analyst Suite

## Overview

Add a premium feature set of on-demand AI research agents to the Bank Fee Index admin panel. These agents act as specialized financial analysts that can query the internal fee database, cross-reference external publications and regulations, analyze legal developments, and produce comprehensive research reports. Each agent is purpose-built for a specific analytical task — fee benchmarking, compliance monitoring, competitive intelligence, regulatory tracking, and custom data queries.

## Problem Statement

Analysts currently perform manual, time-consuming research across multiple sources:
- **Internal data**: Running ad-hoc SQL queries or navigating multiple admin pages to answer questions like "How do community banks in the Southeast price overdraft vs. the national median?"
- **External context**: Manually searching CFPB enforcement actions, OCC bulletins, FDIC guidance, Fed Beige Book entries, and industry publications to understand regulatory trends
- **Competitive intelligence**: No automated way to compare a specific institution's fee structure against peer groups or identify pricing opportunities
- **Compliance risk**: No proactive monitoring of regulatory changes that could affect fee structures or require policy updates

**What should happen**: An analyst opens the Research Hub, selects a specialized agent (e.g., "Compliance Monitor"), asks a natural-language question, and receives a structured, sourced response that combines internal data with external intelligence — streamed in real-time.

## Proposed Solution

### Agent Architecture

Five specialized research agents, each with distinct tools and instructions:

| Agent | Purpose | Internal Tools | External Sources |
|-------|---------|---------------|-----------------|
| **Fee Benchmark Analyst** | Compare fees across institutions, tiers, districts | DB queries (medians, percentiles, peer comparisons) | Industry reports, FDIC fee surveys |
| **Compliance Monitor** | Track regulatory changes affecting fees | Fee flags, validation rules, audit trail | CFPB, OCC, FDIC, Fed bulletins, enforcement actions |
| **Competitive Intel** | Analyze specific institution positioning | Institution fees, peer group data, crawl history | Public fee schedules, press releases |
| **Market Trends** | Identify fee movement patterns and forecasts | Historical fee data, change events, index snapshots | Fed Beige Book, economic indicators, FRED data |
| **Custom Query** | Free-form analytical questions | Read-only DB access (parameterized), all internal data | Web search for context |

### User Experience

1. **Research Hub** (`/admin/research`) — grid of agent cards with descriptions
2. **Chat Interface** — select an agent, ask questions in natural language
3. **Streaming Responses** — real-time token streaming with tool call visibility
4. **Conversation History** — save and resume research sessions
5. **Export** — copy results as markdown, download as PDF

## Technical Approach

### Stack

- **LLM**: Anthropic Claude API (Sonnet 4 for most agents, Opus 4 for complex analysis)
- **Streaming**: Vercel AI SDK v6 (`streamText`, `useChat` hook)
- **Tools**: Read-only DB query wrappers exposed as Claude tools
- **Auth**: Existing role-based auth (analyst + admin only)
- **Storage**: SQLite tables for conversation history and usage tracking

### Files to Create

#### `src/app/admin/research/page.tsx` (server component)
Research Hub landing page with agent selection grid.

```tsx
// Agent cards with: icon, name, description, example questions
// Usage stats per agent (queries today, total)
// Role gate: analyst + admin only
```

#### `src/app/admin/research/[agentId]/page.tsx` (server component)
Chat interface for a specific agent.

```tsx
// Server component loads agent config + conversation history
// Renders <ResearchChat> client component
// Breadcrumbs: Dashboard > Research > [Agent Name]
```

#### `src/app/admin/research/[agentId]/research-chat.tsx` (client component)
Chat UI with streaming responses.

```tsx
// Uses Vercel AI SDK useChat() hook
// Renders message history with markdown
// Shows tool calls inline (expandable)
// Input with send button + suggested questions
// "New conversation" button
```

#### `src/app/api/research/[agentId]/route.ts` (API route)
Streaming API endpoint for agent conversations.

```tsx
// POST handler with streamText()
// Selects agent system prompt + tools based on agentId
// Validates auth (analyst/admin) and rate limits
// Streams response with tool results
```

#### `src/lib/research/agents.ts`
Agent definitions — system prompts, tool sets, model selection.

```typescript
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  icon: string; // SVG path or component name
  systemPrompt: string;
  tools: Record<string, Tool>;
  model: "claude-sonnet-4-20250514" | "claude-opus-4-20250514";
  maxTokens: number;
  exampleQuestions: string[];
  requiredRole: "analyst" | "admin";
}

export const AGENTS: Record<string, AgentConfig> = { ... };
```

#### `src/lib/research/tools.ts`
Read-only database tools exposed to agents.

```typescript
// Each tool: Zod schema for params, handler returns structured data
// ALL queries are read-only (use getDb() singleton, never getWriteDb())
// Tools:
//   queryFeesByCategory(category, filters) → fee stats
//   queryPeerComparison(institutionId, peerFilters) → comparison table
//   queryNationalIndex(categories?) → index data
//   queryInstitutionFees(institutionId) → all fees for institution
//   queryOutliers(category?, threshold?) → flagged fees
//   queryFeeHistory(category, dateRange?) → historical trends
//   queryDistrictData(districtId) → district metrics
//   searchInstitutions(query) → institution list
//   getCrawlStatus() → recent crawl summary
```

#### `src/lib/research/tools-external.ts`
External data source tools.

```typescript
// webSearch(query) → search results (via Brave/Google API)
// fetchRegulation(source, query) → CFPB/OCC/FDIC content
// fetchFredData(seriesId, dateRange) → economic indicators
// fetchBeigeBook(districtId?) → latest Beige Book summary
```

#### `src/lib/research/rate-limit.ts`
Usage tracking and rate limiting.

```typescript
// Per-user daily/monthly limits by role
// Token usage tracking (input + output)
// Cost estimation per query
// Rate limit tiers:
//   analyst: 50 queries/day, 500/month
//   admin: 200 queries/day, 2000/month
```

#### `src/lib/research/history.ts`
Conversation persistence.

```typescript
// saveConversation(userId, agentId, messages) → conversationId
// getConversation(conversationId) → messages[]
// listConversations(userId, agentId?) → summary[]
// deleteConversation(conversationId) → void
```

### Files to Modify

#### `src/lib/crawler-db/connection.ts`
No changes needed — agents use existing `getDb()` singleton (read-only).

#### `src/app/admin/admin-nav.tsx`
Add "Research" nav item between "Review" and "Districts".

#### `src/app/admin/actions/search.ts`
Add research conversations to Cmd+K search results.

### Database Schema

New tables in `data/crawler.db`:

```sql
CREATE TABLE IF NOT EXISTS research_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  agent_id TEXT NOT NULL,
  title TEXT, -- auto-generated from first message
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES research_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls TEXT, -- JSON array of tool invocations
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  agent_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_research_conv_user ON research_conversations(user_id);
CREATE INDEX idx_research_msg_conv ON research_messages(conversation_id);
CREATE INDEX idx_research_usage_user_date ON research_usage(user_id, created_at);
```

### Agent System Prompts (Summary)

**Fee Benchmark Analyst:**
> You are a bank fee analyst with access to the Bank Fee Index database. You help analysts compare fees across institutions, peer groups, and national benchmarks. Always cite specific data points. Present comparisons in tables when possible. Flag statistical outliers.

**Compliance Monitor:**
> You monitor regulatory developments affecting bank and credit union fees. You can search CFPB enforcement actions, OCC bulletins, and FDIC guidance. Cross-reference regulatory changes with internal fee data to identify compliance risks. Always cite regulation numbers and dates.

**Competitive Intel:**
> You analyze how specific institutions price their fees relative to peers. You identify pricing opportunities, unusual fee structures, and competitive positioning. Use internal peer comparison tools and supplement with public information.

**Market Trends:**
> You analyze fee market trends using historical data, economic indicators, and Fed commentary. You identify emerging patterns, seasonal variations, and macroeconomic factors influencing fee structures. Present findings with data visualizations when possible.

**Custom Query:**
> You are a flexible research assistant with read-only access to the Bank Fee Index database. You can answer any analytical question about the data. You construct efficient queries, explain your methodology, and present results clearly. You CANNOT modify data.

### Security Model

1. **Read-only DB access**: All agent tools use `getDb()` (read-only singleton). No write operations exposed.
2. **Parameterized queries only**: All tool handlers use parameterized SQL (`?` placeholders). No string interpolation.
3. **Input sanitization**: User messages are passed as content only, never interpolated into system prompts or tool definitions.
4. **Output filtering**: Agent responses are sanitized for XSS before rendering (React's default escaping + DOMPurify for markdown).
5. **Role-based access**: Research Hub requires `analyst` or `admin` role. Custom Query agent is admin-only.
6. **Rate limiting**: Per-user daily and monthly limits prevent abuse and control API costs.
7. **Audit logging**: All queries logged to `research_usage` table with token counts and cost estimates.
8. **No prompt injection vectors**: Tool results are returned as structured data (JSON), not interpolated into prompts. System prompts are server-side only.

### Data Flow

```
User (browser)
  └── useChat() hook sends message
        └── POST /api/research/[agentId]
              ├── Auth check (requireAuth("view"))
              ├── Rate limit check (research_usage table)
              ├── Load agent config (system prompt + tools)
              ├── streamText({ model, system, tools, messages })
              │     ├── Claude selects tool(s) to call
              │     ├── Tool handler runs read-only DB query
              │     ├── Tool result returned to Claude
              │     ├── Claude synthesizes response
              │     └── Tokens streamed back
              ├── Save messages to research_messages
              ├── Log usage to research_usage
              └── Stream response to client
```

### Cost Control

| Model | Input | Output | Est. per query |
|-------|-------|--------|---------------|
| Sonnet 4 | $3/M tokens | $15/M tokens | ~$0.02-0.08 |
| Opus 4 | $15/M tokens | $75/M tokens | ~$0.10-0.50 |

**Controls:**
- Default to Sonnet 4 (4/5 agents). Opus 4 only for Custom Query.
- `maxTokens` cap per agent (2048 for Benchmark, 4096 for Custom Query)
- Daily/monthly usage limits per user role
- Usage dashboard showing cost estimates
- Circuit breaker: disable agent if daily cost exceeds threshold

### UI Design

Follow existing admin patterns:

- **Research Hub**: Grid of agent cards using `.admin-card` with hover elevation
- **Chat Interface**: Full-height layout, messages left/right aligned, code blocks with syntax highlighting
- **Tool Calls**: Collapsible accordion showing tool name, params, and result
- **Suggested Questions**: Pill buttons below input (`rounded-full px-2.5 py-0.5 text-xs font-medium`)
- **Streaming Indicator**: Subtle pulse animation on assistant message while streaming
- **Conversation List**: Sidebar or dropdown showing saved conversations with timestamps

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

**Tasks:**
- [ ] Install dependencies: `@anthropic-ai/sdk`, `ai` (Vercel AI SDK), `zod`
- [ ] Create database migration for `research_conversations`, `research_messages`, `research_usage` tables
- [ ] Implement `src/lib/research/agents.ts` with Fee Benchmark Analyst config only
- [ ] Implement `src/lib/research/tools.ts` with 3 core tools (queryFeesByCategory, queryPeerComparison, queryNationalIndex)
- [ ] Create streaming API route at `/api/research/[agentId]/route.ts`
- [ ] Build Research Hub page (`/admin/research/page.tsx`) with single agent card
- [ ] Build chat interface (`/admin/research/[agentId]/page.tsx` + `research-chat.tsx`)
- [ ] Add "Research" to admin nav
- [ ] Basic rate limiting (in-memory, per-request)

**Success criteria:** Can ask the Fee Benchmark Analyst a question and receive a streamed response with real data from the database.

### Phase 2: Full Agent Suite

**Tasks:**
- [ ] Add remaining 4 agent configs with system prompts
- [ ] Implement all internal DB tools (9 total)
- [ ] Implement external tools (webSearch, fetchRegulation)
- [ ] Add conversation history persistence
- [ ] Add conversation list UI (resume previous sessions)
- [ ] Implement proper rate limiting with `research_usage` table
- [ ] Add usage stats to Research Hub page
- [ ] Add research conversations to Cmd+K search

**Success criteria:** All 5 agents functional with conversation persistence and rate limiting.

### Phase 3: Polish and Production Readiness

**Tasks:**
- [ ] Add tool call visualization (expandable accordion in chat)
- [ ] Add suggested questions per agent
- [ ] Add markdown rendering with syntax highlighting for responses
- [ ] Export conversation as markdown/PDF
- [ ] Usage dashboard for admins (cost tracking, top users, popular agents)
- [ ] Add Beige Book and FRED data tools for Market Trends agent
- [ ] Performance optimization (streaming, caching frequent queries)
- [ ] Security audit (prompt injection testing, output sanitization)
- [ ] Error handling (API failures, rate limit exceeded, model errors)

**Success criteria:** Production-ready feature with full UX polish, cost monitoring, and security hardening.

## Acceptance Criteria

### Functional Requirements
- [ ] Research Hub page shows all 5 agents with descriptions and example questions
- [ ] Chat interface streams responses in real-time with markdown rendering
- [ ] Fee Benchmark Analyst can query and compare fees across institutions, tiers, and districts
- [ ] Compliance Monitor can search regulatory sources and cross-reference with internal data
- [ ] Competitive Intel can analyze a specific institution's fee positioning vs peers
- [ ] Market Trends can identify patterns using historical data and economic indicators
- [ ] Custom Query can answer free-form analytical questions (admin-only)
- [ ] Conversation history is persisted and resumable
- [ ] Tool calls are visible (expandable) in the chat interface

### Non-Functional Requirements
- [ ] Only `analyst` and `admin` roles can access Research Hub
- [ ] Custom Query agent restricted to `admin` role only
- [ ] All DB queries are read-only (no write operations exposed to agents)
- [ ] All queries use parameterized SQL (no string interpolation)
- [ ] Rate limits enforced per user (50/day analyst, 200/day admin)
- [ ] Token usage and estimated cost tracked per query
- [ ] Responses sanitized for XSS before rendering
- [ ] Streaming latency < 500ms to first token

### Quality Gates
- [ ] Security review of tool implementations (no SQL injection vectors)
- [ ] Prompt injection testing (adversarial inputs don't leak system prompts or modify behavior)
- [ ] Cost estimation validated against actual API bills
- [ ] Load testing with concurrent users

## Dependencies and Prerequisites

- **Anthropic API key**: Required for Claude API access. Store in `ANTHROPIC_API_KEY` env var.
- **Vercel AI SDK**: `npm install ai @ai-sdk/anthropic` — provides `streamText`, `useChat`, tool definitions
- **External API keys** (Phase 2): Brave Search API or similar for web search tool
- **Existing infrastructure**: Auth system, DB connection patterns, admin layout — all in place

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API costs exceed budget | High | Rate limits, token caps, cost monitoring dashboard, circuit breaker |
| Prompt injection | High | Structured tool results only, no prompt interpolation, output sanitization |
| Hallucinated data | Medium | Tools return real DB data; agent instructed to cite tool results only |
| Slow responses | Medium | Stream tokens, cache frequent queries, use Sonnet (faster) by default |
| Agent gives bad advice | Medium | Disclaimer banner, audit trail, human review of saved conversations |

## Future Considerations

- **Scheduled reports**: Agents run on a cron and email weekly summaries
- **Multi-agent workflows**: Chain agents (e.g., Compliance finds issue → Benchmark quantifies impact)
- **Custom agent builder**: Admins create their own agents with custom system prompts and tool sets
- **Embeddings search**: Vector search over crawled documents for more precise source retrieval
- **MCP server**: Expose research agents as MCP tools for use in external AI workflows

## References

### Internal References
- Auth system: `src/lib/auth.ts`
- DB connection: `src/lib/crawler-db/connection.ts`
- DB queries (47+ exports): `src/lib/crawler-db/`
- Fee taxonomy: `src/lib/fee-taxonomy.ts`
- Fed districts: `src/lib/fed-districts.ts`
- Server actions pattern: `src/lib/fee-actions.ts`
- Admin layout: `src/app/admin/layout.tsx`
- Admin nav: `src/app/admin/admin-nav.tsx`
- Cmd+K search: `src/app/admin/actions/search.ts`
- National index queries: `src/lib/crawler-db/core.ts` (getNationalIndex, getPeerIndex)
- Fed data tables: `fed_beige_book`, `fed_content`, `fed_economic_indicators`

### External References
- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- Anthropic Claude API: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- Anthropic pricing: Sonnet 4 ($3/$15), Opus 4 ($15/$75) per million tokens
- OWASP LLM Top 10: https://owasp.org/www-project-top-10-for-large-language-model-applications/
