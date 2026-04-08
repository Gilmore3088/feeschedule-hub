"""Run IL state agent for 3 iterations. Launch with:
    nohup python3 _run_il_3x.py > _run_il_3x.log 2>&1 &
"""
import dotenv
import os
import json
import sys
from datetime import datetime

dotenv.load_dotenv('.env')
dotenv.load_dotenv('.env.local', override=True)

sys.stdout.reconfigure(line_buffering=True)

from fee_crawler.agents.state_agent import run_state_agent

STATE = 'IL'
ITERATIONS = 3

for i in range(1, ITERATIONS + 1):
    print(f"\n{'='*60}", flush=True)
    print(f"ITERATION {i}/{ITERATIONS} -- {STATE}", flush=True)
    print(f"Started: {datetime.now().isoformat()}", flush=True)
    print(f"{'='*60}\n", flush=True)

    try:
        result = run_state_agent(STATE)
        print(f"\n--- Iteration {i} result ---", flush=True)
        print(json.dumps(result, indent=2, default=str), flush=True)
    except Exception as e:
        print(f"\nIteration {i} FAILED: {e}", flush=True)

    print(f"\nIteration {i} finished: {datetime.now().isoformat()}", flush=True)

print(f"\n{'='*60}", flush=True)
print(f"ALL {ITERATIONS} ITERATIONS COMPLETE", flush=True)
print(f"Finished: {datetime.now().isoformat()}", flush=True)
print(f"{'='*60}", flush=True)
