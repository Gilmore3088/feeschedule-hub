"""Run remaining state agent iterations for MA, WA, NH, RI, VT."""
import sys
import json
import logging
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv(".env.local")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("runner")

from fee_crawler.agents.state_agent import run_state_agent

PLAN = [
    ("MA", 3),
    ("WA", 3),
    ("NH", 2),
    ("RI", 2),
    ("VT", 2),
]

for state, iters in PLAN:
    for i in range(1, iters + 1):
        log.info(f"{'='*60}")
        log.info(f"Starting {state} iteration {i}/{iters}")
        log.info(f"{'='*60}")
        try:
            result = run_state_agent(state)
            log.info(f"RESULT {state} iter {i}: {json.dumps(result, default=str)}")
        except Exception as e:
            log.error(f"FAILED {state} iter {i}: {e}")
        log.info(f"Completed {state} iteration {i}/{iters}")

log.info("ALL STATES COMPLETE")
