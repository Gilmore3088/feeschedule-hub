"""
Modal serverless workers for Bank Fee Index pipeline.

Replaces GitHub Actions SSH cron with scalable, pay-per-use workers.
Each function runs on Modal's infrastructure with its own schedule.

Deploy: modal deploy fee_crawler/modal_app.py
Test:   modal run fee_crawler/modal_app.py::test_connection
"""

import subprocess as _subprocess

import modal


class SubprocessFailed(RuntimeError):
    """Raised when a Modal scheduled subprocess exits non-zero.

    The exception message embeds tails of stdout and stderr so the
    Modal dashboard surfaces the root cause without requiring log dives.
    """

    def __init__(self, cmd, returncode, stdout_tail, stderr_tail):
        self.cmd = cmd
        self.returncode = returncode
        self.stdout_tail = stdout_tail
        self.stderr_tail = stderr_tail
        super().__init__(
            f"subprocess failed: {' '.join(cmd)} exited {returncode}\n"
            f"--- stdout tail ---\n{stdout_tail}\n"
            f"--- stderr tail ---\n{stderr_tail}"
        )


def run_checked(cmd, *, cwd=None, env=None, timeout=None, tail_lines=40):
    """Run a subprocess and raise SubprocessFailed on non-zero exit.

    Captures stdout/stderr, keeps the last `tail_lines` lines of each in
    the raised exception. Returns the CompletedProcess on success.
    """
    result = _subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env,
        timeout=timeout,
    )
    if result.returncode != 0:
        stdout_tail = "\n".join((result.stdout or "").splitlines()[-tail_lines:])
        stderr_tail = "\n".join((result.stderr or "").splitlines()[-tail_lines:])
        raise SubprocessFailed(list(cmd), result.returncode, stdout_tail, stderr_tail)
    return result

pdf_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

browser_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("tesseract-ocr", "poppler-utils")
    .pip_install_from_requirements("fee_crawler/requirements.txt")
    .pip_install("fastapi[standard]")
    .run_commands(["playwright install --with-deps chromium"])
    .add_local_dir("fee_crawler", remote_path="/root/fee_crawler")
)

# Default image includes browser for backward compat with non-extraction workers
image = browser_image

app = modal.App("bank-fee-index-workers", image=image)
secrets = [modal.Secret.from_name("bfi-secrets")]


def _mark_job_completion(job_name: str, status: str = "ok") -> None:
    """Write a workers_last_run row so the /admin/pipeline health dashboard
    can tell whether this scheduled job has actually completed recently.

    Intentionally best-effort: if the marker write fails we log and return
    rather than re-raising, so a marker-DB hiccup doesn't mask an otherwise
    successful job run. The opposite (silent missing markers) produced the
    '7 scheduled jobs never completed' red banner that was a misleading
    report of crons that ARE running — they just weren't writing markers.
    """
    import os
    try:
        import psycopg2
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO workers_last_run (job_name, completed_at, status)
               VALUES (%s, NOW(), %s)
               ON CONFLICT (job_name) DO UPDATE
                 SET completed_at = EXCLUDED.completed_at,
                     status       = EXCLUDED.status""",
            (job_name, status),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as exc:
        print(f"workers_last_run write failed for {job_name}: {exc}")


@app.function(secrets=secrets, timeout=300)
async def test_connection():
    """Verify Modal can connect to Supabase."""
    import os
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM crawl_targets")
    count = cur.fetchone()[0]
    conn.close()
    return f"Connected. {count:,} institutions in database."


@app.function(
    schedule=modal.Cron("0 2 * * *"),
    timeout=21600,
    secrets=secrets,
    memory=2048,
)
async def run_discovery():
    """Nightly URL discovery via the `discoverer` agent shell.

    Was a bare subprocess call to discovery_worker.run() — no agent
    identity, no audit, no budget (Stage 1 leak #1 in WORKFLOW-MAP.md).
    Now wrapped by fee_crawler.agents.discoverer which:
      - validates agent_registry.is_active
      - emits paired session_start / session_end agent_events
      - debits agent_budgets after the run
    """
    from fee_crawler.agents.discoverer import run_discovery_session
    try:
        result = await run_discovery_session(concurrency=20)
        _mark_job_completion("run_discovery", "ok")
        return result.to_dict()
    except Exception:
        _mark_job_completion("run_discovery", "failed")
        raise


async def _run_extractor(job_name: str, doc_type: str | None, size: int) -> str:
    """Shared body for the agentic PDF / browser extraction crons.

    Calls extract_batch(...) directly via asyncpg — no subprocess, no legacy
    `python -m fee_crawler crawl` (which writes the frozen extracted_fees
    table). Every fee write goes through create_fee_raw → agent gateway →
    fees_raw, with audit + budget enforcement applied per-call.
    """
    import os
    import asyncpg
    from fee_crawler.agents.extractor import extract_batch, ExtractorConfig

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        config = ExtractorConfig(
            document_type=doc_type,
            include_failing=True,
        )
        result = await extract_batch(conn, size=size, config=config)
        _mark_job_completion(job_name, "ok")
        return f"{job_name}: {result.to_dict()}"
    except Exception:
        _mark_job_completion(job_name, "failed")
        raise
    finally:
        await conn.close()


@app.function(
    schedule=modal.Cron("0 3 * * *"),
    timeout=10800,
    secrets=secrets,
    memory=1024,
    image=pdf_image,
)
async def run_pdf_extraction():
    """Nightly PDF extraction via the extractor agent → fees_raw."""
    return await _run_extractor("run_pdf_extraction", doc_type="pdf", size=500)


@app.function(
    schedule=modal.Cron("0 4 * * *"),
    timeout=14400,
    secrets=secrets,
    memory=2048,
    image=browser_image,
)
async def run_browser_extraction():
    """Nightly browser extraction via the extractor agent → fees_raw."""
    return await _run_extractor("run_browser_extraction", doc_type=None, size=500)


# D-05 pivot (Phase 62b, Plan 62B-08): Modal Starter tier caps at 5 cron slots.
# Rather than add a 6th slot for review_dispatcher, this function now ticks every
# minute — calling dispatch_ticks() first (LOOP-03 agent review dispatch), then
# running the original daily post-processing pipeline only at 06:00. See research
# §Mechanics 3 / Pitfall 1 and 62B-08-SUMMARY.md for the decision rationale.
@app.function(
    schedule=modal.Cron("* * * * *"),
    timeout=3600,
    secrets=secrets,
    memory=1024,
)
async def run_post_processing():
    """Every-minute dispatcher.

    S-02 (product-focus round): the 7 independent agent tasks below now
    run concurrently via asyncio.gather(return_exceptions=True). Each
    opens its own asyncpg connection, so no shared state. Order of
    execution doesn't matter — atlas creating new fees_raw and darwin
    consuming its inbox can race; worst case is the message processes
    on the next minute-tick.

    Includes R-01: pipeline_health check emits health_alert agent_events
    for any cron that's stale beyond its threshold.
    """
    import asyncio
    import os
    from datetime import datetime, timezone, timedelta

    # ── 7 concurrent tasks ────────────────────────────────────────────
    async def _safe(name: str, coro):
        """Run a task; never raise; return ('name', result|exception)."""
        try:
            return (name, await coro)
        except Exception as exc:
            print(f"{name} failed (non-fatal): {exc!r}")
            return (name, exc)

    async def _t_dispatch_ticks():
        from fee_crawler.agent_base.dispatcher import dispatch_ticks
        n = await dispatch_ticks()
        if n:
            print(f"dispatch_ticks: invoked {n} agent review(s)")
        return n

    async def _t_darwin_inbox():
        from fee_crawler.agents.darwin.inbox import drain_darwin_inbox
        r = await drain_darwin_inbox(max_messages=5, batch_size=100)
        if r.messages_processed > 0:
            print(f"darwin inbox: {r.to_dict()}")
        return r

    async def _t_review_tick():
        from fee_crawler.agent_base.review_tick import run_review_tick
        agents = ("darwin", "magellan", "knox", "extractor",
                  "discoverer", "atlas", "hamilton")
        idx = datetime.now(timezone.utc).minute % len(agents)
        r = await run_review_tick(agents[idx])
        if r.lesson_committed or r.events_seen > 0:
            print(f"review_tick {agents[idx]}: {r.to_dict()}")
        return r

    async def _t_knox_summary():
        import asyncpg
        from fee_crawler.agents.knox.rejections import maybe_run_weekly_summary
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            r = await maybe_run_weekly_summary(conn)
            if r:
                print(f"knox rejection summary: {r.to_dict()}")
            return r
        finally:
            await conn.close()

    async def _t_hamilton_digests():
        import asyncpg
        from fee_crawler.agents.hamilton import process_due_digests
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            r = await process_due_digests(conn, max_runs=5)
            if r:
                print(f"hamilton digests: {[x.to_dict() for x in r]}")
            return r
        finally:
            await conn.close()

    async def _t_atlas_dispatch():
        import asyncpg
        from fee_crawler.agents.atlas import dispatch_state_fleet
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            r = await dispatch_state_fleet(
                conn, states_per_tick=2, size_per_state=100,
            )
            if r.runs:
                print(f"atlas: dispatched {len(r.runs)} state(s), "
                      f"{sum(x.fees_written for x in r.runs)} fees, "
                      f"${sum(x.cost_usd for x in r.runs):.4f}")
            return r
        finally:
            await conn.close()

    async def _t_pipeline_health():
        # R-01: emit health_alert agent_events for stale crons.
        import asyncpg
        from fee_crawler.agent_base.pipeline_health import check_pipeline_health
        conn = await asyncpg.connect(os.environ["DATABASE_URL"])
        try:
            r = await check_pipeline_health(conn)
            if r.alerts_emitted > 0:
                print(f"pipeline_health: {r.to_dict()}")
            return r
        finally:
            await conn.close()

    # asyncio.gather runs all 7 concurrently. return_exceptions=True so
    # one failure doesn't cancel the others — _safe also catches +
    # logs, defense-in-depth.
    await asyncio.gather(
        _safe("dispatch_ticks",   _t_dispatch_ticks()),
        _safe("darwin_inbox",     _t_darwin_inbox()),
        _safe("review_tick",      _t_review_tick()),
        _safe("knox_summary",     _t_knox_summary()),
        _safe("hamilton_digests", _t_hamilton_digests()),
        _safe("atlas_dispatch",   _t_atlas_dispatch()),
        _safe("pipeline_health",  _t_pipeline_health()),
        return_exceptions=False,
    )

    now = datetime.now(timezone.utc)

    # 05:00-05:09 UTC window: Magellan rescue + Knox review.
    # Piggybacks on the every-minute dispatcher so we stay inside the 5-cron Modal
    # Starter cap. Gated on workers_last_run markers so each runs once per day.
    today_0500 = now.replace(hour=5, minute=0, second=0, microsecond=0)
    if today_0500 <= now < today_0500 + timedelta(minutes=10):
        await _run_0500_jobs(now, today_0500)

    # WR-05 fix: widen the trigger window to 06:00-06:09 UTC to absorb Modal
    # cron jitter, and gate actual work on a workers_last_run marker so we
    # run at most once per UTC day (idempotent catch-up if we missed 06:00).
    today_0600 = now.replace(hour=6, minute=0, second=0, microsecond=0)
    if now < today_0600 or now >= today_0600 + timedelta(minutes=10):
        return "dispatch_only"

    db_url = os.environ["DATABASE_URL"]
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            "SELECT completed_at FROM workers_last_run WHERE job_name = %s",
            ("daily_pipeline",),
        )
        row = cur.fetchone()
        last_completed = row[0] if row else None
        cur.close()
        conn.close()
    except Exception as exc:
        # If we can't read the marker, fall through rather than silently skipping.
        print(f"workers_last_run read failed (proceeding anyway): {exc}")
        last_completed = None

    if last_completed is not None and last_completed >= today_0600:
        return "dispatch_only"

    # If we're past 06:01 and still about to run, log a WARNING so missed
    # windows are observable in the Modal dashboard.
    if now >= today_0600 + timedelta(minutes=2):
        delay_s = int((now - today_0600).total_seconds())
        print(
            f"WARNING: daily_pipeline running {delay_s}s after 06:00 UTC "
            "(cron jitter or catch-up)"
        )

    env = {**os.environ, "DATABASE_URL": db_url}
    commands = [
        ["python3", "-m", "fee_crawler", "categorize"],
        ["python3", "-m", "fee_crawler", "auto-review"],
        # Drain fees_verified -> fees_published before snapshot/publish-index
        # so the index cache reflects newly-published rows in the same cycle.
        ["python3", "-m", "fee_crawler", "publish-fees", "--apply", "--limit", "2000"],
        ["python3", "-m", "fee_crawler", "snapshot"],
        ["python3", "-m", "fee_crawler", "publish-index"],
    ]
    results = []
    for cmd in commands:
        run_checked(cmd, env=env)
        results.append(f"{cmd[-1]}: OK")

    # Run data integrity checks
    from fee_crawler.workers.data_integrity import run_checks, print_report
    integrity = run_checks()
    print(print_report(integrity))

    # Generate daily report
    from fee_crawler.workers.daily_report import generate_report
    report = generate_report()
    print(report)

    # Record completion so subsequent minute-ticks skip until tomorrow.
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO workers_last_run (job_name, completed_at, status)
               VALUES (%s, NOW(), %s)
               ON CONFLICT (job_name) DO UPDATE
                 SET completed_at = EXCLUDED.completed_at,
                     status       = EXCLUDED.status""",
            ("daily_pipeline", "ok"),
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as exc:
        # Marker write failures should not mask a successful pipeline, but
        # leave a breadcrumb so operators notice recurring double-runs.
        print(f"workers_last_run write failed (pipeline still succeeded): {exc}")

    return f"Pipeline: {'; '.join(results)} | Integrity: {integrity['score']}% ({integrity['passed']}/{integrity['total']} passed)"


async def _run_0500_jobs(now, today_0500) -> None:
    """05:00 UTC daily jobs: Magellan URL rescue + Knox adversarial review.

    Piggybacks on run_post_processing's every-minute dispatcher so we don't
    exceed Modal Starter's 5-cron cap. Each job is gated by its own
    workers_last_run marker so it runs once per UTC day.
    """
    import os
    import psycopg2
    import asyncpg

    db_url = os.environ["DATABASE_URL"]

    def _already_ran(job_name: str) -> bool:
        try:
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute(
                "SELECT completed_at FROM workers_last_run WHERE job_name = %s",
                (job_name,),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            return row is not None and row[0] is not None and row[0] >= today_0500
        except Exception as exc:
            print(f"[{job_name}] marker read failed (running anyway): {exc}")
            return False

    def _mark_ran(job_name: str, status: str = "ok") -> None:
        try:
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO workers_last_run (job_name, completed_at, status)
                   VALUES (%s, NOW(), %s)
                   ON CONFLICT (job_name) DO UPDATE
                     SET completed_at = EXCLUDED.completed_at,
                         status       = EXCLUDED.status""",
                (job_name, status),
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception as exc:
            print(f"[{job_name}] marker write failed: {exc}")

    # --- Magellan URL rescue ---
    if not _already_ran("magellan_rescue"):
        try:
            from fee_crawler.agents.magellan.orchestrator import rescue_batch
            conn = await asyncpg.connect(db_url)
            try:
                result = await rescue_batch(conn, size=200)
                print(f"magellan_rescue: {result.to_dict() if hasattr(result, 'to_dict') else result}")
            finally:
                await conn.close()
            _mark_ran("magellan_rescue", "ok")
        except Exception as exc:
            print(f"magellan_rescue failed (non-fatal): {exc}")
            _mark_ran("magellan_rescue", "failed")

    # --- Knox adversarial review ---
    if not _already_ran("knox_review"):
        try:
            from fee_crawler.agents.knox.orchestrator import review_batch
            result = await review_batch(limit=500)
            print(f"knox_review: {result.to_dict()}")
            _mark_ran("knox_review", "ok")
        except Exception as exc:
            print(f"knox_review failed (non-fatal): {exc}")
            _mark_ran("knox_review", "failed")

    # --- Darwin drain (Roadmap #3) ---
    # Classifies fees_raw → fees_verified in up to 5 consecutive 500-row
    # batches (~2,500 rows/day), draining the ~102K backlog in ~41 days.
    # Runs BEFORE the 06:00 daily_pipeline so newly-classified fees land in
    # fees_verified in time for publish-fees to drain them through to
    # fees_published in the same UTC day. Kept in the 05:00 window on
    # purpose: no new cron slot.
    #
    # Circuit breakers (added per 2026-04-19 code review MAJOR-4):
    # - Per-batch cost accumulator; halts if a single run crosses
    #   DARWIN_DAILY_COST_LIMIT_USD (default $20).
    # - Per-batch failure counter; halts after 2 consecutive errors rather
    #   than marching through all 5 and burning budget on malformed output.
    # - Failed runs record status='failed' AND halt_reason so ops can see
    #   whether tomorrow's run should reset or hold.
    DARWIN_DAILY_COST_LIMIT_USD = float(
        os.environ.get("DARWIN_DAILY_COST_LIMIT_USD", "20")
    )
    DARWIN_MAX_CONSECUTIVE_FAILURES = 2
    if not _already_ran("darwin_drain"):
        from fee_crawler.agents.darwin import classify_batch

        total_classified = 0
        total_cost_usd = 0.0
        consecutive_failures = 0
        halt_reason: str | None = None

        conn = None
        try:
            conn = await asyncpg.connect(db_url)
            for i in range(5):
                try:
                    result = await classify_batch(conn, size=500)
                except Exception as batch_exc:
                    consecutive_failures += 1
                    print(
                        f"darwin_drain batch {i+1}/5 FAILED (#{consecutive_failures}): "
                        f"{batch_exc!r}"
                    )
                    if consecutive_failures >= DARWIN_MAX_CONSECUTIVE_FAILURES:
                        halt_reason = (
                            f"halt: {consecutive_failures} consecutive batch failures"
                        )
                        print(f"darwin_drain {halt_reason}")
                        break
                    continue

                consecutive_failures = 0
                summary = result.to_dict()
                print(f"darwin_drain batch {i+1}/5: {summary}")
                classified = int(summary.get("classified", 0) or 0)
                batch_cost = float(summary.get("cost_usd", 0) or 0)
                total_classified += classified
                total_cost_usd += batch_cost

                if classified == 0:
                    halt_reason = f"backlog exhausted after {i+1} batch(es)"
                    print(f"darwin_drain: {halt_reason}")
                    break
                if total_cost_usd >= DARWIN_DAILY_COST_LIMIT_USD:
                    halt_reason = (
                        f"halt: cost ${total_cost_usd:.4f} crossed "
                        f"${DARWIN_DAILY_COST_LIMIT_USD:.2f} daily limit"
                    )
                    print(f"darwin_drain {halt_reason}")
                    break

            print(
                f"darwin_drain total: {total_classified} rows classified, "
                f"${total_cost_usd:.4f} spent"
            )
            status = "failed" if consecutive_failures >= DARWIN_MAX_CONSECUTIVE_FAILURES else "ok"
            _mark_ran("darwin_drain", status)
        except Exception as exc:
            # Fatal (outside the per-batch try). Re-raise is too disruptive
            # for the shared dispatcher, but surface loudly and mark failed.
            print(f"darwin_drain FATAL: {exc!r}")
            _mark_ran("darwin_drain", "failed")
        finally:
            if conn is not None:
                await conn.close()


@app.function(
    schedule=modal.Cron("0 10 * * *"),
    timeout=7200,
    secrets=secrets,
)
def ingest_data():
    """Daily + weekly data refreshes. Weekly jobs run on Mondays."""
    import os
    from datetime import datetime, timezone
    env = {**os.environ, "DATABASE_URL": os.environ["DATABASE_URL"]}
    results = []
    failures = []

    # Daily: FRED, NYFED, BLS, OFR
    for cmd in ["ingest-fred", "ingest-nyfed", "ingest-bls", "ingest-ofr"]:
        try:
            run_checked(["python3", "-m", "fee_crawler", cmd], env=env)
            results.append(f"{cmd}: OK")
        except SubprocessFailed as exc:
            results.append(f"{cmd}: FAIL ({exc.returncode})")
            failures.append(cmd)

    # Weekly (Monday only): FDIC, NCUA, CFPB, SOD, Beige Book, Call Reports
    if datetime.now(timezone.utc).weekday() == 0:
        for cmd in ["ingest-fdic", "ingest-ncua", "ingest-cfpb", "ingest-sod",
                     "ingest-beige-book", "ingest-call-reports", "ingest-census-acs"]:
            try:
                run_checked(["python3", "-m", "fee_crawler", cmd], env=env)
                results.append(f"{cmd}: OK")
            except SubprocessFailed as exc:
                results.append(f"{cmd}: FAIL ({exc.returncode})")
                failures.append(cmd)

    # Quarterly (Feb 15, May 15, Aug 15, Nov 15): full FFIEC + NCUA ingestion
    # Runs on approximate FFIEC release dates (~45 days after quarter end).
    # No new cron added -- stays inside ingest_data to respect 5-cron limit.
    now = datetime.now(timezone.utc)
    is_quarterly = now.month in (2, 5, 8, 11) and now.day == 15
    if is_quarterly:
        for cmd in ["ingest-call-reports", "ingest-ncua"]:
            try:
                run_checked(["python3", "-m", "fee_crawler", cmd], env=env, timeout=3600)
                results.append(f"quarterly-{cmd}: OK")
            except SubprocessFailed as exc:
                results.append(f"quarterly-{cmd}: FAIL ({exc.returncode})")
                failures.append(f"quarterly-{cmd}")

    summary = "; ".join(results)
    # Mark BEFORE raising so the health dashboard sees partial-failure runs
    # as 'failed' rather than 'never ran'. A fully-clean run writes 'ok'.
    _mark_job_completion("ingest_data", "failed" if failures else "ok")
    if failures:
        raise RuntimeError(
            f"ingest_data: {len(failures)} ingestor(s) failed: "
            f"{', '.join(failures)}. Full summary: {summary}"
        )
    return summary


@app.function(timeout=300, secrets=secrets)
def check_integrity():
    """On-demand data integrity check."""
    from fee_crawler.workers.data_integrity import run_checks, print_report
    results = run_checks()
    report = print_report(results)
    print(report)
    return f"Score: {results['score']}% ({results['passed']}/{results['total']} passed)"


from pydantic import BaseModel as _BaseModel


class DiscoverRequest(_BaseModel):
    website_url: str
    institution_id: int | None = None


class StateAgentRequest(_BaseModel):
    state_code: str


class ExtractRequest(_BaseModel):
    target_id: int


class ExtractBatchRequest(_BaseModel):
    size: int = 100
    document_type: str | None = None  # "pdf" / "html" / None=both
    include_failing: bool = False


class AtlasDispatchRequest(_BaseModel):
    states_per_tick: int = 2
    size_per_state: int = 100
    only_states: list[str] | None = None  # restrict to subset, e.g. ["TX","CA"]
    force: bool = False                    # bypass once-per-day marker


class StateRunRequest(_BaseModel):
    state_code: str           # 2-letter, case-insensitive
    size: int = 100


@app.function(
    secrets=secrets,
    timeout=14400,
    memory=2048,
    image=browser_image,
)
@modal.fastapi_endpoint(method="POST")
async def atlas_dispatch(item: AtlasDispatchRequest) -> dict:
    """Manual Atlas tick — same code path as the per-minute dispatcher.

    Use when: you want to force-extract a specific state, drain a backlog
    faster than the per-minute pace, or smoke-test after deploy. force=true
    bypasses the once-per-day marker.
    """
    import os
    import asyncpg
    from fee_crawler.agents.atlas import dispatch_state_fleet

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        result = await dispatch_state_fleet(
            conn,
            states_per_tick=item.states_per_tick,
            size_per_state=item.size_per_state,
            only_states=item.only_states,
            force=item.force,
        )
        return {"ok": True, **result.to_dict()}
    finally:
        await conn.close()


@app.function(
    secrets=secrets,
    timeout=14400,
    memory=2048,
    image=browser_image,
)
@modal.fastapi_endpoint(method="POST")
async def state_run(item: StateRunRequest) -> dict:
    """Run extraction for one specific state under its state agent identity."""
    import os
    import asyncpg
    from fee_crawler.agents.state import run_state_agent

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        result = await run_state_agent(conn, item.state_code, size=item.size)
        return {"ok": True, **result.to_dict()}
    finally:
        await conn.close()


@app.function(
    secrets=secrets,
    timeout=14400,
    memory=2048,
    image=browser_image,
)
@modal.fastapi_endpoint(method="POST")
async def extract_batch_endpoint(item: ExtractBatchRequest) -> dict:
    """Manual trigger for the extractor agent (mirrors the nightly cron path).

    Use cases: re-run after a discovery sweep, smoke-test a fresh deploy,
    one-shot recrawl of a known-broken cohort. The body is the same code
    path as run_pdf_extraction / run_browser_extraction.
    """
    import os
    import asyncpg
    from fee_crawler.agents.extractor import extract_batch, ExtractorConfig

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        cfg = ExtractorConfig(
            document_type=item.document_type,
            include_failing=item.include_failing,
        )
        result = await extract_batch(conn, size=item.size, config=cfg)
        return {"ok": True, **result.to_dict()}
    finally:
        await conn.close()


@app.function(secrets=secrets, timeout=180, memory=2048, image=browser_image)
@modal.fastapi_endpoint(method="POST")
async def extract_single(item: ExtractRequest) -> dict:
    """HTTP endpoint to extract fees from a single institution by ID.

    Routes through the extractor agent (writes fees_raw via gateway).
    """
    import os
    import asyncpg
    from fee_crawler.agents.extractor import extract_batch, ExtractorConfig

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        cfg = ExtractorConfig(include_failing=True)
        result = await extract_batch(
            conn, size=1, config=cfg, target_ids=[item.target_id],
        )
        return {"ok": True, "target_id": item.target_id, **result.to_dict()}
    finally:
        await conn.close()


@app.function(secrets=secrets, timeout=120)
@modal.fastapi_endpoint(method="POST")
def discover_url(item: DiscoverRequest) -> dict:
    """HTTP endpoint for single-institution URL discovery."""
    from fee_crawler.pipeline.url_discoverer import UrlDiscoverer
    from fee_crawler.config import Config

    if not item.website_url:
        return {"found": False, "error": "website_url required"}

    config = Config()
    discoverer = UrlDiscoverer(config)
    result = discoverer.discover(item.website_url)

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


@app.function(secrets=secrets, timeout=7200, memory=2048, image=browser_image)
@modal.fastapi_endpoint(method="POST")
async def run_state_agent(item: StateAgentRequest) -> dict:
    """HTTP endpoint to extract every institution in a given state.

    Routes through the extractor agent (writes fees_raw via gateway).
    """
    import os
    import asyncpg
    from fee_crawler.agents.extractor import extract_batch, ExtractorConfig

    state_code = item.state_code.upper()
    if len(state_code) != 2:
        return {"error": "state_code must be a 2-letter code"}

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        cfg = ExtractorConfig(include_failing=True)
        result = await extract_batch(
            conn, size=10_000, config=cfg, state_code=state_code,
        )
        return {"ok": True, "state_code": state_code, **result.to_dict()}
    finally:
        await conn.close()


@app.function(secrets=secrets, timeout=600, image=browser_image, memory=2048)
@modal.fastapi_endpoint(method="POST")
async def generate_report(request: dict) -> dict:
    """Full report pipeline: assemble HTML via Next.js, render PDF, upload to R2.

    Accepts POST JSON: { job_id, report_type, params }
    Called by Next.js /api/reports/generate route.

    Status updates use HTTP calls to /api/reports/[id]/status (PATCH) instead of
    direct psycopg2 — browser_image containers can't reach Supabase via IPv6.
    """
    import os
    import json
    import urllib.request
    import urllib.error
    from fee_crawler.workers.report_render import render_and_store

    job_id = request.get("job_id", "")
    report_type = request.get("report_type", "")
    params = request.get("params", {})

    if not job_id or not report_type:
        return {"error": "job_id and report_type are required", "status": "error"}

    app_url = os.environ.get("BFI_APP_URL", "https://feeinsight.com").rstrip("/")
    internal_secret = os.environ.get("REPORT_INTERNAL_SECRET", "")
    if not internal_secret:
        return {"error": "REPORT_INTERNAL_SECRET not set", "status": "error"}

    def _update_status(status, artifact_key=None, error=None):
        """Update job status via Vercel API instead of direct DB."""
        body = {"status": status}
        if artifact_key:
            body["artifact_key"] = artifact_key
        if error:
            body["error"] = error[:500]
        req = urllib.request.Request(
            f"{app_url}/api/reports/{job_id}/status",
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "X-Internal-Secret": internal_secret,
            },
            method="PATCH",
        )
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception as e:
            print(f"[generate_report] status update to '{status}' failed: {e}")

    try:
        # Step 1: Call Next.js assemble endpoint to get HTML
        # assembleAndRender sets status to 'assembling' internally
        assemble_url = f"{app_url}/api/reports/{job_id}/assemble"
        payload = json.dumps(params).encode()

        req = urllib.request.Request(
            assemble_url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Internal-Secret": internal_secret,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                body = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode()[:500]
            raise RuntimeError(
                f"Assemble endpoint returned {exc.code}: {error_body}"
            ) from exc

        html = body.get("html", "")
        if not html:
            raise ValueError("Assemble endpoint returned empty HTML")

        # Step 2: Render PDF and upload to R2
        _update_status("rendering")
        key = await render_and_store(html, job_id, report_type)

        # Step 3: Mark complete
        _update_status("complete", artifact_key=key)
        return {"key": key, "status": "complete"}
    except Exception as exc:
        _update_status("failed", error=str(exc)[:500])
        raise


@app.function(
    # Cron removed — Modal free tier limited to 5 cron jobs.
    # Trigger manually from /admin/hamilton or merge with existing cron.
    timeout=60,
    secrets=secrets,
)
def run_monthly_pulse():
    """Manual-only trigger for the monthly pulse report.

    NOT scheduled. Modal free tier is capped at 5 cron jobs and all five
    slots are taken by run_discovery, run_pdf_extraction, run_browser_extraction,
    run_post_processing, and ingest_data. Invoke this function manually:

        modal run fee_crawler/modal_app.py::run_monthly_pulse

    Or trigger from /admin/hamilton. Reads BFI_APP_URL (the same env var
    used by the rest of the report stack — see src/app/api/reports/*).
    """
    import os
    import json
    import urllib.request
    import urllib.error
    from datetime import datetime, timezone

    app_url = os.environ.get("BFI_APP_URL", "")
    cron_secret = os.environ.get("REPORT_CRON_SECRET", "")
    if not app_url:
        return {"triggered": False, "error": "BFI_APP_URL not set"}
    if not cron_secret:
        return {"triggered": False, "error": "REPORT_CRON_SECRET not set"}

    endpoint = f"{app_url.rstrip('/')}/api/reports/generate"
    payload = json.dumps({"report_type": "monthly_pulse"}).encode()

    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Cron-Secret": cron_secret,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
            period = datetime.now(timezone.utc).strftime("%B %Y")
            return {"triggered": True, "job_id": body.get("jobId"), "period": period}
    except urllib.error.HTTPError as exc:
        return {"triggered": False, "error": exc.read().decode()[:500], "status_code": exc.code}
    except Exception as exc:
        return {"triggered": False, "error": str(exc)[:500]}


# ----------------------------------------------------------------------
# Darwin v1 — nightly drain + sidecar web endpoint
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=3600,
)
async def darwin_nightly_drain():
    """Drain up to 500 unpromoted fees_raw rows via Darwin classifier.

    Manual only — `modal run fee_crawler/modal_app.py::darwin_nightly_drain`.
    Not scheduled because the Modal free-plan cron limit (5) is saturated."""
    import asyncpg
    import os
    import logging

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger(__name__)

    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        from fee_crawler.agents.darwin import classify_batch

        result = await classify_batch(conn, size=500)
        log.info("darwin nightly drain: %s", result.to_dict())
    finally:
        await conn.close()


@app.function(
    image=image,
    secrets=secrets,
    timeout=600,
    min_containers=1,  # avoid cold-start on UI clicks
)
@modal.asgi_app()
def darwin_api():
    """Serve FastAPI sidecar as a Modal web endpoint."""
    from fee_crawler.darwin_api import app as fastapi_app

    return fastapi_app


# ----------------------------------------------------------------------
# Magellan v1 — coverage rescue web endpoint
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=600,
    min_containers=1,
)
@modal.asgi_app()
def magellan_api():
    """Serve Magellan FastAPI sidecar as a Modal web endpoint."""
    from fee_crawler.magellan_api import app as fastapi_app
    return fastapi_app


# ----------------------------------------------------------------------
# Ops generic runner — invoked from Next.js /admin/ops buttons.
# Replaces the old child_process.spawn path that can't run on Vercel.
# ----------------------------------------------------------------------

@app.function(
    image=image,
    secrets=secrets,
    timeout=7200,  # 2h max for long crawls
    memory=2048,
)
def ops_run_command(command: str, args: list[str], job_id: int) -> dict:
    """Run `python -m fee_crawler <command> <args>` and update ops_jobs row.

    Called via spawn from the web endpoint below. Not web-accessible directly.
    """
    import os
    import json
    import psycopg2

    dsn = os.environ["DATABASE_URL"]

    def _update(status: str, result: dict | None = None, error: str | None = None):
        try:
            conn = psycopg2.connect(dsn)
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE ops_jobs
                          SET status = %s,
                              result_json = COALESCE(%s::JSONB, result_json),
                              error = %s,
                              updated_at = NOW()
                        WHERE id = %s""",
                    (status, json.dumps(result) if result else None, error, job_id),
                )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"ops_jobs update failed job={job_id} status={status}: {e}")

    _update("running")
    try:
        env = {**os.environ, "DATABASE_URL": dsn}
        result = run_checked(
            ["python3", "-m", "fee_crawler", command, *args],
            env=env, timeout=7000,
        )
        stdout_tail = (result.stdout or "")[-2000:]
        _update("completed", result={"stdout_tail": stdout_tail, "returncode": result.returncode})
        return {"status": "completed", "returncode": result.returncode, "stdout_tail": stdout_tail}
    except Exception as e:
        _update("failed", error=str(e)[:500])
        raise


class RunCommandRequest(_BaseModel):
    """Body of POST /ops/run_command."""
    command: str
    args: list[str] = []
    job_id: int


@app.function(
    image=image,
    secrets=secrets,
    timeout=60,
)
@modal.fastapi_endpoint(method="POST")
def ops_run(request: RunCommandRequest) -> dict:
    """Web endpoint — fires ops_run_command in the background, returns immediately."""
    call = ops_run_command.spawn(request.command, request.args, request.job_id)
    return {"ok": True, "call_id": call.object_id, "job_id": request.job_id}
