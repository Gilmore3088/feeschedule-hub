"""Resume state agents - ME iter 3, then WA, RI, VT (3 iterations each)."""
import sys
import dotenv
import os

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

dotenv.load_dotenv(".env")
dotenv.load_dotenv(".env.local", override=True)

import time
import json
import logging
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(message)s")

from fee_crawler.agents.state_agent import run_state_agent

STARTING = {"DC": 65, "ME": 66, "WA": 54, "RI": 56, "VT": 58}

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


def run_state(state, iterations):
    print(f"\n{'='*60}", flush=True)
    print(f"STATE AGENT: {state} (starting coverage: {STARTING[state]}%)", flush=True)
    print(f"{'='*60}", flush=True)

    runs = []
    for i in range(1, iterations + 1):
        start = time.time()
        print(f"\n--- {state} Iteration {i}/{iterations} ---", flush=True)
        try:
            result = run_state_agent(state)
            elapsed = time.time() - start
            d = result if isinstance(result, dict) else {}
            runs.append(d)
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
            runs.append({"error": str(e)})
            print(f"State: {state} | Iteration: {i} | ERROR: {e} | Elapsed: {elapsed:.1f}s", flush=True)

    try:
        cov = get_coverage(state)
        print(f"\n{state} final coverage: {cov['covered']}/{cov['total']} = {cov['pct']}%", flush=True)
        return {"runs": runs, "final": cov}
    except Exception as e:
        print(f"\n{state} coverage query error: {e}", flush=True)
        return {"runs": runs, "final": None}


# ME: 1 more iteration (had 2 done)
all_results["ME"] = run_state("ME", 1)

# Remaining 3 states: 3 iterations each
for state in ["WA", "RI", "VT"]:
    all_results[state] = run_state(state, 3)

# Get DC coverage (already ran 3 iterations earlier)
try:
    dc_cov = get_coverage("DC")
    all_results["DC"] = {"runs": [], "final": dc_cov}
except Exception as e:
    print(f"DC coverage query error: {e}", flush=True)

# Summary table
print(f"\n\n{'='*70}", flush=True)
print("SUMMARY: All 5 States After 3 Iterations Each", flush=True)
print(f"{'='*70}", flush=True)
print(f"{'State':<8} {'Starting':>10} {'Final':>10} {'Change':>10} {'Total Inst':>12} {'Covered':>10}", flush=True)
print(f"{'-'*8} {'-'*10} {'-'*10} {'-'*10} {'-'*12} {'-'*10}", flush=True)

for state in ["DC", "ME", "WA", "RI", "VT"]:
    start_pct = STARTING[state]
    info = all_results.get(state, {})
    final = info.get("final")
    if final:
        final_pct = final["pct"]
        change = final_pct - start_pct
        sign = "+" if change >= 0 else ""
        print(
            f"{state:<8} {start_pct:>9.1f}% {final_pct:>9.1f}% {sign}{change:>8.1f}% {final['total']:>12} {final['covered']:>10}",
            flush=True,
        )
    else:
        print(f"{state:<8} {start_pct:>9.1f}%     ERROR", flush=True)

print(f"{'='*70}", flush=True)
