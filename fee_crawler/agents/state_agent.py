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
from fee_crawler.knowledge.loader import load_knowledge, write_learnings, get_known_failures
from fee_crawler.knowledge.pruner import should_prune_state, prune_state

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

    # ── Load knowledge ────────────────────────────────────────────────
    knowledge = load_knowledge(state_code)
    known_failures = get_known_failures(state_code)
    if knowledge:
        log.info(f"Loaded {len(knowledge)} chars of knowledge ({len(known_failures)} known failures)")

    stats = {"discovered": 0, "classified": 0, "extracted": 0, "validated": 0, "failed": 0}
    learnings = []

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
            # Skip institutions known to not publish online
            if any(inst_name.lower().startswith(f.lower()) for f in known_failures):
                _record_result(conn, run_id, inst_id, "discover", "skipped", {"reason": "known failure from knowledge base"})
                stats["failed"] += 1
                log.info(f"  Skipped (known failure)")
                continue

            try:
                result = discover_url(inst_name, website_url, knowledge=knowledge)
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
                conn.rollback()
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
            conn.rollback()
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
            conn.rollback()  # Reset transaction state so subsequent queries work
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

    # ── Write learnings ─────────────────────────────────────────────
    _update_run(conn, run_id, current_stage="learnings")
    try:
        learnings = _generate_learnings(conn, run_id, state_code, stats)
        write_learnings(state_code, run_id, stats, learnings)
        log.info(f"Wrote {len(learnings)} learnings to knowledge base")

        if should_prune_state(state_code):
            log.info(f"Pruning {state_code} knowledge file...")
            prune_state(state_code)
    except Exception as e:
        log.error(f"Knowledge write error: {e}")

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

    # Remove reviews for non-approved fees first (FK constraint)
    cur.execute(
        """DELETE FROM fee_reviews WHERE fee_id IN (
             SELECT id FROM extracted_fees
             WHERE crawl_target_id = %s AND review_status NOT IN ('approved')
           )""",
        (crawl_target_id,),
    )

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

    # Update crawl target timestamps (skip crawl_results — it requires crawl_run_id)
    cur.execute(
        "UPDATE crawl_targets SET last_crawl_at = NOW(), last_success_at = NOW(), consecutive_failures = 0 WHERE id = %s",
        (crawl_target_id,),
    )

    conn.commit()


def _generate_learnings(conn, run_id: int, state_code: str, stats: dict) -> list[dict]:
    """Ask Claude to generate learnings from this run's results."""
    import anthropic

    cur = conn.cursor()
    cur.execute(
        """SELECT r.crawl_target_id, r.stage, r.status, r.detail,
                  ct.institution_name, ct.website_url, ct.fee_schedule_url, ct.document_type
           FROM agent_run_results r
           JOIN crawl_targets ct ON ct.id = r.crawl_target_id
           WHERE r.agent_run_id = %s
           ORDER BY r.id""",
        (run_id,),
    )
    results = cur.fetchall()

    if not results:
        return []

    # Build a summary of what happened
    summary_lines = []
    for r in results:
        detail = r["detail"] if isinstance(r["detail"], dict) else json.loads(r["detail"] or "{}")
        info = detail.get("reason") or detail.get("error") or detail.get("document_type") or detail.get("fee_count") or ""
        summary_lines.append(
            f"{r['institution_name']}: {r['stage']}={r['status']} ({str(info)[:80]})"
        )

    summary = "\n".join(summary_lines[:60])

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        system="""You analyze fee schedule agent run results and extract learnings.

Return a JSON array of learnings. Each learning has optional fields:
- "pattern": a general discovery/extraction pattern (applies beyond one institution)
- "site_note": an institution-specific note (what worked or failed and why)
- "national": a pattern worth promoting to national knowledge (applies to all states)

Only include genuinely useful learnings — skip obvious successes and routine failures.
Focus on: new discovery methods that worked, CMS/platform observations, surprising failures, institutions confirmed to not publish online.

Return JSON array only, no explanation.""",
        messages=[{
            "role": "user",
            "content": f"State: {state_code}\nStats: discovered={stats['discovered']}, extracted={stats['extracted']}, failed={stats['failed']}\n\nRun results:\n{summary}",
        }],
        timeout=30,
    )

    text = "".join(b.text for b in response.content if b.type == "text")

    try:
        import re
        m = re.search(r'\[[\s\S]*\]', text)
        if m:
            return json.loads(m.group())
    except (json.JSONDecodeError, AttributeError):
        pass

    return []
