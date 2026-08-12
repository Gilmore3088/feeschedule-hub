# URL Audit Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL audit mode to FeeScout that validates existing fee schedule URLs, re-discovers missing ones via heuristics (Modal endpoint), and escalates failures to AI-powered discovery.

**Architecture:** Extends FeeScout with a mode toggle (Research / Audit). Audit mode runs a 4-agent SSE pipeline: Validator fetches and checks existing URLs, Discoverer calls a Modal web endpoint that wraps the Python UrlDiscoverer, AI Scout sends homepage links to Claude for intelligent URL identification, and Reporter summarizes changes. Results tracked in two new DB tables.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `postgres`, `@anthropic-ai/sdk`, Modal (Python), SSE via ReadableStream.

**Spec:** `docs/superpowers/specs/2026-03-30-url-audit-pipeline-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/scout/audit-types.ts` | Create | Audit-specific types: AuditAgentId, AuditSSEEvent, AuditResult, BatchSummary |
| `src/lib/scout/audit-db.ts` | Create | DB queries for audit: create tables, insert audit runs/results, get institutions by scope |
| `src/lib/scout/audit-agents.ts` | Create | 4 audit agents: Validator, Discoverer, AI Scout, Reporter |
| `src/app/api/scout/audit/route.ts` | Create | POST: single-institution audit SSE stream |
| `src/app/api/scout/audit-batch/route.ts` | Create | POST: batch audit SSE stream (state/district) |
| `src/components/scout/FeeScout.tsx` | Modify | Add mode toggle (Research/Audit), audit UI, batch scope selector |
| `fee_crawler/modal_app.py` | Modify | Add `@modal.web_endpoint` for single-institution URL discovery |
| `fee_crawler/pipeline/url_discoverer.py` | Read-only | Existing discovery logic called via Modal endpoint |

---

### Task 0: Database tables for audit tracking

**Files:**
- Create: `src/lib/scout/audit-db.ts`

- [ ] **Step 1: Create audit-db.ts with table creation and query functions**

```typescript
// src/lib/scout/audit-db.ts

import { sql } from "@/lib/crawler-db/connection";
import type { InstitutionRow } from "./types";

export async function ensureAuditTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS url_audit_runs (
      id SERIAL PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_value TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      total_institutions INTEGER DEFAULT 0,
      urls_validated INTEGER DEFAULT 0,
      urls_cleared INTEGER DEFAULT 0,
      urls_discovered INTEGER DEFAULT 0,
      urls_ai_found INTEGER DEFAULT 0,
      still_missing INTEGER DEFAULT 0,
      ai_cost_cents INTEGER DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS url_audit_results (
      id SERIAL PRIMARY KEY,
      audit_run_id INTEGER REFERENCES url_audit_runs(id),
      crawl_target_id INTEGER NOT NULL,
      url_before TEXT,
      url_after TEXT,
      action TEXT NOT NULL,
      discovery_method TEXT,
      confidence REAL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_results_run_id
    ON url_audit_results(audit_run_id)
  `;
}

export async function createAuditRun(
  scopeType: string,
  scopeValue: string | null,
  totalInstitutions: number
): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO url_audit_runs (scope_type, scope_value, total_institutions)
    VALUES (${scopeType}, ${scopeValue}, ${totalInstitutions})
    RETURNING id
  `;
  return row.id;
}

export async function recordAuditResult(
  auditRunId: number,
  crawlTargetId: number,
  urlBefore: string | null,
  urlAfter: string | null,
  action: string,
  discoveryMethod: string | null,
  confidence: number | null,
  reason: string | null
) {
  await sql`
    INSERT INTO url_audit_results
      (audit_run_id, crawl_target_id, url_before, url_after, action, discovery_method, confidence, reason)
    VALUES
      (${auditRunId}, ${crawlTargetId}, ${urlBefore}, ${urlAfter}, ${action}, ${discoveryMethod}, ${confidence}, ${reason})
  `;
}

export async function updateAuditRunStats(
  auditRunId: number,
  stats: {
    urls_validated?: number;
    urls_cleared?: number;
    urls_discovered?: number;
    urls_ai_found?: number;
    still_missing?: number;
    ai_cost_cents?: number;
  }
) {
  await sql`
    UPDATE url_audit_runs SET
      urls_validated = ${stats.urls_validated ?? 0},
      urls_cleared = ${stats.urls_cleared ?? 0},
      urls_discovered = ${stats.urls_discovered ?? 0},
      urls_ai_found = ${stats.urls_ai_found ?? 0},
      still_missing = ${stats.still_missing ?? 0},
      ai_cost_cents = ${stats.ai_cost_cents ?? 0},
      completed_at = NOW()
    WHERE id = ${auditRunId}
  `;
}

export async function clearFeeScheduleUrl(
  crawlTargetId: number
) {
  await sql`
    UPDATE crawl_targets
    SET fee_schedule_url = NULL
    WHERE id = ${crawlTargetId}
  `;
}

export async function setFeeScheduleUrl(
  crawlTargetId: number,
  url: string,
  documentType: string | null
) {
  await sql`
    UPDATE crawl_targets
    SET fee_schedule_url = ${url},
        document_type = ${documentType}
    WHERE id = ${crawlTargetId}
  `;
}

export async function getInstitutionsByScope(
  scopeType: string,
  scopeValue: string
): Promise<InstitutionRow[]> {
  if (scopeType === "state") {
    return sql<InstitutionRow[]>`
      SELECT * FROM crawl_targets
      WHERE status = 'active' AND state_code = ${scopeValue}
      ORDER BY asset_size DESC NULLS LAST
    `;
  }
  if (scopeType === "district") {
    return sql<InstitutionRow[]>`
      SELECT * FROM crawl_targets
      WHERE status = 'active' AND fed_district = ${Number(scopeValue)}
      ORDER BY asset_size DESC NULLS LAST
    `;
  }
  return [];
}

export async function getInstitutionById(
  id: number
): Promise<InstitutionRow | null> {
  const [row] = await sql<InstitutionRow[]>`
    SELECT * FROM crawl_targets WHERE id = ${id}
  `;
  return row || null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/scout/audit-db.ts
git commit -m "feat(scout): add audit DB tables and query helpers"
```

---

### Task 1: Audit types

**Files:**
- Create: `src/lib/scout/audit-types.ts`

- [ ] **Step 1: Create audit-types.ts**

```typescript
// src/lib/scout/audit-types.ts

export type AuditAgentId = "validator" | "discoverer" | "ai_scout" | "reporter";
export type AuditAgentStatus = "idle" | "running" | "ok" | "warn" | "error";

export interface AuditSSEEvent {
  type: "log" | "agent" | "result" | "batch_progress" | "batch_summary" | "done" | "error";
  agentId?: AuditAgentId;
  status?: AuditAgentStatus;
  durationMs?: number;
  msg?: string;
  result?: AuditResult;
  batchProgress?: { current: number; total: number; institution: string };
  batchSummary?: BatchSummary;
  success?: boolean;
}

export interface AuditResult {
  institutionId: number;
  institutionName: string;
  urlBefore: string | null;
  urlAfter: string | null;
  action: "validated" | "cleared" | "discovered" | "ai_found" | "not_found";
  discoveryMethod: string | null;
  confidence: number | null;
  reason: string | null;
}

export interface BatchSummary {
  total: number;
  validated: number;
  cleared: number;
  discovered: number;
  aiFound: number;
  stillMissing: number;
  aiCostCents: number;
}

export interface DiscoveryResponse {
  found: boolean;
  fee_schedule_url: string | null;
  document_type: string | null;
  method: string | null;
  confidence: number;
  pages_checked: number;
  error: string | null;
  methods_tried: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/scout/audit-types.ts
git commit -m "feat(scout): add audit pipeline TypeScript types"
```

---

### Task 2: Modal web endpoint for Python discovery

**Files:**
- Modify: `fee_crawler/modal_app.py`

- [ ] **Step 1: Add a web endpoint to modal_app.py**

Read `fee_crawler/modal_app.py` first. Add a new function at the end of the file (before any `if __name__` block):

```python
@app.function(secrets=secrets, timeout=120)
@modal.web_endpoint(method="POST")
def discover_url(item: dict) -> dict:
    """HTTP endpoint for single-institution URL discovery.
    
    Accepts: {"website_url": "https://...", "institution_id": 123}
    Returns: DiscoveryResult as dict
    """
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer
    from fee_crawler.config import Config

    website_url = item.get("website_url")
    if not website_url:
        return {"found": False, "error": "website_url required"}

    config = Config()
    discoverer = UrlDiscoverer(config)
    result = discoverer.discover(website_url)

    return {
        "found": result.found,
        "fee_schedule_url": result.fee_schedule_url,
        "document_type": result.document_type,
        "method": result.method,
        "confidence": result.confidence,
        "pages_checked": result.pages_checked,
        "error": result.error,
        "methods_tried": result.methods_tried,
    }
```

- [ ] **Step 2: Deploy Modal update**

```bash
cd /Users/jgmbp/Desktop/feeschedule-hub && modal deploy fee_crawler/modal_app.py
```

Note the endpoint URL from the output (e.g., `https://your-org--bank-fee-index-workers-discover-url.modal.run`).

- [ ] **Step 3: Add the endpoint URL to .env**

```bash
# Add to .env.local
MODAL_DISCOVER_URL=https://your-org--bank-fee-index-workers-discover-url.modal.run
```

- [ ] **Step 4: Commit**

```bash
git add fee_crawler/modal_app.py
git commit -m "feat(scout): add Modal web endpoint for URL discovery"
```

---

### Task 3: Audit agents

**Files:**
- Create: `src/lib/scout/audit-agents.ts`

- [ ] **Step 1: Create audit-agents.ts**

```typescript
// src/lib/scout/audit-agents.ts

import Anthropic from "@anthropic-ai/sdk";
import type { InstitutionRow } from "./types";
import type { AuditResult, DiscoveryResponse } from "./audit-types";
import {
  clearFeeScheduleUrl,
  setFeeScheduleUrl,
  recordAuditResult,
} from "./audit-db";

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Emit = (msg: string) => void;

const FEE_CONTENT_KEYWORDS = [
  "monthly maintenance fee",
  "overdraft fee",
  "nsf fee",
  "insufficient funds",
  "atm fee",
  "wire transfer fee",
  "service charge",
  "account fee",
  "statement fee",
  "dormant",
  "inactivity fee",
  "stop payment",
  "returned item",
  "foreign transaction",
];

const NON_FEE_URL_KEYWORDS = [
  "annual-report",
  "cra",
  "complaint",
  "privacy",
  "loan",
  "mortgage",
  "career",
  "job",
  "social-media",
  "donation",
  "enrollment",
  "payroll",
];

// ── Agent 1: Validator ───────────────────────────────────────────────────────

export async function validator(
  institution: InstitutionRow,
  auditRunId: number,
  emit: Emit
): Promise<AuditResult> {
  const urlBefore = institution.fee_schedule_url;

  if (!urlBefore) {
    emit("No fee_schedule_url set — skipping validation");
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: "No URL to validate",
    };
  }

  emit(`Checking: ${urlBefore}`);

  // Check for obviously wrong URLs by path keywords
  const urlLower = urlBefore.toLowerCase();
  const badKeyword = NON_FEE_URL_KEYWORDS.find((kw) => urlLower.includes(kw));
  if (badKeyword) {
    emit(`URL contains non-fee keyword "${badKeyword}" — clearing`);
    await clearFeeScheduleUrl(institution.id);
    await recordAuditResult(
      auditRunId,
      institution.id,
      urlBefore,
      null,
      "cleared",
      null,
      null,
      `URL path contains "${badKeyword}"`
    );
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore,
      urlAfter: null,
      action: "cleared",
      discoveryMethod: null,
      confidence: null,
      reason: `URL path contains "${badKeyword}"`,
    };
  }

  // Fetch the page and check content
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(urlBefore, {
      signal: controller.signal,
      headers: { "User-Agent": "BankFeeIndex/1.0 (fee-schedule-audit)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      emit(`HTTP ${res.status} — clearing dead URL`);
      await clearFeeScheduleUrl(institution.id);
      await recordAuditResult(
        auditRunId,
        institution.id,
        urlBefore,
        null,
        "cleared",
        null,
        null,
        `HTTP ${res.status}`
      );
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore,
        urlAfter: null,
        action: "cleared",
        discoveryMethod: null,
        confidence: null,
        reason: `HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get("content-type") || "";

    // PDFs: trust if URL path suggests fee schedule
    if (contentType.includes("application/pdf") || urlBefore.toLowerCase().endsWith(".pdf")) {
      const hasFeeKeyword = /fee|schedule|disclosure|truth.in.savings|reg.dd/i.test(urlBefore);
      if (hasFeeKeyword) {
        emit("PDF URL looks valid (fee-related path)");
        await recordAuditResult(auditRunId, institution.id, urlBefore, urlBefore, "validated", null, 0.9, "PDF with fee-related path");
        return {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore,
          urlAfter: urlBefore,
          action: "validated",
          discoveryMethod: null,
          confidence: 0.9,
          reason: "PDF with fee-related path",
        };
      }
      emit("PDF URL has no fee keywords in path — clearing");
      await clearFeeScheduleUrl(institution.id);
      await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, "PDF without fee keywords");
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore,
        urlAfter: null,
        action: "cleared",
        discoveryMethod: null,
        confidence: null,
        reason: "PDF without fee keywords",
      };
    }

    // HTML: check content for 2+ fee keywords
    if (contentType.includes("text/html")) {
      const text = await res.text();
      const lower = text.toLowerCase();
      const matches = FEE_CONTENT_KEYWORDS.filter((kw) => lower.includes(kw)).length;

      if (matches >= 2) {
        emit(`Valid — ${matches} fee keywords found in content`);
        await recordAuditResult(auditRunId, institution.id, urlBefore, urlBefore, "validated", null, 0.85, `${matches} fee keywords found`);
        return {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore,
          urlAfter: urlBefore,
          action: "validated",
          discoveryMethod: null,
          confidence: 0.85,
          reason: `${matches} fee keywords found`,
        };
      }

      emit(`Only ${matches} fee keyword(s) — clearing`);
      await clearFeeScheduleUrl(institution.id);
      await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, `Only ${matches} fee keyword(s)`);
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore,
        urlAfter: null,
        action: "cleared",
        discoveryMethod: null,
        confidence: null,
        reason: `Only ${matches} fee keyword(s)`,
      };
    }

    emit("Unknown content type — clearing");
    await clearFeeScheduleUrl(institution.id);
    await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, `Unknown content type: ${contentType}`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore,
      urlAfter: null,
      action: "cleared",
      discoveryMethod: null,
      confidence: null,
      reason: `Unknown content type: ${contentType}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`Fetch error: ${msg} — clearing`);
    await clearFeeScheduleUrl(institution.id);
    await recordAuditResult(auditRunId, institution.id, urlBefore, null, "cleared", null, null, `Fetch error: ${msg}`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore,
      urlAfter: null,
      action: "cleared",
      discoveryMethod: null,
      confidence: null,
      reason: `Fetch error: ${msg}`,
    };
  }
}

// ── Agent 2: Discoverer ──────────────────────────────────────────────────────

export async function discoverer(
  institution: InstitutionRow,
  auditRunId: number,
  emit: Emit
): Promise<AuditResult> {
  const websiteUrl = institution.website_url;
  if (!websiteUrl) {
    emit("No website_url — cannot discover");
    await recordAuditResult(auditRunId, institution.id, null, null, "not_found", null, null, "No website_url");
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: "No website_url",
    };
  }

  emit(`Running heuristic discovery on ${websiteUrl}...`);

  const modalUrl = process.env.MODAL_DISCOVER_URL;
  if (!modalUrl) {
    emit("MODAL_DISCOVER_URL not configured — skipping heuristic discovery");
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: "MODAL_DISCOVER_URL not configured",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website_url: websiteUrl,
        institution_id: institution.id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      emit(`Discovery endpoint error: ${res.status}`);
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: `Discovery endpoint ${res.status}: ${text.slice(0, 100)}`,
      };
    }

    const data: DiscoveryResponse = await res.json();
    emit(`Methods tried: ${data.methods_tried.join(", ")}`);

    if (data.found && data.fee_schedule_url) {
      emit(`Found: ${data.fee_schedule_url} (method: ${data.method}, confidence: ${data.confidence})`);
      await setFeeScheduleUrl(institution.id, data.fee_schedule_url, data.document_type);
      await recordAuditResult(
        auditRunId,
        institution.id,
        null,
        data.fee_schedule_url,
        "discovered",
        data.method,
        data.confidence,
        `Pages checked: ${data.pages_checked}`
      );
      return {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: data.fee_schedule_url,
        action: "discovered",
        discoveryMethod: data.method,
        confidence: data.confidence,
        reason: `Pages checked: ${data.pages_checked}`,
      };
    }

    emit(`Not found after checking ${data.pages_checked} pages`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: `Heuristics failed after ${data.pages_checked} pages`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`Discovery error: ${msg}`);
    return {
      institutionId: institution.id,
      institutionName: institution.institution_name,
      urlBefore: null,
      urlAfter: null,
      action: "not_found",
      discoveryMethod: null,
      confidence: null,
      reason: `Discovery error: ${msg}`,
    };
  }
}

// ── Agent 3: AI Scout ────────────────────────────────────────────────────────

export async function aiScout(
  institution: InstitutionRow,
  auditRunId: number,
  emit: Emit
): Promise<{ result: AuditResult; costCents: number }> {
  const websiteUrl = institution.website_url;
  if (!websiteUrl) {
    emit("No website_url — cannot AI scout");
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: "No website_url for AI scout",
      },
      costCents: 0,
    };
  }

  emit(`Fetching homepage: ${websiteUrl}`);

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "BankFeeIndex/1.0 (fee-schedule-audit)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      emit(`Homepage returned ${res.status}`);
      return {
        result: {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore: null,
          urlAfter: null,
          action: "not_found",
          discoveryMethod: null,
          confidence: null,
          reason: `Homepage HTTP ${res.status}`,
        },
        costCents: 0,
      };
    }
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`Homepage fetch error: ${msg}`);
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: `Homepage fetch error: ${msg}`,
      },
      costCents: 0,
    };
  }

  // Extract links with anchor text
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: { href: string; text: string }[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (href && text && href.startsWith("http")) {
      links.push({ href, text: text.slice(0, 100) });
    }
  }

  // Also include relative links resolved against the base URL
  const baseUrl = new URL(websiteUrl);
  const relativeRegex = /<a[^>]+href=["']\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = relativeRegex.exec(html)) !== null) {
    const href = `${baseUrl.origin}/${match[1].trim()}`;
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text) {
      links.push({ href, text: text.slice(0, 100) });
    }
  }

  if (!links.length) {
    emit("No links found on homepage");
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: null,
        confidence: null,
        reason: "No links found on homepage",
      },
      costCents: 0,
    };
  }

  emit(`Found ${links.length} links — sending to Claude...`);

  const response = await claude.messages.create(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `You find fee schedule URLs on bank/credit union websites. Given a list of links from an institution's homepage, identify which URL most likely leads to their fee schedule, schedule of fees, or fee disclosure document.

Return ONLY raw JSON:
{"url": "https://...", "confidence": 0.8, "reasoning": "one sentence"}

If no link looks like a fee schedule, return:
{"url": null, "confidence": 0, "reasoning": "No fee schedule link found"}`,
      messages: [
        {
          role: "user",
          content: `Institution: ${institution.institution_name}\nWebsite: ${websiteUrl}\n\nLinks found on homepage:\n${links.slice(0, 50).map((l) => `- ${l.text}: ${l.href}`).join("\n")}`,
        },
      ],
    },
    { timeout: 30_000 }
  );

  // Estimate cost
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costCents = Math.round((inputTokens * 0.3 + outputTokens * 1.5) / 100);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const src = fenced ? fenced[1] : text;
    const s = src.indexOf("{");
    const e = src.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("No JSON");
    const parsed = JSON.parse(src.slice(s, e + 1));

    if (parsed.url && parsed.confidence >= 0.6) {
      emit(`AI found: ${parsed.url} (confidence: ${parsed.confidence})`);
      emit(`Reasoning: ${parsed.reasoning}`);
      await setFeeScheduleUrl(institution.id, parsed.url, null);
      await recordAuditResult(
        auditRunId,
        institution.id,
        null,
        parsed.url,
        "ai_found",
        "ai_scout",
        parsed.confidence,
        parsed.reasoning
      );
      return {
        result: {
          institutionId: institution.id,
          institutionName: institution.institution_name,
          urlBefore: null,
          urlAfter: parsed.url,
          action: "ai_found",
          discoveryMethod: "ai_scout",
          confidence: parsed.confidence,
          reason: parsed.reasoning,
        },
        costCents,
      };
    }

    emit(`AI result: ${parsed.reasoning || "No fee schedule found"} (confidence: ${parsed.confidence})`);
    await recordAuditResult(auditRunId, institution.id, null, null, "not_found", "ai_scout", parsed.confidence, parsed.reasoning);
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: "ai_scout",
        confidence: parsed.confidence,
        reason: parsed.reasoning,
      },
      costCents,
    };
  } catch {
    emit("AI response could not be parsed");
    return {
      result: {
        institutionId: institution.id,
        institutionName: institution.institution_name,
        urlBefore: null,
        urlAfter: null,
        action: "not_found",
        discoveryMethod: "ai_scout",
        confidence: null,
        reason: "AI response parse error",
      },
      costCents,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/scout/audit-agents.ts
git commit -m "feat(scout): add audit pipeline agents — Validator, Discoverer, AI Scout"
```

---

### Task 4: Single-institution audit route

**Files:**
- Create: `src/app/api/scout/audit/route.ts`

- [ ] **Step 1: Create the audit route**

This follows the same SSE pattern as the existing pipeline route. Key differences:
- Accepts `{institutionId: number}` in POST body
- Runs Validator -> Discoverer (if needed) -> AI Scout (if needed) -> Reporter
- The Discoverer and AI Scout only run if the URL is still missing after the previous stage

```typescript
// src/app/api/scout/audit/route.ts

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureAuditTables, createAuditRun, updateAuditRunStats, getInstitutionById } from "@/lib/scout/audit-db";
import { validator, discoverer, aiScout } from "@/lib/scout/audit-agents";
import type { AuditSSEEvent, AuditAgentId, BatchSummary } from "@/lib/scout/audit-types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const institutionId = body.institutionId;
  if (!institutionId) {
    return new Response(JSON.stringify({ error: "institutionId required" }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AuditSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const log = (agentId: AuditAgentId) => (msg: string) => {
        send({ type: "log", agentId, msg });
      };
      const startAgent = (id: AuditAgentId) =>
        send({ type: "agent", agentId: id, status: "running" });
      const doneAgent = (id: AuditAgentId, ok: boolean, ms: number) =>
        send({ type: "agent", agentId: id, status: ok ? "ok" : "warn", durationMs: ms });

      try {
        await ensureAuditTables();

        const institution = await getInstitutionById(institutionId);
        if (!institution) {
          send({ type: "error", msg: `Institution ${institutionId} not found` });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        const auditRunId = await createAuditRun("institution", String(institutionId), 1);
        const stats: BatchSummary = { total: 1, validated: 0, cleared: 0, discovered: 0, aiFound: 0, stillMissing: 0, aiCostCents: 0 };

        // ── Validator ──
        startAgent("validator");
        const t1 = Date.now();
        const valResult = await validator(institution, auditRunId, log("validator"));
        doneAgent("validator", true, Date.now() - t1);

        if (valResult.action === "validated") {
          stats.validated = 1;
          send({ type: "result", result: valResult });
        } else if (valResult.action === "cleared") {
          stats.cleared = 1;
        }

        // ── Discoverer (if URL still missing) ──
        const needsDiscovery = valResult.action !== "validated";
        if (needsDiscovery) {
          startAgent("discoverer");
          const t2 = Date.now();
          const discResult = await discoverer(institution, auditRunId, log("discoverer"));
          doneAgent("discoverer", discResult.action === "discovered", Date.now() - t2);

          if (discResult.action === "discovered") {
            stats.discovered = 1;
            send({ type: "result", result: discResult });
          } else {
            // ── AI Scout (if heuristics failed) ──
            startAgent("ai_scout");
            const t3 = Date.now();
            const aiResult = await aiScout(institution, auditRunId, log("ai_scout"));
            doneAgent("ai_scout", aiResult.result.action === "ai_found", Date.now() - t3);
            stats.aiCostCents = aiResult.costCents;

            if (aiResult.result.action === "ai_found") {
              stats.aiFound = 1;
              send({ type: "result", result: aiResult.result });
            } else {
              stats.stillMissing = 1;
              send({ type: "result", result: aiResult.result });
            }
          }
        } else {
          // Skip discoverer and AI scout — already valid
          send({ type: "agent", agentId: "discoverer", status: "ok" });
          send({ type: "agent", agentId: "ai_scout", status: "ok" });
        }

        // ── Reporter ──
        startAgent("reporter");
        const t4 = Date.now();
        log("reporter")(`Audit complete for ${institution.institution_name}`);
        log("reporter")(`Result: ${valResult.action === "validated" ? "URL valid" : stats.discovered ? "URL discovered via heuristics" : stats.aiFound ? "URL found via AI" : "No fee schedule found"}`);
        doneAgent("reporter", true, Date.now() - t4);

        await updateAuditRunStats(auditRunId, {
          urls_validated: stats.validated,
          urls_cleared: stats.cleared,
          urls_discovered: stats.discovered,
          urls_ai_found: stats.aiFound,
          still_missing: stats.stillMissing,
          ai_cost_cents: stats.aiCostCents,
        });

        send({ type: "batch_summary", batchSummary: stats });
        send({ type: "done", success: true });
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
git add src/app/api/scout/audit/route.ts
git commit -m "feat(scout): add single-institution audit SSE endpoint"
```

---

### Task 5: Batch audit route

**Files:**
- Create: `src/app/api/scout/audit-batch/route.ts`

- [ ] **Step 1: Create the batch audit route**

Same SSE pattern but iterates over all institutions in a state or district. Key additions:
- Emits `batch_progress` events for each institution
- Respects `request.signal.aborted` for cancellation
- 30s per-institution timeout (skip and continue on timeout)

```typescript
// src/app/api/scout/audit-batch/route.ts

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureAuditTables,
  createAuditRun,
  updateAuditRunStats,
  getInstitutionsByScope,
} from "@/lib/scout/audit-db";
import { validator, discoverer, aiScout } from "@/lib/scout/audit-agents";
import type { AuditSSEEvent, AuditAgentId, BatchSummary } from "@/lib/scout/audit-types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const { scope, value } = body;
  if (!scope || !value || !["state", "district"].includes(scope)) {
    return new Response(
      JSON.stringify({ error: "scope (state|district) and value required" }),
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AuditSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const log = (agentId: AuditAgentId) => (msg: string) => {
        send({ type: "log", agentId, msg });
      };

      try {
        await ensureAuditTables();

        const institutions = await getInstitutionsByScope(scope, value);
        if (!institutions.length) {
          send({ type: "error", msg: `No active institutions found for ${scope}=${value}` });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        // Cap at 500
        const batch = institutions.slice(0, 500);
        send({ type: "log", agentId: "reporter", msg: `Starting audit of ${batch.length} institutions (${scope}=${value})` });

        const auditRunId = await createAuditRun(scope, value, batch.length);
        const stats: BatchSummary = {
          total: batch.length,
          validated: 0,
          cleared: 0,
          discovered: 0,
          aiFound: 0,
          stillMissing: 0,
          aiCostCents: 0,
        };

        for (let i = 0; i < batch.length; i++) {
          // Check cancellation
          if (req.signal.aborted) {
            send({ type: "log", agentId: "reporter", msg: "Audit cancelled by client" });
            break;
          }

          const inst = batch[i];
          send({
            type: "batch_progress",
            batchProgress: { current: i + 1, total: batch.length, institution: inst.institution_name },
          });

          try {
            // Validator
            const valResult = await validator(inst, auditRunId, log("validator"));

            if (valResult.action === "validated") {
              stats.validated++;
              continue;
            }
            if (valResult.action === "cleared") {
              stats.cleared++;
            }

            // Discoverer
            const discResult = await discoverer(inst, auditRunId, log("discoverer"));
            if (discResult.action === "discovered") {
              stats.discovered++;
              continue;
            }

            // AI Scout
            const aiResult = await aiScout(inst, auditRunId, log("ai_scout"));
            stats.aiCostCents += aiResult.costCents;
            if (aiResult.result.action === "ai_found") {
              stats.aiFound++;
            } else {
              stats.stillMissing++;
            }
          } catch (instErr) {
            const msg = instErr instanceof Error ? instErr.message : String(instErr);
            send({ type: "log", agentId: "reporter", msg: `Error on ${inst.institution_name}: ${msg} — skipping` });
            stats.stillMissing++;
          }
        }

        await updateAuditRunStats(auditRunId, {
          urls_validated: stats.validated,
          urls_cleared: stats.cleared,
          urls_discovered: stats.discovered,
          urls_ai_found: stats.aiFound,
          still_missing: stats.stillMissing,
          ai_cost_cents: stats.aiCostCents,
        });

        send({ type: "batch_summary", batchSummary: stats });
        send({ type: "done", success: true });
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
git add src/app/api/scout/audit-batch/route.ts
git commit -m "feat(scout): add batch audit SSE endpoint for state/district scope"
```

---

### Task 6: Extend FeeScout UI with audit mode

**Files:**
- Modify: `src/components/scout/FeeScout.tsx`

- [ ] **Step 1: Add audit mode to FeeScout**

Read the current `src/components/scout/FeeScout.tsx` (1,029 lines). Add the following changes:

1. **Mode toggle at top of component** — two tabs: "Research" and "Audit"
2. **Audit-specific state** — separate reducer for audit pipeline (validator, discoverer, ai_scout, reporter agents)
3. **Scope selector for batch mode** — state dropdown and district dropdown, visible only in audit mode
4. **Audit pipeline cards** — same AgentCard component but with audit agent IDs and labels
5. **Audit results display** — show before/after URL, action taken, discovery method, confidence
6. **Batch progress bar** — for multi-institution runs

Key additions to the existing component:

**Mode state:**
```typescript
const [mode, setMode] = useState<"research" | "audit">("research");
```

**Audit agent steps:**
```typescript
const AUDIT_STEPS = [
  { id: "validator", n: "01", label: "URL Validation", desc: "Checks if existing URL is a real fee schedule" },
  { id: "discoverer", n: "02", label: "Heuristic Discovery", desc: "Runs 6-method cascade to find fee schedule URL" },
  { id: "ai_scout", n: "03", label: "AI Scout", desc: "Claude evaluates homepage links for fee schedules" },
  { id: "reporter", n: "04", label: "Reporter", desc: "Summarizes audit results and changes" },
];
```

**Audit SSE runner:**
```typescript
async function runAudit(institutionId: number, dispatch: Dispatch) {
  // Same pattern as runPipeline but calls /api/scout/audit
  // Handles AuditSSEEvent types: batch_progress, batch_summary, result
}

async function runBatchAudit(scope: string, value: string, dispatch: Dispatch) {
  // Calls /api/scout/audit-batch
  // Updates batch progress state
}
```

**Mode toggle UI** (add above the search input):
```tsx
<div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
  <button
    onClick={() => setMode("research")}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      mode === "research" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
    }`}
  >
    Research
  </button>
  <button
    onClick={() => setMode("audit")}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      mode === "audit" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
    }`}
  >
    URL Audit
  </button>
</div>
```

**Batch scope selector** (shown in audit mode below search):
```tsx
{mode === "audit" && (
  <div className="flex gap-3 mt-3">
    <select
      value={auditScope}
      onChange={(e) => setAuditScope(e.target.value)}
      className="border border-gray-200 rounded-md px-3 py-2 text-sm"
    >
      <option value="single">Single Institution</option>
      <option value="state">By State</option>
      <option value="district">By Fed District</option>
    </select>
    {auditScope === "state" && (
      <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="...">
        {/* 50 state options */}
      </select>
    )}
    {auditScope === "district" && (
      <select value={scopeValue} onChange={(e) => setScopeValue(e.target.value)} className="...">
        {/* 12 district options */}
      </select>
    )}
  </div>
)}
```

**Batch summary display** (shown after batch completes):
```tsx
{batchSummary && (
  <div className="grid grid-cols-6 gap-3 mb-6">
    {[
      ["Total", batchSummary.total],
      ["Validated", batchSummary.validated],
      ["Cleared", batchSummary.cleared],
      ["Discovered", batchSummary.discovered],
      ["AI Found", batchSummary.aiFound],
      ["Missing", batchSummary.stillMissing],
    ].map(([label, value]) => (
      <div key={label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
        <div className="text-lg font-bold tabular-nums">{value}</div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</div>
      </div>
    ))}
  </div>
)}
```

The implementer should read the full v7 source and current FeeScout.tsx to understand the component patterns, then add audit mode following the patterns above. The audit pipeline cards reuse the existing AgentCard component — just pass the audit STEPS and audit agent state instead of research STEPS.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/scout/FeeScout.tsx
git commit -m "feat(scout): add URL audit mode with batch support to FeeScout UI"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Run the build**

```bash
npm run build 2>&1 | grep -E "scout|error|Error" 
```

Expected: All scout routes present, no errors.

- [ ] **Step 2: Test single-institution audit**

Start dev server and test:
1. Navigate to `/admin/scout`
2. Switch to "URL Audit" tab
3. Search for "Space Coast" (or any institution)
4. Click "Run Audit"
5. Verify Validator checks the URL, Discoverer runs if needed, AI Scout runs if needed
6. Verify results display

- [ ] **Step 3: Test batch audit**

1. Switch scope to "By State", select a small state (e.g., "WY")
2. Click "Run Audit"
3. Verify batch progress updates per institution
4. Verify summary stats display at completion

- [ ] **Step 4: Verify audit tables populated**

```bash
node -e "
const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const sql = postgres(process.env.DATABASE_URL);
Promise.all([
  sql\`SELECT * FROM url_audit_runs ORDER BY id DESC LIMIT 3\`,
  sql\`SELECT COUNT(*) as total FROM url_audit_results\`,
]).then(r => { console.log('Runs:', JSON.stringify(r[0], null, 2)); console.log('Results:', r[1][0].total); return sql.end(); });
"
```

- [ ] **Step 5: Commit any fixes**

```bash
git add -p  # stage specific files only
git commit -m "feat(scout): URL audit pipeline — complete implementation"
```
