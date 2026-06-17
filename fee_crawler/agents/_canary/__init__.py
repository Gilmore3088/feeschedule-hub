"""Canary corpora for the adversarial gate.

One JSON file per agent. Each corpus defines a set of input → expected
output expectations + thresholds. Before any LOOP-07 IMPROVE commits,
adversarial_gate.run_gate replays the corpus and aborts the lesson if
the agent regresses below the thresholds.

Adding a new agent corpus:
    1. Create `<agent>.json` here.
    2. Set canary_corpus_path = str(Path(__file__).parent / "<agent>.json")
       on the agent's review_tick invocation.
    3. Provide a canary_runner_fn that knows how to interpret the
       corpus format for that agent (extractor's HTML fixtures, Darwin's
       canonical-key expectations, etc.).
"""

from pathlib import Path


CANARY_DIR = Path(__file__).parent


def canary_path_for(agent_name: str) -> str | None:
    """Resolve agent_name → corpus JSON path, or None if no corpus exists."""
    p = CANARY_DIR / f"{agent_name}.json"
    return str(p) if p.exists() else None
