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

    pass_info = (
        f" -- Pass {stats['pass_number']} ({stats['strategy']})"
        if stats.get("pass_number")
        else ""
    )
    coverage_info = (
        f" | Coverage: {stats['coverage_pct']:.1f}%"
        if stats.get("coverage_pct") is not None
        else ""
    )
    block = f"\n## Run #{run_id}{pass_info} — {date.today().isoformat()}\n"
    block += f"Discovered: {stats.get('discovered', 0)} | Extracted: {stats.get('extracted', 0)} | Failed: {stats.get('failed', 0)}{coverage_info}\n"

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


def append_coverage_note(
    state_code: str,
    run_id: int,
    coverage_pct: float,
    coverage_delta: float,
) -> None:
    """Append a coverage annotation to the most recent run block in a state file.

    Called by the wave orchestrator AFTER run_state_agent() returns, once it has
    computed pre/post coverage from the DB. Keeps orchestrator-level metrics
    out of state_agent (single responsibility).
    """
    state_path = KNOWLEDGE_DIR / "states" / f"{state_code}.md"
    if not state_path.exists():
        log.warning("Cannot append coverage note — %s does not exist", state_path)
        return

    sign = "+" if coverage_delta >= 0 else ""
    note = f"Coverage after pass: {coverage_pct:.1f}% ({sign}{coverage_delta:.1f}% delta)\n"

    content = state_path.read_text()
    marker = f"## Run #{run_id}"
    idx = content.rfind(marker)

    if idx == -1:
        # Fallback: append at end of file
        with open(state_path, "a") as f:
            f.write(note)
        log.info(
            "Coverage note appended at end for %s run #%d (marker not found)",
            state_code, run_id,
        )
        return

    # Insert after the stats line (second line of the run block)
    header_end = content.index("\n", idx) + 1        # end of "## Run #N..." line
    stats_line_end = content.index("\n", header_end) # end of "Discovered: ..." line
    insert_at = stats_line_end + 1

    updated = content[:insert_at] + note + content[insert_at:]
    state_path.write_text(updated)
    log.info(
        "Coverage note added for %s run #%d: %.1f%% (%s%.1f%%)",
        state_code, run_id, coverage_pct, sign, coverage_delta,
    )


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
