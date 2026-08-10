"""Canonical-key classifier for the verify stage.

Wraps the existing Darwin classifier brain (agents/darwin/classifier.py) — its
LLM prompt, retry/backoff, and canonical-key validation — behind the engine's
Classifier protocol, so Darwin (the verify worker) can assign canonical_fee_key
without the legacy orchestrator/dispatch scaffolding.

Falls back to None (fee gets flagged as `unclassified`, never silently dropped)
if the classifier is unavailable.
"""

from __future__ import annotations

from typing import Any, Optional


class DarwinClassifier:
    """Engine adapter over agents.darwin.classifier.classify_names_with_retry."""

    def __init__(self, config: Any = None):
        self._config = config

    async def classify(self, fee: dict[str, Any]) -> Optional[str]:
        name = (fee.get("fee_name") or "").strip()
        if not name:
            return None
        try:
            from ..agents.darwin.classifier import classify_names_with_retry
            from ..agents.darwin.config import DarwinConfig  # type: ignore

            config = self._config or DarwinConfig()
            results = await classify_names_with_retry([name], config)
        except Exception:
            return None
        # classify_names_with_retry returns a list of dicts keyed by name ->
        # canonical key; be tolerant of shape.
        if not results:
            return None
        first = results[0]
        if isinstance(first, dict):
            return first.get("canonical_key") or first.get("key") or None
        return str(first) or None


class NullClassifier:
    """No-op classifier: everything is left unclassified (-> flagged for review).
    Used when Darwin's LLM path is unavailable in a given environment."""

    async def classify(self, fee: dict[str, Any]) -> Optional[str]:
        return None
