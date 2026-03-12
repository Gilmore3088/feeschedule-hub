# feat: AI Research Platform — Unified Public + Admin Intelligence Layer

> Add AI-powered research capabilities to Bank Fee Index: a public "Ask the Data" widget for consumers and a full admin Research Hub with specialized agents for analysts. Built on top of the existing REST API and 2,200+ static research pages.

## Overview

The Research Pipelines plan shipped 2,200+ static public pages and 3 REST API endpoints. This plan adds the **interactive AI layer** on top of that foundation — letting both consumers and analysts ask natural-language questions against the Bank Fee Index dataset.

Two audiences, two interfaces, one tool infrastructure:

| Surface | Audience | Agents | Auth | Cost Profile |
|---------|----------|--------|------|-------------|
| **Ask the Data** widget | Public visitors | 1 lightweight agent | None (rate-limited by IP) | Sonnet, ~$0.01-0.03/query |
| **Admin Research Hub** | Analysts + Admins | 2 specialized agents | Role-based (analyst/admin) | Sonnet + Opus, ~$0.02-0.50/query |

## Problem Statement

1. **Static pages can't answer ad-hoc questions** — A consumer wanting "Which Texas credit union has the lowest overdraft fee?" must manually browse state and institution pages. An analyst wanting "Compare overdraft pricing between District 7 community banks and the national median" must run multiple page loads.
2. **No competitive moat** — Bankrate/NerdWallet have editorial teams. Our differentiator is the structured dataset. AI + data = interactive research that editorial sites can't replicate.
3. **Admin analysts still do manual work** — Despite rich admin dashboards, complex analytical questions require navigating multiple pages, mentally cross-referencing data, and building ad-hoc comparisons.

## Proposed Solution

### Architecture: API-as-Tool-Layer

Instead of creating a separate query layer for agents, wrap the existing REST API endpoints as Claude tools:

```
User question
  → Claude selects tool(s)
    → Tool calls /api/v1/fees, /api/v1/index, /api/v1/institutions
      → API returns JSON
        → Claude synthesizes response
          → Streamed to user
```

This means:
- **Zero duplicate query code** — agents use the same API consumers and developers use
- **API improvements benefit all channels** — add a filter to the API, agents automatically get it
- **Testable independently** — tools are just HTTP calls, easy to mock

### Agent Definitions

#### 1. Public Agent: "Ask the Data"

**Purpose:** Answer consumer questions about bank fees using the public API.

**Model:** Sonnet (fast, cheap)

**System prompt core:**
> You are the Bank Fee Index research assistant. You help consumers and researchers understand bank and credit union fees across the United States. You have access to a database of 65,000+ fee observations from 2,100+ institutions across all 50 states. Always cite specific numbers. Present comparisons in tables. Link to relevant pages on the site when available.

**Tools available:**
- `searchFees(category?)` → calls `/api/v1/fees`
- `searchIndex(state?, charter?, district?)` → calls `/api/v1/index`
- `searchInstitutions(state?, charter?, page?, limit?)` → calls `/api/v1/institutions`
- `getInstitution(id)` → calls `/api/v1/institutions?id=`

**Guardrails:**
- No conversation history (stateless — each question is independent)
- 3 tool calls max per question
- 1024 max output tokens
- Rate limit: 10 queries/minute per IP, 50/day per IP
- No PII collection, no financial advice disclaimers auto-appended

**UI:** Floating widget on public pages (bottom-right), expandable chat panel. Single question/answer — not a conversation.

#### 2. Admin Agent: "Fee Analyst"

**Purpose:** Deep analytical queries combining internal data, peer comparisons, and cross-referencing.

**Model:** Sonnet (default), Opus for complex multi-step analysis

**System prompt core:**
> You are a senior bank fee analyst with full access to the Bank Fee Index database. You help analysts benchmark fees, identify pricing patterns, compare institutions against peers, and produce data-driven insights. Always cite specific data points with institution names, amounts, and observation counts. Present comparisons in tables. Flag statistical outliers. When asked about trends, note whether historical data is available or if the analysis is point-in-time.

**Tools available (all public API tools plus):**
- `queryFeeCategory(category)` → calls `/api/v1/fees?category=` (detailed breakdown)
- `queryPeerIndex(state?, charter?, district?)` → calls `/api/v1/index` with filters
- `listInstitutions(state?, charter?, page?, limit?)` → calls `/api/v1/institutions`
- `getInstitutionDetail(id)` → calls `/api/v1/institutions?id=` (includes all fees)
- `queryDistrictData(districtId)` → internal DB: district stats + Beige Book context
- `queryFeeRevenueCorrelation()` → internal DB: fee-to-revenue data
- `queryOutliers(category?, threshold?)` → internal DB: flagged/extreme fees

**Features:**
- Conversation history (persist across sessions)
- Suggested questions per context
- Export as markdown
- Tool call visualization (expandable accordion)

#### 3. Admin Agent: "Custom Query" (Admin-only)

**Purpose:** Free-form analytical questions with broader data access.

**Model:** Opus (complex reasoning)

**System prompt core:**
> You are a flexible research assistant with comprehensive read-only access to the Bank Fee Index database. You can answer any analytical question about fees, institutions, financial data, and regulatory context. You construct efficient queries, explain your methodology, and present results clearly. You CANNOT modify data. When uncertain, say so.

**Tools available (all Fee Analyst tools plus):**
- `searchInstitutionsByName(query)` → internal DB: fuzzy name search
- `getCrawlStatus()` → internal DB: recent crawl summary
- `getReviewStats()` → internal DB: review queue statistics
- `getBeigeBookSummary(districtId?)` → internal DB: Fed Beige Book entries

**Access:** Admin role only. Higher rate limits (200 queries/day).

## Technical Approach

### Stack

- **LLM:** Anthropic Claude API (`@ai-sdk/anthropic`)
- **Streaming:** Vercel AI SDK (`ai` package) — `streamText()` server-side, `useChat()` client-side
- **Tools:** Zod schemas for parameters, handlers call REST API or DB functions
- **Auth:** Existing `src/lib/auth.ts` role system (analyst + admin)
- **Storage:** SQLite tables for conversation history + usage tracking

### Files to Create

```
src/lib/research/
  agents.ts              # Agent configs: system prompts, tool sets, model selection
  tools.ts               # Tool definitions wrapping /api/v1/ endpoints
  tools-internal.ts      # Admin-only tools wrapping direct DB queries
  rate-limit.ts          # Per-IP (public) and per-user (admin) rate limiting
  history.ts             # Conversation persistence (admin only)

src/app/api/research/
  [agentId]/route.ts     # Streaming API endpoint for all agents

src/app/admin/research/
  page.tsx               # Research Hub — agent selection grid
  [agentId]/page.tsx     # Chat interface (server component)
  research-chat.tsx      # Chat UI (client component)

src/components/public/
  ask-widget.tsx         # Public "Ask the Data" floating widget (client component)
```

### Files to Modify

```
src/app/(public)/layout.tsx    # Add <AskWidget /> to public layout
src/app/admin/admin-nav.tsx    # Add "Research" nav item
src/app/admin/actions/search.ts # Add conversations to Cmd+K search
package.json                    # Add: ai, @ai-sdk/anthropic, zod
```

### Tool Implementation Pattern

Each tool wraps an existing API endpoint or DB function:

```typescript
// src/lib/research/tools.ts
import { tool } from "ai";
import { z } from "zod";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export const searchFees = tool({
  description: "Search fee categories with national statistics. Returns median, P25, P75, min, max for each category.",
  parameters: z.object({
    category: z.string().optional().describe("Fee category slug (e.g., overdraft, nsf, monthly_maintenance). Omit for all 49 categories."),
    format: z.enum(["json", "csv"]).optional().default("json"),
  }),
  execute: async ({ category, format }) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (format === "csv") params.set("format", "csv");
    const res = await fetch(`${BASE_URL}/api/v1/fees?${params}`);
    return res.json();
  },
});

export const searchIndex = tool({
  description: "Get the national or filtered fee index. Filter by state, charter type, or Fed district.",
  parameters: z.object({
    state: z.string().optional().describe("Two-letter state code (e.g., CA, TX)"),
    charter: z.enum(["bank", "credit_union"]).optional(),
    district: z.string().optional().describe("Fed district number(s), comma-separated"),
  }),
  execute: async ({ state, charter, district }) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (charter) params.set("charter", charter);
    if (district) params.set("district", district);
    const res = await fetch(`${BASE_URL}/api/v1/index?${params}`);
    return res.json();
  },
});

// ... similar for searchInstitutions, getInstitution
```

### Database Schema (Admin features only)

```sql
CREATE TABLE IF NOT EXISTS research_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  agent_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES research_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls TEXT,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ip_address TEXT,
  agent_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_research_conv_user ON research_conversations(user_id);
CREATE INDEX idx_research_msg_conv ON research_messages(conversation_id);
CREATE INDEX idx_research_usage_user_date ON research_usage(user_id, created_at);
CREATE INDEX idx_research_usage_ip_date ON research_usage(ip_address, created_at);
```

### Streaming API Route

```typescript
// src/app/api/research/[agentId]/route.ts
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { AGENTS } from "@/lib/research/agents";

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const agent = AGENTS[agentId];
  if (!agent) return Response.json({ error: "Unknown agent" }, { status: 404 });

  // Auth check for admin agents
  if (agent.requiresAuth) {
    // ... validate session, check role
  }

  // Rate limit check
  // ... per-IP for public, per-user for admin

  const { messages } = await request.json();

  const result = streamText({
    model: anthropic(agent.model),
    system: agent.systemPrompt,
    tools: agent.tools,
    messages,
    maxTokens: agent.maxTokens,
    maxSteps: agent.maxToolCalls,
  });

  return result.toDataStreamResponse();
}
```

### Security Model

1. **Read-only data access** — All tools call read-only API endpoints or `getDb()` singleton
2. **Parameterized queries** — All DB queries use `?` placeholders (existing pattern)
3. **No prompt injection surface** — Tool results are structured JSON, not interpolated into prompts
4. **Output sanitization** — React default escaping + markdown renderer for responses
5. **Role-based access** — Public agent: no auth, IP rate-limited. Fee Analyst: analyst+admin. Custom Query: admin only
6. **Rate limiting** — Public: 10/min, 50/day per IP. Analyst: 50/day. Admin: 200/day
7. **Cost controls** — Token caps per agent, daily cost circuit breaker
8. **Audit trail** — All queries logged to `research_usage` with token counts and cost

### Cost Estimates

| Agent | Model | Input | Output | Est. per query | Daily cap |
|-------|-------|-------|--------|----------------|-----------|
| Ask the Data | Sonnet | $3/M | $15/M | ~$0.01-0.03 | $5 |
| Fee Analyst | Sonnet | $3/M | $15/M | ~$0.02-0.08 | $20 |
| Custom Query | Opus | $15/M | $75/M | ~$0.10-0.50 | $50 |

### UI Design

**Public "Ask the Data" widget:**
- Floating button (bottom-right): "Ask about bank fees"
- Expands to panel: text input + single response area
- Stateless — each question starts fresh
- Shows "Powered by Bank Fee Index" + disclaimer
- Matches public site design (slate/emerald palette)

**Admin Research Hub (`/admin/research`):**
- Grid of 2 agent cards using `.admin-card` pattern
- Each card: icon, name, description, 3 example questions, usage count
- Click → chat interface

**Admin Chat Interface:**
- Full-height layout with message history
- Messages: user right-aligned, assistant left-aligned
- Tool calls: collapsible accordion (tool name, params, result preview)
- Suggested questions as pill buttons below input
- Conversation sidebar: list of saved conversations with timestamps
- Export button: copy as markdown
- Streaming indicator: subtle pulse on assistant message

## Implementation Phases

### Phase 1: Foundation + Public Widget

**Goal:** Ship the public "Ask the Data" widget with one agent calling existing API endpoints.

**Tasks:**
- [x] Install dependencies: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`, `zod`
- [x] Create `src/lib/research/agents.ts` with public agent config
- [x] Create `src/lib/research/tools.ts` wrapping `/api/v1/` endpoints (4 tools)
- [x] Create `src/lib/research/rate-limit.ts` with in-memory IP rate limiting
- [x] Create streaming API route at `/api/research/[agentId]/route.ts`
- [x] Build `src/components/public/ask-widget.tsx` (floating chat panel)
- [x] Add `<AskWidget />` to public layout (via lazy-loaded AskWidgetLoader)
- [ ] Add `ANTHROPIC_API_KEY` to `.env.local`
- [ ] Test with 10+ sample questions across all tool types

**Success criteria:** A visitor on any public page can click "Ask about bank fees", type a question, and receive a streamed answer with real data from the API.

### Phase 2: Admin Research Hub

**Goal:** Ship the admin Research Hub with Fee Analyst and Custom Query agents.

**Tasks:**
- [x] Create `src/lib/research/tools-internal.ts` with admin-only tools (district data, fee-revenue, outliers, crawl status, Beige Book)
- [x] Add Fee Analyst and Custom Query agent configs to `agents.ts`
- [x] Create database migration for `research_conversations`, `research_messages`, `research_usage`
- [x] Create `src/lib/research/history.ts` for conversation persistence
- [x] Build `/admin/research/page.tsx` — agent selection grid
- [x] Build `/admin/research/[agentId]/page.tsx` — chat interface (server component)
- [x] Build `/admin/research/[agentId]/research-chat.tsx` — chat UI (client component)
- [x] Add "Research" to admin nav (between "Review" and "Districts")
- [x] Add auth checks (analyst for Fee Analyst, admin for Custom Query)
- [x] Implement per-user rate limiting from `research_usage` table

**Success criteria:** Analysts can open the Research Hub, select an agent, have multi-turn conversations with real data, and resume previous conversations.

### Phase 3: Polish + Production Readiness

**Goal:** Harden for production use with cost monitoring, UX polish, and security.

**Tasks:**
- [x] Add tool call visualization (expandable accordion in chat messages)
- [x] Add suggested questions per agent (context-aware)
- [x] Add markdown rendering with tables and code blocks for responses
- [x] Export conversation as markdown
- [ ] Add usage dashboard for admins (daily cost, query count, top users, popular questions)
- [ ] Add conversations to Cmd+K search results
- [ ] Add daily cost circuit breaker (disable agent if threshold exceeded)
- [ ] Security: prompt injection testing with adversarial inputs
- [ ] Error handling: API failures, rate limit exceeded, model errors
- [ ] Add loading states and error boundaries

**Success criteria:** Production-ready with cost monitoring, security hardening, and polished UX. No unhandled errors.

## Acceptance Criteria

### Functional
- [ ] Public widget answers questions with real fee data on any public page
- [ ] Admin Research Hub shows 2 agents with descriptions and example questions
- [ ] Fee Analyst can compare fees across institutions, tiers, states, and districts
- [ ] Custom Query can answer free-form questions (admin-only)
- [ ] Chat streams responses in real-time with markdown rendering
- [ ] Admin conversations are persisted and resumable
- [ ] Tool calls visible (expandable) in admin chat

### Non-Functional
- [ ] Public widget: no auth required, rate-limited by IP
- [ ] Fee Analyst: analyst + admin roles only
- [ ] Custom Query: admin role only
- [ ] All data access is read-only
- [ ] Rate limits enforced (public: 10/min, 50/day; analyst: 50/day; admin: 200/day)
- [ ] Token usage tracked per query with cost estimates
- [ ] Streaming latency < 500ms to first token
- [ ] Public widget adds < 50KB to page bundle (lazy loaded)

## Dependencies

- **Anthropic API key** — `ANTHROPIC_API_KEY` in env
- **`ai` package** (Vercel AI SDK) — `streamText`, `useChat`, tool definitions
- **`@ai-sdk/anthropic`** — Anthropic provider for Vercel AI SDK
- **`zod`** — Tool parameter schemas (may already be a transitive dep)
- **Existing REST API** — `/api/v1/fees`, `/api/v1/index`, `/api/v1/institutions` (already shipped)
- **Existing auth** — `src/lib/auth.ts` with role system (already in place)

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API costs exceed budget | High | Rate limits, token caps, daily circuit breaker, Sonnet by default |
| Prompt injection | High | Structured tool results, no prompt interpolation, output sanitization |
| Hallucinated data | Medium | Tools return real data; system prompt: "only cite tool results" |
| Slow responses | Medium | Stream tokens, Sonnet for speed, cache frequent API responses |
| Public abuse | Medium | IP rate limiting, no conversation state, short output cap |
| Agent gives bad advice | Medium | Disclaimer on public widget, audit trail, no financial advice |

## Supersedes

This plan **replaces** `plans/feat-on-demand-research-agents.md` and extends the completed `plans/feat-research-pipelines.md`.

Key changes from the original agents plan:
- Collapsed 5 agents → 3 (cut Compliance Monitor and Market Trends — no external API integrations exist yet)
- Added public-facing "Ask the Data" widget (original was admin-only)
- Tools wrap existing REST API instead of creating duplicate DB query layer
- Simpler phasing (3 phases vs 3, but less scope per phase)

## References

### Internal
- REST API endpoints: `src/app/api/v1/{fees,index,institutions}/route.ts`
- Auth system: `src/lib/auth.ts`
- DB connection: `src/lib/crawler-db/connection.ts`
- Fee taxonomy: `src/lib/fee-taxonomy.ts` (49 categories, 9 families)
- Admin nav: `src/app/admin/admin-nav.tsx`
- Cmd+K search: `src/app/admin/actions/search.ts`
- Public layout: `src/app/(public)/layout.tsx`
- Geographic queries: `src/lib/crawler-db/geographic.ts`
- Fee-revenue queries: `src/lib/crawler-db/fee-revenue.ts`
- Beige Book data: `fed_beige_book` table, ingested via `ingest-beige-book` CLI

### External
- Vercel AI SDK: https://sdk.vercel.ai/docs
- Anthropic Claude API tool use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- @ai-sdk/anthropic: https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic
