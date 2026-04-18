"""Rung protocol + result shape. All 5 rungs implement Rung."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol


@dataclass
class _Target:
    """Minimal target shape handed to each rung."""
    id: int
    fee_schedule_url: str
    institution_name: Optional[str] = None
    charter_type: Optional[str] = None


@dataclass
class RungResult:
    """One rung's output."""
    fees: list[dict] = field(default_factory=list)
    text: str = ""
    http_status: Optional[int] = None
    error: Optional[str] = None
    cost_usd: float = 0.0
    duration_s: float = 0.0


@dataclass
class _Context:
    """Shared context passed to each rung."""
    extra: dict[str, Any] = field(default_factory=dict)


class Rung(Protocol):
    name: str

    async def run(self, target: _Target, context: _Context) -> RungResult: ...
