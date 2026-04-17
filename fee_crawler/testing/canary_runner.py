"""Canary runner (D-20 + LOOP-07).

Given an agent_name + CanaryCorpus, run the agent against each institution,
compute coverage/confidence_mean/extraction_count, and compare to the frozen
baseline. The first run per ``(agent_name, corpus_version)`` is marked
``is_baseline=true``; every subsequent run compares deltas against it.

Pass bar (research §Mechanics 7): ``coverage_delta >= 0 AND confidence_delta
>= 0 AND extraction_count_delta >= 0``. Zero regression. Phase 63 can tune
per-metric tolerances if too strict after real corpora land.

Writes one ``canary_runs`` row per invocation and returns a
``CanaryVerdict``. The actual agent-runner is passed as a callback so this
module stays decoupled from per-agent implementation details (Knox, Darwin,
etc. land in Phase 63+).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Awaitable, Callable, Optional

from fee_crawler.agent_tools.pool import get_pool
from fee_crawler.testing.canary_schema import CanaryCorpus, CanaryVerdict


AgentRunner = Callable[[int], Awaitable[dict]]
"""(institution_id) -> {"coverage": float, "confidence_mean": float, "extraction_count": int}."""


async def run_canary(
    agent_name: str,
    corpus: CanaryCorpus,
    runner: AgentRunner,
    *,
    force_baseline: bool = False,
    pool=None,
) -> CanaryVerdict:
    """Execute the corpus end-to-end and return a verdict.

    Args:
        agent_name: canonical agent name (must exist in agent_registry).
        corpus: validated CanaryCorpus fixture.
        runner: callback invoked once per expectation, receiving
            institution_id and returning the three metrics.
        force_baseline: when True, mark this run as ``is_baseline=true``
            regardless of prior baselines. Used by tests that rebuild the
            baseline after a fixture change.
        pool: override the module-level pool (test fixtures pass per-schema pools).

    Side effects:
        Inserts exactly one row into ``canary_runs``. Status is
        ``'passed'`` when all three deltas are >= 0 (or when this is the
        baseline run), ``'failed'`` otherwise.
    """
    if pool is None:
        pool = await get_pool()

    run_id = str(uuid.uuid4())
    started = datetime.utcnow()

    # Run the agent against every expectation in corpus-order.
    results: list[dict] = []
    for exp in corpus.expectations:
        r = await runner(exp.institution_id)
        results.append(r)

    n = max(len(results), 1)
    coverage_mean = sum(float(r.get("coverage", 0.0)) for r in results) / n
    confidence_mean = sum(float(r.get("confidence_mean", 0.0)) for r in results) / n
    extraction_count = sum(int(r.get("extraction_count", 0)) for r in results)

    # Look up baseline (unless the caller forces a new one).
    baseline = None
    if not force_baseline:
        async with pool.acquire() as conn:
            baseline = await conn.fetchrow(
                """SELECT run_id, coverage, confidence_mean, extraction_count
                     FROM canary_runs
                    WHERE agent_name = $1
                      AND corpus_version = $2
                      AND is_baseline""",
                agent_name,
                corpus.version,
            )

    is_baseline = force_baseline or baseline is None
    cov_d: Optional[float] = None
    conf_d: Optional[float] = None
    cnt_d: Optional[int] = None
    passed = True
    verdict_reason: Optional[str] = None

    if baseline is not None:
        cov_d = float(coverage_mean) - float(baseline["coverage"] or 0.0)
        conf_d = float(confidence_mean) - float(baseline["confidence_mean"] or 0.0)
        cnt_d = int(extraction_count) - int(baseline["extraction_count"] or 0)
        if cov_d < 0 or conf_d < 0 or cnt_d < 0:
            passed = False
            verdict_reason = (
                f"regression: coverage_delta={cov_d} "
                f"confidence_delta={conf_d} "
                f"extraction_count_delta={cnt_d}"
            )

    status = "passed" if passed else "failed"

    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO canary_runs
                 (run_id, agent_name, corpus_version, started_at, finished_at, status,
                  is_baseline, coverage, confidence_mean, extraction_count,
                  coverage_delta, confidence_delta, extraction_count_delta,
                  verdict, report_payload, baseline_run_id)
               VALUES ($1::UUID, $2, $3, $4, NOW(), $5, $6, $7, $8, $9,
                       $10, $11, $12, $13, $14::JSONB, $15::UUID)""",
            run_id,
            agent_name,
            corpus.version,
            started,
            status,
            is_baseline,
            coverage_mean,
            confidence_mean,
            extraction_count,
            cov_d,
            conf_d,
            cnt_d,
            verdict_reason or ("baseline" if is_baseline else "pass"),
            json.dumps({"results": results}),
            str(baseline["run_id"]) if baseline else None,
        )

    return CanaryVerdict(
        passed=passed,
        coverage=float(coverage_mean),
        confidence_mean=float(confidence_mean),
        extraction_count=int(extraction_count),
        coverage_delta=cov_d,
        confidence_delta=conf_d,
        extraction_count_delta=cnt_d,
        reason=verdict_reason,
    )


__all__ = ["AgentRunner", "run_canary"]
