# Research Hub: Content Studio & Lead Generation

## Overview

The Research Hub has 3 AI agents that can synthesize fee data, economic context, and competitive insights — but no way to turn that into publishable content. The goal is a Content Studio that lets you generate, edit, and publish data-driven articles to attract professional customers, demonstrate database depth, and capture institutional leads.

## What Exists Today

| Asset | Status |
|-------|--------|
| 3 AI agents (Ask, Fee Analyst, Custom Query) | Working, with tools + cost tracking |
| 10 consumer guides | Hardcoded in `src/lib/guides.ts`, static |
| Fed Beige Book + FRED economic data | Ingested, queryable by agents |
| Fee-to-revenue correlation data | Available via internal tools |
| State/district/national fee benchmarks | 2,200+ public pages |
| Conversation history + usage tracking | SQLite tables |

## What's Missing

1. **Content writing agent** — no agent optimized for long-form article generation
2. **Content storage** — guides are hardcoded, no DB table for dynamic content
3. **Publishing workflow** — no draft/review/publish pipeline
4. **Lead capture** — no email gates, no "get your personalized report" CTAs
5. **Content calendar** — no scheduled generation or topic planning

## Phase 1: Content Studio MVP

### 1a. Add `research_articles` DB table

```sql
CREATE TABLE research_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT NOT NULL,             -- markdown
  category TEXT NOT NULL,            -- 'guide' | 'analysis' | 'report' | 'brief'
  tags TEXT,                         -- JSON array
  author TEXT DEFAULT 'Bank Fee Index',
  status TEXT DEFAULT 'draft',       -- 'draft' | 'published' | 'archived'
  generated_by TEXT,                 -- agent_id or 'manual'
  conversation_id INTEGER,          -- link to research_conversations if agent-generated
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  view_count INTEGER DEFAULT 0
);
```

### 1b. Add "Content Writer" agent

New agent in `src/lib/research/agents.ts`:
- Optimized for 500-2000 word articles
- System prompt: financial writer voice, cite specific data, include benchmarks
- Tools: all internal tools + new `getArticleTopics()` tool
- Model: Opus for quality, 6000 token max, 10 tool calls
- Admin-only access

### 1c. Content Studio admin page (`/admin/research/studio`)

Two-column layout:
- **Left (col-span-4):** Topic selector + agent chat for content generation
- **Right (col-span-8):** Live markdown preview of generated content

Workflow:
1. Pick a topic template (e.g., "District Fee Outlook", "Category Deep Dive", "State Comparison")
2. Set parameters (district, category, state, etc.)
3. Agent generates draft article with real data citations
4. Edit inline or send back to agent for revisions
5. Save as draft -> review -> publish

### 1d. Article listing page (`/admin/research/articles`)

Table of all articles:
- Title, category, status (draft/published/archived), created date, view count
- Filters: status, category
- Actions: edit, publish, archive, delete

## Phase 2: Publishing Pipeline

### 2a. Dynamic article pages (`/research/articles/[slug]`)

Public-facing article pages:
- Pull from `research_articles` table (status = 'published')
- Markdown rendering with data visualization components
- SEO metadata (title, description, structured data)
- Sidebar: related articles, CTA for institutional access
- View counter increment on load

### 2b. Migrate hardcoded guides to DB

Move the 10 guides from `src/lib/guides.ts` into `research_articles` table:
- Category: 'guide'
- Status: 'published'
- Keep existing URLs working via redirect or slug matching

### 2c. Article index on public site

Update `/research` page to show published articles:
- Section: "Latest Research" with article cards
- Filter by category (guides, analysis, reports, briefs)
- Pagination

## Phase 3: Lead Generation

### 3a. Gated content

Some articles are "preview + gate":
- Show first 30% of article free
- CTA: "Enter your email to read the full analysis"
- Store lead in `research_leads` table

### 3b. Institutional report CTA

On article pages:
- "Get Your Institution's Competitive Analysis" button
- Modal: institution name, email, asset tier
- Triggers agent to generate personalized report (async)
- Email PDF link when ready

### 3c. Lead tracking table

```sql
CREATE TABLE research_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT,
  institution TEXT,
  asset_tier TEXT,
  source_article TEXT,              -- slug of article that captured the lead
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Phase 4: Content Templates

Pre-built topic templates that feed the Content Writer agent:

| Template | Parameters | Output |
|----------|-----------|--------|
| District Fee Outlook | district_id | 800-word analysis combining Beige Book + fee data |
| Category Deep Dive | fee_category | 1200-word guide with national stats + state variations |
| State Fee Report | state_code | 600-word state-specific fee landscape |
| Peer Comparison Brief | charter, tier | 500-word competitive positioning analysis |
| Monthly Fee Pulse | (none) | 400-word monthly summary of index movements |
| Regulatory Impact | (topic) | 800-word analysis of regulatory changes on fees |

## Files to Create

| File | Purpose |
|------|---------|
| `src/app/admin/research/studio/page.tsx` | Content Studio — generate + edit articles |
| `src/app/admin/research/articles/page.tsx` | Article listing + management |
| `src/app/admin/research/articles/[id]/page.tsx` | Article editor |
| `src/app/admin/research/studio/actions.ts` | Server actions: save/publish/archive articles |
| `src/app/(public)/research/articles/[slug]/page.tsx` | Public article pages |
| `src/lib/crawler-db/articles.ts` | DB queries for articles CRUD |
| `src/lib/research/content-templates.ts` | Topic templates with parameter schemas |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/research/agents.ts` | Add Content Writer agent |
| `src/lib/research/tools-internal.ts` | Add getArticleTopics() tool |
| `src/app/(public)/research/page.tsx` | Add "Latest Research" section |
| `src/lib/guides.ts` | Eventually migrate to DB (Phase 2b) |

## Acceptance Criteria

- [ ] Content Writer agent can generate 500-2000 word articles with real data citations
- [ ] Articles saved to DB with draft/published/archived status
- [ ] Content Studio page: topic selection -> generation -> preview -> save
- [ ] Article listing page with status filters and actions
- [ ] Published articles render on public `/research/articles/[slug]`
- [ ] Existing 10 guides migrated to DB (backward compatible URLs)
- [ ] Lead capture form on gated articles
- [ ] View counting on public articles

## Success Metrics

- Articles published per week (target: 2-3)
- Public page views on research content
- Email leads captured via gated content
- Agent cost per article (target: < $0.50)
- Conversion: article view -> lead capture (target: 2-5%)

## References

- `src/lib/research/agents.ts` — existing 3 agents
- `src/lib/research/tools-internal.ts` — 7 internal tools
- `src/lib/research/history.ts` — conversation persistence
- `src/lib/guides.ts` — 10 hardcoded guides
- `src/app/(public)/research/page.tsx` — public research hub
- `src/app/admin/research/page.tsx` — admin agent selection
- `src/app/admin/research/[agentId]/page.tsx` — chat interface
