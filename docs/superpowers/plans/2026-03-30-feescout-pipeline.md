# FeeScout Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port FeeScout v7 (Claude artifact) into feeschedule-hub as a server-side pipeline with SSE streaming at `/admin/scout`.

**Architecture:** 4-agent sequential pipeline (Scout, Classifier, Extractor, Analyst) running server-side behind a POST endpoint that streams SSE events. Client reads the stream via `fetch()` + `ReadableStream` and dispatches to a `useReducer` state machine ported from v7. DB queries use the existing `sql` postgres connection. Analyst uses `@anthropic-ai/sdk` directly.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `postgres` (existing), `@anthropic-ai/sdk` (new), Tailwind v4, SSE via ReadableStream.

**Spec:** `docs/superpowers/specs/2026-03-30-feescout-pipeline-design.md`
**Source artifact:** `/Users/jgmbp/Downloads/feescout-v7.jsx`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/scout/types.ts` | Create | TypeScript interfaces: SSEEvent, AgentId, AgentStatus, MappedFee, FeeReport, ScoutResult, ClassifierResult, ExtractorResult |
| `src/lib/scout/db.ts` | Create | 4 DB query functions using existing `sql` from crawler-db/connection.ts |
| `src/lib/scout/agents.ts` | Create | 4 agent functions + helpers (normCategory, formatAmount) |
| `src/app/api/scout/pipeline/route.ts` | Create | POST handler: orchestrator + SSE streaming |
| `src/app/api/scout/institutions/route.ts` | Create | GET handler: autocomplete search |
| `src/components/scout/FeeScout.tsx` | Create | Client component: full UI ported from v7 (search, AgentCard, ScoreRing, FeeTable, Report) |
| `src/app/admin/scout/page.tsx` | Create | Server component shell rendering FeeScout |
| `src/app/admin/admin-nav.tsx` | Modify | Add "Scout" nav item under Research group |
| `package.json` | Modify | Add `@anthropic-ai/sdk` dependency |

---

### Task 0: Install dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @anthropic-ai/sdk**

```bash
cd /Users/jgmbp/Desktop/feeschedule-hub && npm install @anthropic-ai/sdk
```

Expected: Package added to package.json dependencies, lockfile updated.

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@anthropic-ai/sdk'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk for FeeScout pipeline"
```

---

### Task 1: Types

**Files:**
- Create: `src/lib/scout/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/lib/scout/types.ts

export type AgentId = "scout" | "classifier" | "extractor" | "analyst";
export type AgentStatus = "idle" | "running" | "ok" | "warn" | "error";

export interface SSEEvent {
  type: "log" | "agent" | "report" | "done" | "error";
  agentId?: AgentId;
  status?: AgentStatus;
  durationMs?: number;
  msg?: string;
  report?: FeeReport;
  success?: boolean;
}

export interface MappedFee {
  category: string;
  name: string;
  amount: string;
  conditions: string;
  waivable: boolean;
  waiver: string;
  review_status?: string | null;
  confidence?: number | null;
}

export interface FeeReport {
  institution: string;
  institution_meta: {
    asset_size_tier: string | null;
    charter_type: string | null;
    state: string | null;
    fed_district: number | null;
    cbsa_name: string | null;
    last_crawl_at: string | null;
  };
  data_quality: "excellent" | "good" | "partial" | "limited";
  source_summary: {
    url: string | null;
    type: string;
    access: string;
    as_of: string;
  };
  consumer_score: {
    score: number;
    label: string;
    rationale: string;
  };
  peer_context: string;
  highlights: string[];
  warnings: string[];
  fee_categories: Record<string, MappedFee[]>;
  tips: string[];
  verdict: string;
}

// DB row types — match the postgres table schemas
export interface InstitutionRow {
  id: number;
  institution_name: string;
  website_url: string | null;
  fee_schedule_url: string | null;
  charter_type: string | null;
  state: string | null;
  state_code: string | null;
  city: string | null;
  asset_size: number | null;
  asset_size_tier: string | null;
  cert_number: string | null;
  status: string | null;
  document_type: string | null;
  last_crawl_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  fed_district: number | null;
  cbsa_name: string | null;
}

export interface ExtractedFeeRow {
  id: number;
  crawl_target_id: number;
  fee_name: string;
  fee_category: string | null;
  amount: number | null;
  frequency: string | null;
  conditions: string | null;
  extraction_confidence: number | null;
  review_status: string | null;
  fee_family: string | null;
  source: string | null;
}

export interface CrawlResultRow {
  id: number;
  crawl_target_id: number;
  status: string;
  document_url: string | null;
  document_path: string | null;
  fees_extracted: number;
  error_message: string | null;
  crawled_at: string | null;
}

export interface ScoutResult {
  found: boolean;
  institution: InstitutionRow;
  allTargets: InstitutionRow[];
  fees: ExtractedFeeRow[];
  crawlResults: CrawlResultRow[];
  primaryDocUrl: string | null;
}

export interface ClassifierResult {
  availability: "high" | "medium" | "low";
  feeCount: number;
  approvedCount: number;
  stagedCount: number;
  categories: string[];
  hasAmounts: number;
  latestCrawlStatus: string;
  latestCrawlDate: string | null;
  documentUrl: string | null;
  consecutiveFailures: number;
}

export interface ExtractorResult {
  fees: MappedFee[];
  confidence: number;
  sourceType: string;
  knowledgeDate: string;
  rawCount: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/scout/types.ts 2>&1 | head -20
```

Expected: No errors (or only unrelated project errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/scout/types.ts
git commit -m "feat(scout): add TypeScript types for FeeScout pipeline"
```

---

### Task 2: Database queries

**Files:**
- Create: `src/lib/scout/db.ts`

- [ ] **Step 1: Create db.ts**

```typescript
// src/lib/scout/db.ts

import { sql } from "@/lib/crawler-db/connection";
import type { InstitutionRow, ExtractedFeeRow, CrawlResultRow } from "./types";

export async function searchInstitutions(
  query: string
): Promise<InstitutionRow[]> {
  const pattern = `%${query}%`;
  const rows = await sql<InstitutionRow[]>`
    SELECT * FROM crawl_targets
    WHERE institution_name ILIKE ${pattern}
      AND status = 'active'
    ORDER BY asset_size DESC NULLS LAST
    LIMIT 10
  `;
  return rows;
}

export async function getExtractedFees(
  crawlTargetId: number
): Promise<ExtractedFeeRow[]> {
  const rows = await sql<ExtractedFeeRow[]>`
    SELECT * FROM extracted_fees
    WHERE crawl_target_id = ${crawlTargetId}
    ORDER BY fee_category
    LIMIT 500
  `;
  return rows;
}

export async function getCrawlResults(
  crawlTargetId: number
): Promise<CrawlResultRow[]> {
  const rows = await sql<CrawlResultRow[]>`
    SELECT * FROM crawl_results
    WHERE crawl_target_id = ${crawlTargetId}
    ORDER BY id DESC
    LIMIT 10
  `;
  return rows;
}

export async function autocompleteInstitutions(query: string) {
  const pattern = `%${query}%`;
  const rows = await sql<
    { id: number; institution_name: string; state_code: string | null; asset_size_tier: string | null }[]
  >`
    SELECT id, institution_name, state_code, asset_size_tier
    FROM crawl_targets
    WHERE institution_name ILIKE ${pattern}
      AND status = 'active'
    ORDER BY asset_size DESC NULLS LAST
    LIMIT 8
  `;
  return rows;
}
```

- [ ] **Step 2: Verify import resolves**

```bash
cd /Users/jgmbp/Desktop/feeschedule-hub && npx tsc --noEmit src/lib/scout/db.ts 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scout/db.ts
git commit -m "feat(scout): add database query helpers for FeeScout pipeline"
```

---

### Task 3: Agent functions

**Files:**
- Create: `src/lib/scout/agents.ts`

- [ ] **Step 1: Create agents.ts**

Port the 4 agent functions from feescout-v7.jsx. The key changes from v7:
- `callClaude()` uses `@anthropic-ai/sdk` instead of browser `fetch()`
- `normCategory()` and `formatAmount()` are identical to v7
- `emit` callback type is `(msg: string) => void` (synchronous, not async — SSE encoding happens in the route)

```typescript
// src/lib/scout/agents.ts

import Anthropic from "@anthropic-ai/sdk";
import type {
  InstitutionRow,
  ExtractedFeeRow,
  CrawlResultRow,
  MappedFee,
  FeeReport,
  ScoutResult,
  ClassifierResult,
  ExtractorResult,
} from "./types";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Emit = (msg: string) => void;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normCategory(raw: string | null): string {
  if (!raw) return "other";
  const r = raw.toLowerCase();
  if (r.includes("overdraft") || r.includes("nsf") || r.includes("insufficient")) return "overdraft_nsf";
  if (r.includes("maintenance") || r.includes("monthly") || r.includes("account")) return "account_maintenance";
  if (r.includes("atm") || r.includes("cash")) return "atm";
  if (r.includes("wire") || r.includes("transfer")) return "wire";
  if (r.includes("card") || r.includes("debit")) return "card";
  if (r.includes("foreign") || r.includes("international") || r.includes("fx")) return "foreign";
  return "other";
}

function formatAmount(n: number | null): string {
  if (n === null || n === undefined) return "varies";
  if (n === 0) return "Free";
  if (n < 0) return "varies";
  return `$${n.toFixed(2)}`;
}

// ── Agent 1: Scout ───────────────────────────────────────────────────────────

export function scout(
  institution: InstitutionRow,
  allTargets: InstitutionRow[],
  fees: ExtractedFeeRow[],
  crawlResults: CrawlResultRow[],
  emit: Emit
): ScoutResult {
  emit(`Matched: ${institution.institution_name}`);
  emit(
    `Asset tier: ${institution.asset_size_tier || "unknown"} | State: ${institution.state_code || "unknown"} | District: ${institution.fed_district || "unknown"}`
  );
  emit(`${fees.length} fee records | ${crawlResults.length} crawl records`);

  const successfulCrawl = crawlResults.find(
    (r) => r.status === "success" && r.document_url
  );
  if (successfulCrawl) {
    emit(`Source document: ${successfulCrawl.document_url}`);
  } else {
    emit("No successful crawl on record");
  }

  if (allTargets.length > 1) {
    emit(
      `Note: ${allTargets.length - 1} other match(es) in database — using largest by assets`
    );
  }

  return {
    found: true,
    institution,
    allTargets,
    fees,
    crawlResults,
    primaryDocUrl: successfulCrawl?.document_url || null,
  };
}

// ── Agent 2: Classifier ──────────────────────────────────────────────────────

export function classifier(
  scoutResult: ScoutResult,
  emit: Emit
): ClassifierResult {
  const { fees, crawlResults, institution } = scoutResult;

  const approvedCount = fees.filter((f) => f.review_status === "approved").length;
  const stagedCount = fees.filter((f) => f.review_status === "staged").length;
  const hasAmounts = fees.filter((f) => f.amount != null).length;
  const categories = [
    ...new Set(fees.map((f) => f.fee_category).filter(Boolean)),
  ] as string[];
  const latestCrawl = crawlResults[0];

  let availability: "high" | "medium" | "low" = "low";
  if (fees.length >= 10 && hasAmounts >= 5) availability = "high";
  else if (fees.length >= 3) availability = "medium";

  emit(
    `Availability: ${availability} | ${fees.length} records (${approvedCount} approved, ${stagedCount} staged)`
  );
  emit(
    `Categories found: ${categories.length > 0 ? categories.join(", ") : "none"}`
  );
  emit(
    `Latest crawl: ${latestCrawl?.status || "never"} | Consecutive failures: ${institution.consecutive_failures}`
  );

  if (institution.consecutive_failures > 3) {
    emit(
      `${institution.consecutive_failures} consecutive crawl failures — data may be stale`
    );
  }

  return {
    availability,
    feeCount: fees.length,
    approvedCount,
    stagedCount,
    hasAmounts,
    categories,
    latestCrawlStatus: latestCrawl?.status || "unknown",
    latestCrawlDate: latestCrawl?.crawled_at || null,
    documentUrl: scoutResult.primaryDocUrl,
    consecutiveFailures: institution.consecutive_failures,
  };
}

// ── Agent 3: Extractor ───────────────────────────────────────────────────────

export function extractor(
  scoutResult: ScoutResult,
  classifierResult: ClassifierResult,
  emit: Emit
): ExtractorResult {
  const { fees } = scoutResult;

  if (!fees.length) {
    emit("No fee records in database for this institution");
    return {
      fees: [],
      confidence: 0,
      sourceType: "none",
      knowledgeDate: "unknown",
      rawCount: 0,
    };
  }

  const mapped: MappedFee[] = fees.map((f) => ({
    category: normCategory(f.fee_category),
    name: f.fee_name || "Unnamed fee",
    amount: formatAmount(f.amount),
    conditions:
      f.conditions || (f.frequency ? `Frequency: ${f.frequency}` : ""),
    waivable: false,
    waiver: "",
    review_status: f.review_status,
    confidence: f.extraction_confidence,
  }));

  const knowledgeDate = scoutResult.crawlResults.find(
    (r) => r.status === "success"
  )?.crawled_at
    ? new Date(
        scoutResult.crawlResults.find((r) => r.status === "success")!.crawled_at!
      ).toLocaleDateString("en-US", { year: "numeric", month: "short" })
    : "unknown";

  const confidence =
    fees.length >= 10 ? 0.95 : fees.length >= 5 ? 0.8 : 0.6;

  emit(
    `Structured ${mapped.length} fee records | confidence ${Math.round(confidence * 100)}%`
  );
  emit(`Data as of: ${knowledgeDate}`);

  return {
    fees: mapped,
    confidence,
    sourceType: "database",
    knowledgeDate,
    rawCount: fees.length,
  };
}

// ── Agent 4: Analyst ─────────────────────────────────────────────────────────

export async function analyst(
  scoutResult: ScoutResult,
  classifierResult: ClassifierResult,
  extractorResult: ExtractorResult,
  emit: Emit
): Promise<FeeReport> {
  emit(
    `Synthesising report — ${extractorResult.fees.length} fees | confidence ${Math.round(extractorResult.confidence * 100)}%`
  );
  emit("Sending to Claude Sonnet...");

  const payload = {
    institution_name: scoutResult.institution.institution_name,
    charter_type: scoutResult.institution.charter_type,
    asset_size_tier: scoutResult.institution.asset_size_tier,
    state: scoutResult.institution.state,
    fed_district: scoutResult.institution.fed_district,
    cbsa_name: scoutResult.institution.cbsa_name,
    data_availability: classifierResult.availability,
    approved_fees: classifierResult.approvedCount,
    staged_fees: classifierResult.stagedCount,
    consecutive_failures: classifierResult.consecutiveFailures,
    fees: extractorResult.fees.map((f) => ({
      category: f.category,
      name: f.name,
      amount: f.amount,
      conditions: f.conditions,
    })),
    knowledge_date: extractorResult.knowledgeDate,
    source_url: scoutResult.primaryDocUrl,
  };

  const system = `You are the Analyst for Bank Fee Index, a professional financial intelligence platform.
Produce a precise, evidence-based fee intelligence report. Reference specific fees and amounts.
Audience: bank executives, consultants, compliance officers, fintechs.

Consumer score rubric (1-10, 10 = most consumer-friendly):
- 8-10: Low/no fees, fee-competitive institution
- 5-7: Market average fee structure
- 1-4: Above-market, fee-heavy institution

Return ONLY raw JSON (no markdown fences):
{
  "data_quality": "excellent|good|partial|limited",
  "consumer_score": { "score": 6, "label": "Average", "rationale": "2 sentences citing specific fees." },
  "peer_context": "1-2 sentences comparing this institution to peers in same tier/charter.",
  "highlights": ["up to 3 specific positives with dollar amounts"],
  "warnings":   ["up to 3 specific concerns with dollar amounts"],
  "tips":       ["up to 3 actionable tips referencing real fees"],
  "verdict":    "2-3 sentence professional verdict citing specific fee data."
}

Only reference fees provided. Do not invent data.`;

  const response = await claude.messages.create(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    },
    { timeout: 30_000 }
  );

  emit("Response received — building report...");

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Extract JSON from response
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const s = src.indexOf("{");
  const e = src.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("Analyst could not produce structured JSON");
  const parsed = JSON.parse(src.slice(s, e + 1));

  // Build fee_categories from Extractor's mapped fees (not Claude's)
  const cats: Record<string, MappedFee[]> = {
    account_maintenance: [],
    overdraft_nsf: [],
    atm: [],
    wire: [],
    card: [],
    foreign: [],
    other: [],
  };
  extractorResult.fees.forEach((f) => {
    const cat = f.category;
    if (cats[cat]) cats[cat].push(f);
    else cats.other.push(f);
  });

  emit(
    `Complete — quality: ${parsed.data_quality} | score: ${parsed.consumer_score?.score}/10`
  );

  return {
    institution: scoutResult.institution.institution_name,
    institution_meta: {
      asset_size_tier: scoutResult.institution.asset_size_tier,
      charter_type: scoutResult.institution.charter_type,
      state: scoutResult.institution.state,
      fed_district: scoutResult.institution.fed_district,
      cbsa_name: scoutResult.institution.cbsa_name,
      last_crawl_at: scoutResult.institution.last_crawl_at,
    },
    data_quality: parsed.data_quality,
    source_summary: {
      url: scoutResult.primaryDocUrl,
      type: "database",
      access: "verified",
      as_of: extractorResult.knowledgeDate,
    },
    consumer_score: parsed.consumer_score,
    peer_context: parsed.peer_context,
    highlights: parsed.highlights || [],
    warnings: parsed.warnings || [],
    fee_categories: cats,
    tips: parsed.tips || [],
    verdict: parsed.verdict || "",
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/lib/scout/agents.ts 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scout/agents.ts
git commit -m "feat(scout): add 4 pipeline agents — Scout, Classifier, Extractor, Analyst"
```

---

### Task 4: SSE pipeline route

**Files:**
- Create: `src/app/api/scout/pipeline/route.ts`

- [ ] **Step 1: Create the pipeline route**

```typescript
// src/app/api/scout/pipeline/route.ts

import { NextRequest } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { searchInstitutions, getExtractedFees, getCrawlResults } from "@/lib/scout/db";
import { scout, classifier, extractor, analyst } from "@/lib/scout/agents";
import type { SSEEvent, AgentId } from "@/lib/scout/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "research")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = await req.json();
  const query = body.query?.trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "query required" }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      const log =
        (agentId: AgentId) =>
        (msg: string) => {
          send({ type: "log", agentId, msg });
        };

      const startAgent = (id: AgentId) =>
        send({ type: "agent", agentId: id, status: "running" });

      const doneAgent = (id: AgentId, ok: boolean, ms: number) =>
        send({
          type: "agent",
          agentId: id,
          status: ok ? "ok" : "warn",
          durationMs: ms,
        });

      try {
        // ── Scout: DB lookup ──────────────────────────────────────────────
        startAgent("scout");
        const t1 = Date.now();

        log("scout")(`Searching for "${query}"...`);
        const targets = await searchInstitutions(query);

        if (!targets.length) {
          send({
            type: "error",
            msg: `No institutions found matching "${query}"`,
          });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        const institution = targets[0];
        log("scout")(
          `Found ${targets.length} match(es) — using: ${institution.institution_name}`
        );

        const [fees, crawlResults] = await Promise.all([
          getExtractedFees(institution.id),
          getCrawlResults(institution.id),
        ]);

        const scoutResult = scout(
          institution,
          targets,
          fees,
          crawlResults,
          log("scout")
        );
        doneAgent("scout", true, Date.now() - t1);

        // ── Classifier: data quality ──────────────────────────────────────
        startAgent("classifier");
        const t2 = Date.now();
        const classifierResult = classifier(scoutResult, log("classifier"));
        doneAgent("classifier", true, Date.now() - t2);

        // ── Extractor: map DB records ─────────────────────────────────────
        startAgent("extractor");
        const t3 = Date.now();
        const extractorResult = extractor(
          scoutResult,
          classifierResult,
          log("extractor")
        );
        doneAgent(
          "extractor",
          extractorResult.fees.length > 0,
          Date.now() - t3
        );

        // ── Analyst: Claude synthesis ─────────────────────────────────────
        startAgent("analyst");
        const t4 = Date.now();
        try {
          const report = await analyst(
            scoutResult,
            classifierResult,
            extractorResult,
            log("analyst")
          );
          doneAgent("analyst", true, Date.now() - t4);
          send({ type: "report", report });
          send({ type: "done", success: true });
        } catch (analystErr) {
          const analystMsg =
            analystErr instanceof Error ? analystErr.message : String(analystErr);
          send({
            type: "agent",
            agentId: "analyst",
            status: "error",
            durationMs: Date.now() - t4,
          });
          send({
            type: "log",
            agentId: "analyst",
            msg: `Analyst error: ${analystMsg}`,
          });
          send({
            type: "error",
            msg: `Analyst failed: ${analystMsg}. Scout/Classifier/Extractor data is still available above.`,
          });
          send({ type: "done", success: false });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", msg });
        send({ type: "done", success: false });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/scout/pipeline/route.ts
git commit -m "feat(scout): add SSE pipeline streaming endpoint"
```

---

### Task 5: Autocomplete route

**Files:**
- Create: `src/app/api/scout/institutions/route.ts`

- [ ] **Step 1: Create the autocomplete route**

```typescript
// src/app/api/scout/institutions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { autocompleteInstitutions } from "@/lib/scout/db";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "research")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  try {
    const results = await autocompleteInstitutions(q);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/scout/institutions/route.ts
git commit -m "feat(scout): add institution autocomplete API route"
```

---

### Task 6: UI component

**Files:**
- Create: `src/components/scout/FeeScout.tsx`

This is the largest file — the full client component ported from feescout-v7.jsx. Key adaptations from v7:

1. Replace Google Fonts with Geist (already loaded via admin layout)
2. Replace inline `B` brand object with Tailwind classes matching admin design system
3. Replace `runPipeline()` (direct execution) with `fetch("/api/scout/pipeline")` + stream reader
4. Keep the `useReducer` state machine identical to v7
5. Add autocomplete dropdown calling `/api/scout/institutions`

- [ ] **Step 1: Create FeeScout.tsx**

Port the full UI from `/Users/jgmbp/Downloads/feescout-v7.jsx`. The source file has the complete working code. Key translation rules:

**State machine** — copy verbatim from v7 (lines 284-365). The types, action creators, `mkAgent()`, `mkState()`, `reducer()` are pure JS that just needs TS annotations added. The `AIDS` array becomes `const AGENT_IDS: AgentId[] = ["scout", "classifier", "extractor", "analyst"]`.

**AgentCard** — port from v7 lines 409-587. Replace inline `style={{}}` with Tailwind equivalents:
- `B.terra` (#c44a2a) -> use inline `text-[#c44a2a]` or closest Tailwind red
- `B.green` (#2d7a5f) -> `text-emerald-700`
- `B.amber` (#9a6c1a) -> `text-amber-700`
- `B.charcoal` (#1f1a17) -> `text-gray-900`
- `B.gray` (#7a7570) -> `text-gray-500`
- `B.grayLight` (#b5b0ab) -> `text-gray-400`
- `B.surface` (#faf8f4) -> `bg-gray-50`
- `B.white` -> `bg-white`
- `B.border` (#ddd9d0) -> `border-gray-200`
- `B.sans` -> `font-sans` (Geist loaded by admin layout)
- `B.mono` -> `font-mono`
- `B.serif` -> `font-serif` (for report heading only)

**ScoreRing** — port from v7 lines 591-616 as-is. SVG with inline styles is fine here — no Tailwind benefit for SVG circle math.

**FeeTable** — port from v7 lines 619-653. Use admin table classes: `text-[11px] font-semibold text-gray-400 uppercase tracking-wider` for headers, `hover:bg-gray-50/50` for rows.

**Report** — port from v7 lines 656-741. Use `admin-card` class pattern: `bg-white border border-gray-200 rounded-lg` for cards.

**FeeScout main component** — port from v7 lines 745-851. Replace `runPipeline()` direct call with the SSE fetch function below. Add autocomplete dropdown that calls `/api/scout/institutions?q=...` with debounced fetch.

**Animations** — add these keyframes to the component or a local style tag:
```css
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes blink { 0%,100%{opacity:.15} 50%{opacity:1} }
@keyframes fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1} }
```

The SSE client logic replaces v7's direct `runPipeline()` call:

```typescript
async function runPipeline(query: string, dispatch: React.Dispatch<Action>) {
  dispatch({ type: "RESET" });
  dispatch({ type: "STATUS", val: "running" });

  try {
    const res = await fetch("/api/scout/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok || !res.body) {
      dispatch({ type: "PIPELINE_ERROR", msg: `Pipeline error: ${res.status}` });
      dispatch({ type: "STATUS", val: "error" });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6));

        switch (event.type) {
          case "agent":
            if (event.status === "running") {
              dispatch({ type: "AGENT_START", id: event.agentId });
            } else {
              dispatch({
                type: "AGENT_DONE",
                id: event.agentId,
                ok: event.status === "ok",
                data: null,
                ms: event.durationMs,
              });
            }
            break;
          case "log":
            dispatch({ type: "LOG", agentId: event.agentId, msg: event.msg });
            break;
          case "report":
            dispatch({ type: "REPORT", report: event.report });
            break;
          case "error":
            dispatch({ type: "PIPELINE_ERROR", msg: event.msg });
            break;
          case "done":
            dispatch({ type: "STATUS", val: event.success ? "done" : "error" });
            break;
        }
      }
    }
  } catch (err) {
    dispatch({
      type: "PIPELINE_ERROR",
      msg: err instanceof Error ? err.message : String(err),
    });
    dispatch({ type: "STATUS", val: "error" });
  }
}
```

For styling, adapt v7's inline styles to use:
- `font-sans` (Geist Sans via admin layout)
- `font-mono` for code/numbers
- Admin design tokens: `text-gray-900`, `text-gray-400`, `bg-gray-50/80`, `bg-emerald-50`, `text-emerald-600`, `bg-amber-50`, `text-amber-600`, `bg-red-50`, `text-red-600`
- Admin card pattern: `bg-white border border-gray-200 rounded-lg shadow-xs`
- Table pattern: `text-[11px] font-semibold text-gray-400 uppercase tracking-wider` for headers

Reference the v7 artifact at `/Users/jgmbp/Downloads/feescout-v7.jsx` for the complete component code to port.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit src/components/scout/FeeScout.tsx 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/scout/FeeScout.tsx
git commit -m "feat(scout): add FeeScout client component with SSE stream reader"
```

---

### Task 7: Admin page + nav entry

**Files:**
- Create: `src/app/admin/scout/page.tsx`
- Modify: `src/app/admin/admin-nav.tsx` (lines 146-158, Research group)

- [ ] **Step 1: Create the admin page**

```typescript
// src/app/admin/scout/page.tsx

import FeeScout from "@/components/scout/FeeScout";

export const metadata = {
  title: "FeeScout - Bank Fee Index",
};

export default function ScoutPage() {
  return <FeeScout />;
}
```

- [ ] **Step 2: Add Scout to admin nav**

In `src/app/admin/admin-nav.tsx`, add a new nav item in the Research group (after "Research Hub", before "Leads"):

```typescript
// Add after the Research Hub item (line 158) and before the Leads item (line 159):
      {
        href: "/admin/scout",
        label: "Scout",
        icon: (
          <svg className={ICON_CLASS} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
        ),
      },
```

- [ ] **Step 3: Test locally**

```bash
npm run dev
```

Then visit `http://localhost:3000/admin/scout` in a browser. Verify:
- Page loads without errors
- Search input renders
- "Scout" appears in admin nav sidebar under Research
- Typing a query and clicking "Run Analysis" starts the pipeline
- SSE events stream and update the UI
- Final report renders

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/scout/page.tsx src/app/admin/admin-nav.tsx
git commit -m "feat(scout): add admin page and nav entry for FeeScout"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Run the build**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Test the full pipeline**

Start the dev server and test with a known institution:

```bash
npm run dev
```

1. Navigate to `/admin/scout`
2. Search for "Chase" (or any institution in your DB)
3. Verify all 4 agent cards show progress
4. Verify the final report renders with score, verdict, fee table
5. Try an institution that doesn't exist — verify error handling

- [ ] **Step 3: Final commit (if any unstaged changes remain)**

```bash
git status
# Only add files under src/lib/scout/, src/app/api/scout/, src/app/admin/scout/, src/components/scout/
git commit -m "feat(scout): FeeScout pipeline — complete implementation"
```
