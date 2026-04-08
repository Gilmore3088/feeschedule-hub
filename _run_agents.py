"""Run state agents for 5 small states, 3 iterations each."""
import dotenv
import os

dotenv.load_dotenv(".env")
dotenv.load_dotenv(".env.local", override=True)

import time
import json
import logging
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(message)s")

from fee_crawler.agents.state_agent import run_state_agent

STATES = ["DC", "ME", "WA", "RI", "VT"]
STARTING = {"DC": 65, "ME": 66, "WA": 54, "RI": 56, "VT": 58}
ITERATIONS = 3

all_results = {}


def get_coverage(state_code):
    """Query current coverage for a state."""
    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) as total FROM crawl_targets WHERE status = 'active' AND state_code = %s",
        (state_code,),
    )
    total = cur.fetchone()["total"]
    cur.execute(
        """SELECT COUNT(DISTINCT ct.id) as covered
           FROM crawl_targets ct
           JOIN extracted_fees ef ON ef.crawl_target_id = ct.id
           WHERE ct.status = 'active' AND ct.state_code = %s
             AND ef.review_status IN ('staged', 'approved', 'pending')""",
        (state_code,),
    )
    covered = cur.fetchone()["covered"]
    conn.close()
    pct = round(100 * covered / total, 1) if total > 0 else 0
    return {"total": total, "covered": covered, "pct": pct}


for state in STATES:
    print(f"\n{'='*60}")
    print(f"STATE AGENT: {state} (starting coverage: {STARTING[state]}%)")
    print(f"{'='*60}")

    state_runs = []
    for i in range(1, ITERATIONS + 1):
        start = time.time()
        print(f"\n--- {state} Iteration {i}/{ITERATIONS} ---", flush=True)
        try:
            result = run_state_agent(state)
            elapsed = time.time() - start
            d = result if isinstance(result, dict) else {}
            state_runs.append(d)
            print(
                f"State: {state} | Iteration: {i} "
                f"| Discovered: {d.get('discovered', 'N/A')} "
                f"| Extracted: {d.get('extracted', 'N/A')} "
                f"| Validated: {d.get('validated', 'N/A')} "
                f"| Failed: {d.get('failed', 'N/A')} "
                f"| Elapsed: {elapsed:.1f}s",
                flush=True,
            )
        except Exception as e:
            elapsed = time.time() - start
            state_runs.append({"error": str(e)})
            print(f"State: {state} | Iteration: {i} | ERROR: {e} | Elapsed: {elapsed:.1f}s", flush=True)

    # Query final coverage
    try:
        cov = get_coverage(state)
        print(f"\n{state} final coverage: {cov['covered']}/{cov['total']} = {cov['pct']}%", flush=True)
        all_results[state] = {"runs": state_runs, "final": cov}
    except Exception as e:
        print(f"\n{state} coverage query error: {e}", flush=True)
        all_results[state] = {"runs": state_runs, "final": None}


# Summary table
print(f"\n\n{'='*70}")
print("SUMMARY: All 5 States After 3 Iterations Each")
print(f"{'='*70}")
print(f"{'State':<8} {'Starting':>10} {'Final':>10} {'Change':>10} {'Total Inst':>12} {'Covered':>10}")
print(f"{'-'*8} {'-'*10} {'-'*10} {'-'*10} {'-'*12} {'-'*10}")

for state in STATES:
    start_pct = STARTING[state]
    info = all_results.get(state, {})
    final = info.get("final")
    if final:
        final_pct = final["pct"]
        change = final_pct - start_pct
        sign = "+" if change >= 0 else ""
        print(
            f"{state:<8} {start_pct:>9.1f}% {final_pct:>9.1f}% {sign}{change:>8.1f}% {final['total']:>12} {final['covered']:>10}"
        )
    else:
        print(f"{state:<8} {start_pct:>9.1f}%     ERROR")

print(f"{'='*70}")
