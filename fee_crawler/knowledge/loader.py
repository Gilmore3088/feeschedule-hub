"""Load and write knowledge files for state agents."""

import os
import json
import logging
from datetime import date
from pathlib import Path

log = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).parent


def load_knowledge(state_code: str) -> str:
    """Load national + state knowledge as context string for the agent."""
    sections = []

    national_path = KNOWLEDGE_DIR / "national.md"
    if national_path.exists():
        content = national_path.read_text().strip()
        if content:
            sections.append(content)

    state_path = KNOWLEDGE_DIR / "states" / f"{state_code}.md"
    if state_path.exists():
        content = state_path.read_text().strip()
        if content:
            sections.append(content)

    if not sections:
        return ""

    return "\n\n---\n\n".join(sections)


def write_learnings(
    state_code: str,
    run_id: int,
    stats: dict,
    learnings: list[dict],
):
    """Append run learnings to state knowledge file."""
    state_path = KNOWLEDGE_DIR / "states" / f"{state_code}.md"

    if not state_path.exists():
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(f"# {state_code} Fee Schedule Knowledge\n\n")

    patterns = [l["pattern"] for l in learnings if l.get("pattern")]
    site_notes = [l["site_note"] for l in learnings if l.get("site_note")]
    nationals = [l["national"] for l in learnings if l.get("national")]

    block = f"\n## Run #{run_id} — {date.today().isoformat()}\n"
    block += f"Discovered: {stats.get('discovered', 0)} | Extracted: {stats.get('extracted', 0)} | Failed: {stats.get('failed', 0)}\n"

    if patterns:
        block += "\n### New Patterns\n"
        block += "\n".join(f"- {p}" for p in patterns) + "\n"

    if site_notes:
        block += "\n### Site Notes\n"
        block += "\n".join(f"- {n}" for n in site_notes) + "\n"

    if nationals:
        block += "\n### Promoted to National\n"
        block += "\n".join(f"- {n}" for n in nationals) + "\n"
        _promote_to_national(nationals)
    else:
        block += "\n### Promoted to National\n- None\n"

    with open(state_path, "a") as f:
        f.write(block)

    log.info(f"Wrote {len(learnings)} learnings to {state_path}")


def _promote_to_national(patterns: list[str]):
    """Append patterns to national knowledge file."""
    national_path = KNOWLEDGE_DIR / "national.md"

    if not national_path.exists():
        national_path.write_text("# National Fee Schedule Knowledge Base\n\n")

    with open(national_path, "a") as f:
        f.write(f"\n## Promoted — {date.today().isoformat()}\n")
        f.write("\n".join(f"- {p}" for p in patterns) + "\n")


def get_run_count(state_code: str) -> int:
    """Count how many runs are recorded in the state knowledge file."""
    state_path = KNOWLEDGE_DIR / "states" / f"{state_code}.md"
    if not state_path.exists():
        return 0
    content = state_path.read_text()
    return content.count("## Run #")


def get_known_failures(state_code: str) -> list[str]:
    """Extract institution names known to not publish online from knowledge file."""
    state_path = KNOWLEDGE_DIR / "states" / f"{state_code}.md"
    if not state_path.exists():
        return []

    content = state_path.read_text().lower()
    failures = []

    # Look for patterns like "institution_name: ... likely in-branch only" or "no fee content"
    for line in content.split("\n"):
        if "in-branch only" in line or "no website" in line or "no fee content" in line or "doesn't publish" in line:
            # Extract institution name (text before the colon)
            if ":" in line:
                name = line.split(":")[0].strip().lstrip("- ")
                if name and len(name) > 3:
                    failures.append(name)

    return failures
