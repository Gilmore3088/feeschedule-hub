# Claude Prism Evaluation: What to Adopt for Fee Insight Research

## Verdict: Don't Fork. Cherry-Pick 3 Patterns.

Claude Prism is a **Tauri desktop app for LaTeX scientific writing**. It's not a web research analyst, data analysis tool, or content publishing platform. Forking it would give you:
- A desktop-only app (not web)
- LaTeX compilation (you don't need)
- Zotero bibliography (you don't need)
- Git-based history for documents (you don't need)

What you'd still have to build from scratch: all your DB tools, fee analysis, content publishing, lead capture, the entire Next.js frontend.

**The integration cost exceeds building it yourself.**

## What IS Worth Adopting (3 Patterns)

### Pattern 1: Proposed Changes Panel

**What it does:** When Claude edits files, Prism shows a diff panel where you accept/reject individual chunks — not all-or-nothing.

**Why it matters for you:** When the Content Writer generates an article, you could show a "Review Changes" panel where you accept/reject individual sections before saving as draft.

**How to adopt:** Build a simple markdown diff viewer in React. No Tauri needed — this is pure frontend logic.

**Effort:** Small. A single client component.

### Pattern 2: Scientific Skills (Domain Knowledge Injection)

**What it does:** Prism downloads 100+ domain-specific skill files (bioinformatics, cheminformatics, ML, etc.) and loads them as system prompt extensions when relevant.

**Why it matters for you:** You could create "fee analysis skills" — pre-built prompt templates that inject domain expertise:
- "Overdraft Fee Expert" — knows regulatory context, CFPB guidance, common pricing strategies
- "District Analyst" — knows Beige Book interpretation, FRED indicators, regional patterns
- "Competitive Benchmarker" — knows peer grouping methodology, statistical interpretation

**How to adopt:** You already have content templates in the plan. Extend your agent system prompts with skill injection based on the topic being analyzed.

**Effort:** Medium. Add a skills registry + topic detection in agent routing.

### Pattern 3: Multi-Tab Chat Store (Zustand)

**What it does:** Each editor tab has its own independent Claude session — streaming state, messages, tool results — managed via a Zustand store with per-tab projection.

**Why it matters for you:** Your Research Hub has one chat per agent. If users want to run multiple analyses simultaneously (e.g., "District 5 outlook" in one tab + "Overdraft deep dive" in another), multi-tab sessions would be valuable.

**How to adopt:** Replace your single `useChat()` with a Zustand store that keys by conversation ID. The Vercel AI SDK already supports this via the `id` parameter.

**Effort:** Medium. Refactor chat state management.

## What NOT to Adopt

| Prism Feature | Why Skip It |
|---|---|
| Tauri desktop framework | You're a web app. No benefit. |
| Tectonic LaTeX compiler | Not relevant to fee analysis |
| Git-based history | Your DB already has audit trails |
| MuPDF viewer | Not relevant |
| Zotero integration | Not relevant |
| UV Python env | You already have Python via fee_crawler |
| Claude CLI subprocess | You use the API directly (better for web) |
| External editor support | Not relevant |

## What You Already Have That's Better

| Capability | Prism | Fee Insight |
|---|---|---|
| AI Integration | Claude CLI subprocess (hacky for web) | Vercel AI SDK + streaming API (web-native) |
| Tool System | Claude's built-in file/bash tools | Custom DB tools accessing 63K+ fee observations |
| Data Access | File system only | SQLite with 16 query modules, 50+ functions |
| Content Publishing | None (writes LaTeX files) | Draft -> Review -> Publish pipeline with public pages |
| Cost Tracking | None | Per-query usage logging with daily circuit breaker |
| Rate Limiting | None | Per-IP + per-user rate limits |
| Export | LaTeX PDF compilation | CSV + branded HTML report |
| Multi-model | Model selector in UI | Model per agent with env var overrides |

## Recommendation

Don't fork Claude Prism. Your existing Research Hub architecture is already more suitable for your use case. Instead:

1. **Adopt Pattern 2 (Skills)** — Create domain skill templates for fee analysis topics
2. **Consider Pattern 3 (Multi-tab)** — If you want parallel research sessions
3. **Skip Pattern 1 (Diffs)** — Overkill for article editing; your draft review workflow is simpler and better

The highest-impact improvement to your Research Hub isn't from Prism — it's from the Content Studio and export features you just built, plus the model optimization plan you saved for later.
