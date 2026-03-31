# Wyoming State Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-stage AI agent on Modal that discovers, classifies, extracts, and validates fee schedules for all 43 Wyoming institutions.

**Architecture:** Modal function with Playwright browser. Five sequential stages per institution: inventory → AI-powered URL discovery → document classification → specialist extraction (PDF/HTML/JS) → LLM validation. Progress written to DB, admin UI polls for updates.

**Tech Stack:** Python 3.12, Modal, Playwright, Anthropic SDK, psycopg2, pdfplumber, BeautifulSoup, Next.js 16 (UI).

**Spec:** `docs/superpowers/specs/2026-03-30-wyoming-agent-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `fee_crawler/agents/__init__.py` | Create | Package init |
| `fee_crawler/agents/state_agent.py` | Create | Main orchestrator: 5 stages, progress tracking |
| `fee_crawler/agents/discover.py` | Create | Stage 2: AI + Playwright URL discovery |
| `fee_crawler/agents/classify.py` | Create | Stage 3: document type detection |
| `fee_crawler/agents/extract_pdf.py` | Create | Stage 4: PDF specialist |
| `fee_crawler/agents/extract_html.py` | Create | Stage 4: HTML specialist |
| `fee_crawler/agents/extract_js.py` | Create | Stage 4: JS-rendered specialist |
| `fee_crawler/agents/validate.py` | Create | Stage 5: AI fee validation |
| `fee_crawler/modal_app.py` | Modify | Add state_agent web endpoint |
| `src/lib/scout/agent-types.ts` | Create | TypeScript types for agent runs |
| `src/lib/scout/agent-db.ts` | Create | DB queries for agent runs/results |
| `src/app/api/scout/agent/route.ts` | Create | POST: trigger agent |
| `src/app/api/scout/agent/[id]/route.ts` | Create | GET: poll progress |
| `src/components/scout/FeeScout.tsx` | Modify | Add Agent tab |

---

### Task 0: Agent DB tables + TypeScript layer

**Files:**
- Create: `src/lib/scout/agent-types.ts`
- Create: `src/lib/scout/agent-db.ts`

- [ ] **Step 1: Create agent-types.ts**

```typescript
// src/lib/scout/agent-types.ts

export interface AgentRun {
  id: number;
  state_code: string;
  status: "running" | "complete" | "failed";
  started_at: string;
  completed_at: string | null;
  total_institutions: number;
  discovered: number;
  classified: number;
  extracted: number;
  validated: number;
  failed: number;
  current_stage: string | null;
  current_institution: string | null;
}

export interface AgentRunResult {
  id: number;
  agent_run_id: number;
  crawl_target_id: number;
  stage: "discover" | "classify" | "extract" | "validate";
  status: "ok" | "failed" | "skipped";
  detail: Record<string, unknown>;
  created_at: string;
}
```

- [ ] **Step 2: Create agent-db.ts**

```typescript
// src/lib/scout/agent-db.ts

import { sql } from "@/lib/crawler-db/connection";
import type { AgentRun, AgentRunResult } from "./agent-types";

export async function ensureAgentTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id SERIAL PRIMARY KEY,
      state_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      total_institutions INTEGER DEFAULT 0,
      discovered INTEGER DEFAULT 0,
      classified INTEGER DEFAULT 0,
      extracted INTEGER DEFAULT 0,
      validated INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      current_stage TEXT,
      current_institution TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS agent_run_results (
      id SERIAL PRIMARY KEY,
      agent_run_id INTEGER REFERENCES agent_runs(id),
      crawl_target_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      detail JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_run_results_run
    ON agent_run_results(agent_run_id)
  `;
}

export async function getAgentRun(id: number): Promise<AgentRun | null> {
  const [row] = await sql<AgentRun[]>`
    SELECT * FROM agent_runs WHERE id = ${id}
  `;
  return row || null;
}

export async function getAgentRunResults(runId: number): Promise<AgentRunResult[]> {
  return sql<AgentRunResult[]>`
    SELECT * FROM agent_run_results
    WHERE agent_run_id = ${runId}
    ORDER BY created_at
  `;
}

export async function getLatestAgentRun(stateCode: string): Promise<AgentRun | null> {
  const [row] = await sql<AgentRun[]>`
    SELECT * FROM agent_runs
    WHERE state_code = ${stateCode}
    ORDER BY started_at DESC LIMIT 1
  `;
  return row || null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/scout/agent-types.ts src/lib/scout/agent-db.ts
git commit -m "feat(agent): add agent run DB tables and TypeScript layer"
```

---

### Task 1: Python agent package + orchestrator

**Files:**
- Create: `fee_crawler/agents/__init__.py`
- Create: `fee_crawler/agents/state_agent.py`

- [ ] **Step 1: Create package init**

```python
# fee_crawler/agents/__init__.py
```

- [ ] **Step 2: Create state_agent.py**

This is the main orchestrator. It connects to the DB, creates an agent_run, then runs all 5 stages sequentially per institution.

```python
"""
State Agent — end-to-end fee schedule pipeline for a single state.

Stages:
  1. Inventory   — load institutions, assess current state
  2. Discover    — AI + Playwright finds fee_schedule_url
  3. Classify    — determine document type (PDF / HTML / JS)
  4. Extract     — specialist sub-agent per doc type
  5. Validate    — AI reviews extracted fees for quality
"""

import os
import json
import logging
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from fee_crawler.agents.discover import discover_url
from fee_crawler.agents.classify import classify_document
from fee_crawler.agents.extract_pdf import extract_pdf
from fee_crawler.agents.extract_html import extract_html
from fee_crawler.agents.extract_js import extract_js
from fee_crawler.agents.validate import validate_fees

log = logging.getLogger(__name__)


def _connect():
    return psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _update_run(conn, run_id: int, **kwargs):
    sets = ", ".join(f"{k} = %s" for k in kwargs)
    vals = list(kwargs.values()) + [run_id]
    conn.cursor().execute(f"UPDATE agent_runs SET {sets} WHERE id = %s", vals)
    conn.commit()


def _record_result(conn, run_id: int, target_id: int, stage: str, status: str, detail: dict):
    conn.cursor().execute(
        """INSERT INTO agent_run_results (agent_run_id, crawl_target_id, stage, status, detail)
           VALUES (%s, %s, %s, %s, %s)""",
        (run_id, target_id, stage, status, json.dumps(detail)),
    )
    conn.commit()


def run_state_agent(state_code: str) -> dict:
    """Run the full 5-stage agent for a state. Returns summary dict."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

    conn = _connect()
    cur = conn.cursor()

    # ── Stage 1: Inventory ────────────────────────────────────────────
    log.info(f"Stage 1: Inventory for {state_code}")
    cur.execute(
        "SELECT * FROM crawl_targets WHERE status = 'active' AND state_code = %s ORDER BY asset_size DESC NULLS LAST",
        (state_code,),
    )
    institutions = cur.fetchall()

    # Create agent run
    cur.execute(
        "INSERT INTO agent_runs (state_code, total_institutions, current_stage) VALUES (%s, %s, 'inventory') RETURNING id",
        (state_code, len(institutions)),
    )
    run_id = cur.fetchone()["id"]
    conn.commit()

    log.info(f"Run #{run_id}: {len(institutions)} institutions in {state_code}")

    stats = {"discovered": 0, "classified": 0, "extracted": 0, "validated": 0, "failed": 0}

    for i, inst in enumerate(institutions):
        inst_name = inst["institution_name"]
        inst_id = inst["id"]
        log.info(f"[{i+1}/{len(institutions)}] {inst_name}")
        _update_run(conn, run_id, current_institution=inst_name)

        # ── Stage 2: Discover ─────────────────────────────────────────
        _update_run(conn, run_id, current_stage="discover")
        fee_url = inst["fee_schedule_url"]
        website_url = inst["website_url"]

        if not fee_url and website_url:
            try:
                result = discover_url(inst_name, website_url)
                if result["found"]:
                    fee_url = result["url"]
                    cur.execute(
                        "UPDATE crawl_targets SET fee_schedule_url = %s, document_type = %s WHERE id = %s",
                        (fee_url, result.get("document_type"), inst_id),
                    )
                    conn.commit()
                    stats["discovered"] += 1
                    _record_result(conn, run_id, inst_id, "discover", "ok", result)
                    log.info(f"  Discovered: {fee_url}")
                else:
                    _record_result(conn, run_id, inst_id, "discover", "failed", result)
                    stats["failed"] += 1
                    log.info(f"  Discovery failed: {result.get('reason', 'unknown')}")
                    continue
            except Exception as e:
                _record_result(conn, run_id, inst_id, "discover", "failed", {"error": str(e)})
                stats["failed"] += 1
                log.error(f"  Discovery error: {e}")
                continue
        elif fee_url:
            _record_result(conn, run_id, inst_id, "discover", "skipped", {"existing_url": fee_url})
        else:
            _record_result(conn, run_id, inst_id, "discover", "failed", {"reason": "no website_url"})
            stats["failed"] += 1
            continue

        _update_run(conn, run_id, discovered=stats["discovered"])

        # ── Stage 3: Classify ─────────────────────────────────────────
        _update_run(conn, run_id, current_stage="classify")
        try:
            doc_type = classify_document(fee_url)
            cur.execute(
                "UPDATE crawl_targets SET document_type = %s WHERE id = %s",
                (doc_type, inst_id),
            )
            conn.commit()
            stats["classified"] += 1
            _record_result(conn, run_id, inst_id, "classify", "ok", {"document_type": doc_type})
            log.info(f"  Classified: {doc_type}")
        except Exception as e:
            _record_result(conn, run_id, inst_id, "classify", "failed", {"error": str(e)})
            stats["failed"] += 1
            log.error(f"  Classify error: {e}")
            continue

        _update_run(conn, run_id, classified=stats["classified"])

        # ── Stage 4: Extract ──────────────────────────────────────────
        _update_run(conn, run_id, current_stage="extract")
        try:
            if doc_type == "pdf":
                fees = extract_pdf(fee_url, inst)
            elif doc_type == "html":
                fees = extract_html(fee_url, inst)
            else:
                fees = extract_js(fee_url, inst)

            if fees:
                # Write fees to DB
                _write_fees(conn, inst_id, fees)
                stats["extracted"] += 1
                _record_result(conn, run_id, inst_id, "extract", "ok", {"fee_count": len(fees), "doc_type": doc_type})
                log.info(f"  Extracted: {len(fees)} fees")
            else:
                _record_result(conn, run_id, inst_id, "extract", "failed", {"reason": "no fees extracted"})
                stats["failed"] += 1
                log.info(f"  Extraction returned 0 fees")
                continue
        except Exception as e:
            _record_result(conn, run_id, inst_id, "extract", "failed", {"error": str(e)})
            stats["failed"] += 1
            log.error(f"  Extract error: {e}")
            continue

        _update_run(conn, run_id, extracted=stats["extracted"])

        # ── Stage 5: Validate ─────────────────────────────────────────
        _update_run(conn, run_id, current_stage="validate")
        try:
            validation = validate_fees(inst, fees)
            stats["validated"] += 1
            _record_result(conn, run_id, inst_id, "validate", "ok", validation)
            log.info(f"  Validated: {validation['data_quality']} ({len(validation.get('issues', []))} issues)")
        except Exception as e:
            _record_result(conn, run_id, inst_id, "validate", "failed", {"error": str(e)})
            log.error(f"  Validate error: {e}")

        _update_run(conn, run_id, validated=stats["validated"])

    # ── Complete ──────────────────────────────────────────────────────
    _update_run(
        conn, run_id,
        status="complete",
        completed_at=datetime.now(timezone.utc).isoformat(),
        current_stage="done",
        current_institution=None,
        **stats,
    )
    conn.close()

    log.info(f"Run #{run_id} complete: {json.dumps(stats)}")
    return {"run_id": run_id, **stats}


def _write_fees(conn, crawl_target_id: int, fees: list[dict]):
    """Write extracted fees to the database."""
    cur = conn.cursor()

    # Remove existing non-approved fees
    cur.execute(
        "DELETE FROM extracted_fees WHERE crawl_target_id = %s AND review_status NOT IN ('approved')",
        (crawl_target_id,),
    )

    for fee in fees:
        cur.execute(
            """INSERT INTO extracted_fees
               (crawl_target_id, fee_name, amount, frequency, conditions,
                extraction_confidence, review_status, fee_category, fee_family, extracted_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'agent_v1')""",
            (
                crawl_target_id,
                fee.get("fee_name"),
                fee.get("amount"),
                fee.get("frequency"),
                fee.get("conditions"),
                fee.get("confidence", 0.9),
                "staged",
                fee.get("fee_category"),
                fee.get("fee_family"),
            ),
        )

    # Also write a crawl_result record
    cur.execute(
        """INSERT INTO crawl_results
           (crawl_target_id, status, fees_extracted, crawled_at)
           VALUES (%s, 'success', %s, NOW())""",
        (crawl_target_id, len(fees)),
    )

    # Update crawl target timestamps
    cur.execute(
        "UPDATE crawl_targets SET last_crawl_at = NOW(), last_success_at = NOW(), consecutive_failures = 0 WHERE id = %s",
        (crawl_target_id,),
    )

    conn.commit()
```

- [ ] **Step 3: Commit**

```bash
git add fee_crawler/agents/__init__.py fee_crawler/agents/state_agent.py
git commit -m "feat(agent): add state agent orchestrator with 5-stage pipeline"
```

---

### Task 2: Stage 2 — AI Discovery with Playwright

**Files:**
- Create: `fee_crawler/agents/discover.py`

- [ ] **Step 1: Create discover.py**

```python
"""
Stage 2: AI-powered URL discovery.

Uses Claude + Playwright to find fee schedule URLs.
Max 5 page loads per institution.
"""

import os
import logging

import anthropic
from playwright.sync_api import sync_playwright

log = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    return _client


def discover_url(institution_name: str, website_url: str) -> dict:
    """
    Find the fee schedule URL for an institution.

    Returns: {"found": bool, "url": str|None, "document_type": str|None,
              "confidence": float, "reason": str, "pages_checked": int}
    """
    pages_checked = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="BankFeeIndex/1.0 (fee-schedule-agent)",
        )
        page.set_default_timeout(15_000)

        # Load homepage and extract links
        try:
            page.goto(website_url, wait_until="domcontentloaded", timeout=20_000)
            pages_checked += 1
        except Exception as e:
            browser.close()
            return {"found": False, "url": None, "document_type": None,
                    "confidence": 0, "reason": f"Homepage load failed: {e}", "pages_checked": 1}

        # Extract all visible links
        links = _extract_links(page)
        homepage_text = page.inner_text("body")[:3000]

        if not links:
            browser.close()
            return {"found": False, "url": None, "document_type": None,
                    "confidence": 0, "reason": "No links found on homepage", "pages_checked": 1}

        # Ask Claude which link to follow
        client = _get_client()

        links_text = "\n".join(f"- {l['text']}: {l['href']}" for l in links[:60])

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            system="""You find fee schedule URLs on bank and credit union websites.
Given links from a page, identify which URL leads to the fee schedule, schedule of fees, or fee disclosure.
If the fee schedule is likely on a sub-page (e.g., "Disclosures" or "Resources"), tell me to navigate there.

Return JSON only:
{"action": "found", "url": "https://...", "confidence": 0.9, "reason": "..."}
{"action": "navigate", "url": "https://...", "reason": "Fee schedule likely under this page"}
{"action": "not_found", "reason": "No fee schedule link visible"}""",
            messages=[{
                "role": "user",
                "content": f"Institution: {institution_name}\nCurrent page: {website_url}\n\nVisible links:\n{links_text}",
            }],
            timeout=30,
        )

        result = _parse_json(response)
        if not result:
            browser.close()
            return {"found": False, "url": None, "document_type": None,
                    "confidence": 0, "reason": "AI response parse error", "pages_checked": pages_checked}

        # Follow up to 4 more pages
        for attempt in range(4):
            if result.get("action") == "found":
                url = result["url"]
                doc_type = "pdf" if url.lower().endswith(".pdf") else None
                browser.close()
                return {
                    "found": True,
                    "url": url,
                    "document_type": doc_type,
                    "confidence": result.get("confidence", 0.8),
                    "reason": result.get("reason", ""),
                    "pages_checked": pages_checked,
                }

            if result.get("action") == "navigate" and result.get("url"):
                nav_url = result["url"]
                try:
                    page.goto(nav_url, wait_until="domcontentloaded", timeout=15_000)
                    pages_checked += 1
                except Exception as e:
                    log.warning(f"Navigation failed: {e}")
                    break

                links = _extract_links(page)
                page_text = page.inner_text("body")[:3000]
                links_text = "\n".join(f"- {l['text']}: {l['href']}" for l in links[:60])

                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=500,
                    system="""You find fee schedule URLs on bank and credit union websites.
Given links from a page, identify which URL leads to the fee schedule.

Return JSON only:
{"action": "found", "url": "https://...", "confidence": 0.9, "reason": "..."}
{"action": "navigate", "url": "https://...", "reason": "Fee schedule likely under this page"}
{"action": "not_found", "reason": "No fee schedule link visible"}""",
                    messages=[{
                        "role": "user",
                        "content": f"Institution: {institution_name}\nCurrent page: {nav_url}\n\nPage text (first 1000 chars):\n{page_text[:1000]}\n\nVisible links:\n{links_text}",
                    }],
                    timeout=30,
                )
                result = _parse_json(response)
                if not result:
                    break
            else:
                break

        browser.close()
        return {
            "found": False,
            "url": None,
            "document_type": None,
            "confidence": 0,
            "reason": result.get("reason", "Could not find fee schedule") if result else "AI gave up",
            "pages_checked": pages_checked,
        }


def _extract_links(page) -> list[dict]:
    """Extract all visible links with text from a Playwright page."""
    try:
        links = page.evaluate("""() => {
            const results = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const text = a.innerText?.trim();
                const href = a.href;
                if (text && href && href.startsWith('http') && text.length < 200) {
                    results.push({text, href});
                }
            });
            return results;
        }""")
        return links
    except Exception:
        return []


def _parse_json(response) -> dict | None:
    """Extract JSON from Claude response."""
    text = "".join(b.text for b in response.content if b.type == "text")
    import json
    try:
        # Try direct parse
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from fenced block
    import re
    m = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return None
```

- [ ] **Step 2: Commit**

```bash
git add fee_crawler/agents/discover.py
git commit -m "feat(agent): add AI + Playwright URL discovery agent"
```

---

### Task 3: Stage 3 — Document classifier

**Files:**
- Create: `fee_crawler/agents/classify.py`

- [ ] **Step 1: Create classify.py**

```python
"""
Stage 3: Document type classification.

Determines if a URL points to a PDF, static HTML, or JS-rendered page.
"""

import logging
import requests

log = logging.getLogger(__name__)

FEE_KEYWORDS = [
    "monthly maintenance fee", "overdraft fee", "nsf fee",
    "insufficient funds", "atm fee", "wire transfer fee",
    "service charge", "account fee", "stop payment",
    "returned item", "foreign transaction",
]


def classify_document(url: str) -> str:
    """
    Classify a URL as 'pdf', 'html', or 'js_rendered'.

    Returns: document type string
    """
    # PDF by URL extension
    if url.lower().endswith(".pdf"):
        return "pdf"

    # HEAD request for content type
    try:
        resp = requests.head(url, timeout=10, allow_redirects=True,
                             headers={"User-Agent": "BankFeeIndex/1.0"})
        content_type = resp.headers.get("Content-Type", "").lower()

        if "application/pdf" in content_type:
            return "pdf"
    except Exception as e:
        log.warning(f"HEAD request failed for {url}: {e}")

    # GET request to check content richness
    try:
        resp = requests.get(url, timeout=15, allow_redirects=True,
                            headers={"User-Agent": "BankFeeIndex/1.0"})
        if "application/pdf" in resp.headers.get("Content-Type", "").lower():
            return "pdf"

        text = resp.text
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(text, "lxml")

        # Remove non-content
        for tag in soup.find_all(["script", "style", "nav", "header", "footer"]):
            tag.decompose()

        visible_text = soup.get_text(separator=" ", strip=True)
        link_count = len(soup.find_all("a"))
        keyword_matches = sum(1 for kw in FEE_KEYWORDS if kw in visible_text.lower())

        # Rich content with fee keywords → static HTML
        if len(visible_text) > 500 and keyword_matches >= 2:
            return "html"

        # Thin content → likely JS-rendered
        return "js_rendered"

    except Exception as e:
        log.warning(f"GET request failed for {url}: {e}")
        return "js_rendered"  # Assume JS if we can't tell
```

- [ ] **Step 2: Commit**

```bash
git add fee_crawler/agents/classify.py
git commit -m "feat(agent): add document type classifier"
```

---

### Task 4: Stage 4 — Three extraction specialists

**Files:**
- Create: `fee_crawler/agents/extract_pdf.py`
- Create: `fee_crawler/agents/extract_html.py`
- Create: `fee_crawler/agents/extract_js.py`

- [ ] **Step 1: Create extract_pdf.py**

```python
"""Stage 4: PDF fee extraction specialist."""

import os
import logging
import tempfile
import requests
import anthropic
import pdfplumber

log = logging.getLogger(__name__)

_EXTRACT_TOOL = {
    "name": "extract_fees",
    "description": "Record all fees extracted from the fee schedule.",
    "input_schema": {
        "type": "object",
        "properties": {
            "fees": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fee_name": {"type": "string"},
                        "amount": {"type": ["number", "null"]},
                        "frequency": {"type": "string", "enum": ["per_occurrence", "monthly", "annual", "one_time", "daily", "other"]},
                        "conditions": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                    },
                    "required": ["fee_name", "amount", "frequency", "confidence"],
                },
            },
        },
        "required": ["fees"],
    },
}


def extract_pdf(url: str, institution: dict) -> list[dict]:
    """Download PDF and extract fees via Claude tool use."""
    # Download
    resp = requests.get(url, timeout=30, headers={"User-Agent": "BankFeeIndex/1.0"})
    resp.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(resp.content)
        pdf_path = f.name

    # Extract text
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages[:20])
    finally:
        os.unlink(pdf_path)

    if not text.strip():
        log.warning("PDF text extraction returned empty")
        return []

    return _extract_fees_with_llm(text, institution, "pdf")


def _extract_fees_with_llm(text: str, institution: dict, doc_type: str) -> list[dict]:
    """Send text to Claude for fee extraction via tool use."""
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    charter = institution.get("charter_type", "bank")
    name = institution.get("institution_name", "Unknown")

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system="You are a financial data extraction specialist. Extract ALL fees from fee schedule documents. Use the extract_fees tool to record every fee you find.",
        tools=[_EXTRACT_TOOL],
        tool_choice={"type": "tool", "name": "extract_fees"},
        messages=[{
            "role": "user",
            "content": f"Extract all fees from this {charter} fee schedule ({doc_type}) for {name}.\n\nDocument text:\n{text[:8000]}",
        }],
        timeout=60,
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_fees":
            return block.input.get("fees", [])

    return []
```

- [ ] **Step 2: Create extract_html.py**

```python
"""Stage 4: HTML fee extraction specialist."""

import os
import logging
import requests
import anthropic
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

# Reuse the same tool from extract_pdf
from fee_crawler.agents.extract_pdf import _EXTRACT_TOOL, _extract_fees_with_llm


def extract_html(url: str, institution: dict) -> list[dict]:
    """Fetch HTML page and extract fees via Claude."""
    resp = requests.get(url, timeout=15, allow_redirects=True,
                        headers={"User-Agent": "BankFeeIndex/1.0"})
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")

    # Remove non-content
    for tag in soup.find_all(["script", "style", "nav", "header", "footer", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)

    if not text.strip():
        log.warning("HTML text extraction returned empty")
        return []

    return _extract_fees_with_llm(text, institution, "html")
```

- [ ] **Step 3: Create extract_js.py**

```python
"""Stage 4: JS-rendered fee extraction specialist.

Uses Playwright to render JS-heavy pages (SPAs, Kentico, etc.).
Can follow sub-links if the page is an index/hub.
"""

import os
import logging
import anthropic
from playwright.sync_api import sync_playwright

log = logging.getLogger(__name__)

from fee_crawler.agents.extract_pdf import _EXTRACT_TOOL, _extract_fees_with_llm


def extract_js(url: str, institution: dict) -> list[dict]:
    """Render page with Playwright, extract fees."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent="BankFeeIndex/1.0 (fee-schedule-agent)")
        page.set_default_timeout(15_000)

        try:
            page.goto(url, wait_until="networkidle", timeout=30_000)
        except Exception as e:
            log.warning(f"Page load failed: {e}")
            # Try with domcontentloaded fallback
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=15_000)
            except Exception:
                browser.close()
                return []

        # Get rendered text
        text = page.inner_text("body")

        # Check if this is an index page (lots of links, little fee content)
        fee_keywords = ["monthly maintenance", "overdraft", "nsf", "atm fee", "wire transfer"]
        keyword_hits = sum(1 for kw in fee_keywords if kw in text.lower())

        if keyword_hits >= 2 and len(text) > 300:
            # Page has fee content — extract directly
            browser.close()
            return _extract_fees_with_llm(text, institution, "js_rendered")

        # This might be a link index page (like Space Coast)
        # Find sub-links that look like fee schedules
        links = page.evaluate("""() => {
            const results = [];
            document.querySelectorAll('a[href]').forEach(a => {
                const text = a.innerText?.trim().toLowerCase();
                const href = a.href;
                if (href && (text.includes('fee') || text.includes('schedule') ||
                    text.includes('disclosure') || text.includes('truth in savings') ||
                    href.includes('fee') || href.includes('schedule'))) {
                    results.push({text: a.innerText?.trim(), href});
                }
            });
            return results;
        }""")

        if links:
            log.info(f"Found {len(links)} fee-related sub-links, following top 3")
            all_fees = []

            for link in links[:3]:
                try:
                    sub_url = link["href"]
                    if sub_url.lower().endswith(".pdf"):
                        # Download PDF
                        from fee_crawler.agents.extract_pdf import extract_pdf
                        fees = extract_pdf(sub_url, institution)
                    else:
                        page.goto(sub_url, wait_until="networkidle", timeout=20_000)
                        sub_text = page.inner_text("body")
                        fees = _extract_fees_with_llm(sub_text, institution, "js_rendered")

                    all_fees.extend(fees)
                except Exception as e:
                    log.warning(f"Sub-link {link.get('href')} failed: {e}")

            browser.close()
            return all_fees

        # Last resort: just extract whatever we have
        browser.close()
        if len(text) > 100:
            return _extract_fees_with_llm(text, institution, "js_rendered")
        return []
```

- [ ] **Step 4: Commit**

```bash
git add fee_crawler/agents/extract_pdf.py fee_crawler/agents/extract_html.py fee_crawler/agents/extract_js.py
git commit -m "feat(agent): add PDF, HTML, and JS extraction specialists"
```

---

### Task 5: Stage 5 — Validation

**Files:**
- Create: `fee_crawler/agents/validate.py`

- [ ] **Step 1: Create validate.py**

```python
"""Stage 5: AI fee validation."""

import os
import json
import logging

import anthropic

log = logging.getLogger(__name__)


def validate_fees(institution: dict, fees: list[dict]) -> dict:
    """
    Ask Claude to review extracted fees for quality.

    Returns: {"data_quality": str, "issues": list, "missing_categories": list}
    """
    if not fees:
        return {"data_quality": "limited", "issues": ["No fees extracted"], "missing_categories": []}

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    charter = institution.get("charter_type", "bank")
    name = institution.get("institution_name", "Unknown")
    state = institution.get("state", "Unknown")

    fees_text = json.dumps(
        [{"name": f.get("fee_name"), "amount": f.get("amount"), "frequency": f.get("frequency")} for f in fees],
        indent=2,
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        system="""You validate extracted bank fee data. Review fees for completeness and accuracy.

Return JSON only:
{
  "data_quality": "excellent|good|partial|limited",
  "issues": ["specific issue 1", "specific issue 2"],
  "missing_categories": ["category names that should be present but aren't"]
}

Quality rubric:
- excellent: 10+ fees, all major categories present, amounts look reasonable
- good: 5-9 fees, most major categories present
- partial: 3-4 fees, some categories missing
- limited: 1-2 fees or data looks incomplete

Major categories for banks/credit unions: monthly maintenance, overdraft, NSF, ATM, wire transfer, stop payment, statement fee""",
        messages=[{
            "role": "user",
            "content": f"Review these extracted fees for {name}, a {charter} in {state}.\n\n{fees_text}",
        }],
        timeout=30,
    )

    text = "".join(b.text for b in response.content if b.type == "text")

    try:
        # Parse JSON
        import re
        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            return json.loads(m.group())
    except (json.JSONDecodeError, AttributeError):
        pass

    return {"data_quality": "unknown", "issues": ["Validation response parse error"], "missing_categories": []}
```

- [ ] **Step 2: Commit**

```bash
git add fee_crawler/agents/validate.py
git commit -m "feat(agent): add AI fee validation agent"
```

---

### Task 6: Modal endpoint for state agent

**Files:**
- Modify: `fee_crawler/modal_app.py`

- [ ] **Step 1: Add state_agent endpoint**

Read `fee_crawler/modal_app.py`. Add at the end, before any `if __name__` block:

```python
@app.function(secrets=secrets, timeout=7200, memory=2048, image=browser_image)
@modal.web_endpoint(method="POST")
def run_state_agent(item: dict) -> dict:
    """HTTP endpoint to run the full state agent.

    Accepts: {"state_code": "WY"}
    Returns: {"run_id": 123, "discovered": N, ...}
    """
    from fee_crawler.agents.state_agent import run_state_agent

    state_code = item.get("state_code", "").upper()
    if not state_code or len(state_code) != 2:
        return {"error": "state_code required (2-letter code)"}

    return run_state_agent(state_code)
```

- [ ] **Step 2: Commit**

```bash
git add fee_crawler/modal_app.py
git commit -m "feat(agent): add Modal web endpoint for state agent"
```

---

### Task 7: API routes for triggering + polling

**Files:**
- Create: `src/app/api/scout/agent/route.ts`
- Create: `src/app/api/scout/agent/[id]/route.ts`

- [ ] **Step 1: Create trigger route**

```typescript
// src/app/api/scout/agent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureAgentTables } from "@/lib/scout/agent-db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { state } = await req.json();
  if (!state || state.length !== 2) {
    return NextResponse.json({ error: "state required (2-letter code)" }, { status: 400 });
  }

  await ensureAgentTables();

  const modalUrl = process.env.MODAL_AGENT_URL;
  if (!modalUrl) {
    return NextResponse.json({ error: "MODAL_AGENT_URL not configured" }, { status: 500 });
  }

  // Trigger Modal job (fire-and-forget — Modal runs async)
  try {
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_code: state }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Modal error: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create polling route**

```typescript
// src/app/api/scout/agent/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAgentRun, getAgentRunResults } from "@/lib/scout/agent-db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const runId = parseInt(id, 10);
  if (isNaN(runId)) {
    return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
  }

  const run = await getAgentRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const results = await getAgentRunResults(runId);

  return NextResponse.json({ ...run, results });
}
```

- [ ] **Step 3: Commit**

```bash
mkdir -p src/app/api/scout/agent/\[id\]
git add src/app/api/scout/agent/route.ts src/app/api/scout/agent/\[id\]/route.ts
git commit -m "feat(agent): add API routes for triggering and polling state agent"
```

---

### Task 8: Agent tab in FeeScout UI

**Files:**
- Modify: `src/components/scout/FeeScout.tsx`

- [ ] **Step 1: Add Agent tab**

Read `src/components/scout/FeeScout.tsx`. The component already has a mode toggle (Research / URL Audit). Add a third mode: "Agent".

Changes needed:

1. Update mode type: `"research" | "audit" | "agent"`
2. Add "Agent" button to the mode toggle pill
3. Add agent-specific state:
```typescript
const [agentRunId, setAgentRunId] = useState<number | null>(null);
const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
const [agentPolling, setAgentPolling] = useState(false);
```

4. Add agent trigger function:
```typescript
async function triggerAgent(state: string) {
  const res = await fetch("/api/scout/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  const data = await res.json();
  if (data.run_id) {
    setAgentRunId(data.run_id);
    setAgentPolling(true);
  }
}
```

5. Add polling effect:
```typescript
useEffect(() => {
  if (!agentPolling || !agentRunId) return;
  const interval = setInterval(async () => {
    const res = await fetch(`/api/scout/agent/${agentRunId}`);
    const data = await res.json();
    setAgentRun(data);
    if (data.status !== "running") {
      setAgentPolling(false);
    }
  }, 2000);
  return () => clearInterval(interval);
}, [agentPolling, agentRunId]);
```

6. Agent UI (when `mode === "agent"`):
- State dropdown (all 50 states + DC)
- "Run Agent" button
- Progress display: current stage, current institution, counters
- Progress bar: discovered/classified/extracted/validated out of total
- Results table after completion: each institution with status per stage

- [ ] **Step 2: Build verify**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/scout/FeeScout.tsx
git commit -m "feat(agent): add Agent tab to FeeScout UI with progress polling"
```

---

### Task 9: Deploy + test Wyoming

- [ ] **Step 1: Deploy Modal**

```bash
modal deploy fee_crawler/modal_app.py
```

Note the `run_state_agent` endpoint URL and add to `.env.local`:
```
MODAL_AGENT_URL=https://your-workspace--bank-fee-index-workers-run-state-agent.modal.run
```

- [ ] **Step 2: Test locally**

```bash
npm run dev
```

Navigate to `/admin/scout`, switch to "Agent" tab, select WY, click "Run Agent".

Monitor progress — should show 43 institutions being processed through all 5 stages.

- [ ] **Step 3: Verify results**

```bash
node -e "
const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const sql = postgres(process.env.DATABASE_URL);
Promise.all([
  sql\`SELECT * FROM agent_runs ORDER BY id DESC LIMIT 1\`,
  sql\`SELECT stage, status, COUNT(*) as cnt FROM agent_run_results WHERE agent_run_id = (SELECT MAX(id) FROM agent_runs) GROUP BY stage, status ORDER BY stage, status\`,
  sql\`SELECT COUNT(DISTINCT crawl_target_id) as with_fees FROM extracted_fees WHERE crawl_target_id IN (SELECT id FROM crawl_targets WHERE state_code = 'WY')\`,
]).then(r => {
  console.log('Latest run:', JSON.stringify(r[0][0], null, 2));
  console.log('Results by stage:', JSON.stringify(r[1], null, 2));
  console.log('WY institutions with fees:', r[2][0].with_fees);
  return sql.end();
});
"
```

- [ ] **Step 4: Test FeeScout research on a WY institution**

Search for a Wyoming bank in FeeScout research mode. Verify the report now has real fee data.

- [ ] **Step 5: Commit any fixes**

```bash
git add -p
git commit -m "feat(agent): Wyoming state agent — complete and tested"
```
