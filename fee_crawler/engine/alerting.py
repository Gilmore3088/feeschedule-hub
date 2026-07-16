"""Failure alerting — loud, not silent (audit gap: no alerting anywhere).

An Alerter delivers a message to whatever channels are configured via env:
  - Sentry     (SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN)
  - Slack      (SLACK_WEBHOOK_URL)
  - stderr log (always, as a floor)

Wired into two places:
  - the worker runtime, when a job exhausts retries and goes `dead`
  - the national roll-up / supervisor, when a pipeline_run fails or is reaped

Best-effort: an alerting failure never masks or replaces the original error.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

log = logging.getLogger("engine.alerting")


class Alerter:
    def __init__(
        self,
        *,
        slack_webhook: Optional[str] = None,
        sentry_dsn: Optional[str] = None,
        enabled: bool = True,
    ):
        self._slack = slack_webhook or os.environ.get("SLACK_WEBHOOK_URL")
        self._sentry = sentry_dsn or os.environ.get("SENTRY_DSN") or os.environ.get(
            "NEXT_PUBLIC_SENTRY_DSN"
        )
        self._enabled = enabled

    async def alert(self, subject: str, body: str = "", *, level: str = "error") -> None:
        log.log(logging.ERROR if level == "error" else logging.WARNING, "%s — %s", subject, body)
        if not self._enabled:
            return
        # Fan out; never let a channel error escape.
        if self._sentry:
            try:
                self._to_sentry(subject, body, level)
            except Exception as exc:  # pragma: no cover - depends on sentry_sdk
                log.warning("sentry alert failed: %s", exc)
        if self._slack:
            try:
                await self._to_slack(subject, body)
            except Exception as exc:  # pragma: no cover - depends on network
                log.warning("slack alert failed: %s", exc)

    def _to_sentry(self, subject: str, body: str, level: str) -> None:  # pragma: no cover
        import sentry_sdk

        sentry_sdk.init(self._sentry)
        sentry_sdk.capture_message(f"{subject}\n{body}", level=level)

    async def _to_slack(self, subject: str, body: str) -> None:  # pragma: no cover
        import httpx

        text = f":rotating_light: *{subject}*\n{body}" if body else f":rotating_light: {subject}"
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(self._slack, content=json.dumps({"text": text}),
                         headers={"content-type": "application/json"})


# Module-level default so callers can `from .alerting import default_alerter`.
default_alerter = Alerter()


async def alert_dead_job(alerter: Alerter, job, error: str) -> None:
    await alerter.alert(
        f"[engine] job dead: {job['queue']} {job['entity_id']}",
        f"attempts={job['attempts']} state={job['state_code']} run_id={job['run_id']}\n{error}",
    )
