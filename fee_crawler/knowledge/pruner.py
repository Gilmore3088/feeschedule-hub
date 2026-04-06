"""Prune knowledge files and archive retired entries."""

import os
import logging
from datetime import date
from pathlib import Path

import anthropic

log = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).parent
PRUNE_STATE_EVERY = 5    # runs
PRUNE_NATIONAL_EVERY = 10  # total runs across all states


def should_prune_state(state_code: str) -> bool:
    """Check if state knowledge file needs pruning."""
    from fee_crawler.knowledge.loader import get_run_count
    count = get_run_count(state_code)
    return count > 0 and count % PRUNE_STATE_EVERY == 0


def should_prune_national() -> bool:
    """Check if national knowledge file needs pruning."""
    states_dir = KNOWLEDGE_DIR / "states"
    if not states_dir.exists():
        return False

    total_runs = 0
    for f in states_dir.glob("*.md"):
        content = f.read_text()
        total_runs += content.count("## Run #")

    return total_runs > 0 and total_runs % PRUNE_NATIONAL_EVERY == 0


def prune_file(file_path: Path, retired_path: Path):
    """Condense a knowledge file and archive removed content."""
    if not file_path.exists():
        return

    original = file_path.read_text()
    if len(original) < 500:
        log.info(f"Skipping prune of {file_path} — too short ({len(original)} chars)")
        return

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system="""You condense knowledge files for a fee schedule crawling agent.

Rules:
- Keep actionable patterns that help discover/extract fee schedules
- Keep site-specific notes for institutions that still need attention
- Remove redundant entries (same pattern stated multiple times)
- Remove resolved entries (institutions that now have fees)
- Keep the most recent run summary, archive older ones
- Preserve the markdown structure (headers, lists)
- Target ~50% reduction in length

Return ONLY the condensed content. No explanation.""",
        messages=[{
            "role": "user",
            "content": f"Condense this knowledge file:\n\n{original}",
        }],
        timeout=60,
    )

    condensed = "".join(b.text for b in response.content if b.type == "text")

    # Find what was removed
    original_lines = set(original.strip().split("\n"))
    condensed_lines = set(condensed.strip().split("\n"))
    removed_lines = original_lines - condensed_lines

    # Archive removed content
    if removed_lines:
        retired_path.parent.mkdir(parents=True, exist_ok=True)
        with open(retired_path, "a") as f:
            f.write(f"\n## Pruned {date.today().isoformat()}\n\n")
            for line in sorted(removed_lines):
                if line.strip():
                    f.write(line + "\n")
            f.write("\n")

    # Write condensed version
    file_path.write_text(condensed)

    log.info(
        f"Pruned {file_path}: {len(original)} -> {len(condensed)} chars "
        f"({len(removed_lines)} lines retired)"
    )


def prune_state(state_code: str):
    """Prune a state knowledge file."""
    file_path = KNOWLEDGE_DIR / "states" / f"{state_code}.md"
    retired_path = KNOWLEDGE_DIR / "retired" / "states" / f"{state_code}.md"
    prune_file(file_path, retired_path)


def prune_national():
    """Prune the national knowledge file."""
    file_path = KNOWLEDGE_DIR / "national.md"
    retired_path = KNOWLEDGE_DIR / "retired" / "national.md"
    prune_file(file_path, retired_path)
