"""The cast — personified agents of the ingestion engine.

Each capability worker and orchestrator has a persona, continuing the existing
Darwin / Knox / Magellan naming. The persona is the agent's identity in logs,
worker ids, Modal function labels, and dashboards, so operators reason about
"Rosetta is backed up" rather than "the read queue is deep."

    Magellan  — the Navigator.  Fetches each institution's document, escalating
                http -> browser, and rescues dead URLs. (queue: fetch)
    Rosetta   — the Decipherer. Turns raw bytes into clean text, escalating
                text-extraction -> OCR. (queue: read)
    Knox      — the Extractor.  Pulls structured fees from text into fees_raw.
                (queue: extract)
    Darwin    — the Verifier.   Classifies fees to the canonical taxonomy and
                gates them (rules + review) into fees_verified. (queue: verify)
    Steward   — the Keeper.      One per state; owns its territory's work-list and
                accumulates local knowledge that compounds each cycle.
    Atlas     — the Cartographer. Assembles every state's verified fees into the
                national index and publishes it atomically.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Persona:
    name: str
    role: str
    queue: str  # "" for orchestrators that don't drain a queue


MAGELLAN = Persona("Magellan", "Navigator — fetch", "fetch")
ROSETTA = Persona("Rosetta", "Decipherer — read", "read")
KNOX = Persona("Knox", "Extractor — extract", "extract")
DARWIN = Persona("Darwin", "Verifier — verify", "verify")
STEWARD = Persona("Steward", "Keeper — per-state supervisor", "")
ATLAS = Persona("Atlas", "Cartographer — national publish", "")

CAST = (MAGELLAN, ROSETTA, KNOX, DARWIN, STEWARD, ATLAS)

BY_QUEUE = {p.queue: p for p in CAST if p.queue}


def persona_for(queue: str) -> Persona:
    """The persona that drains a given queue."""
    return BY_QUEUE[queue]
