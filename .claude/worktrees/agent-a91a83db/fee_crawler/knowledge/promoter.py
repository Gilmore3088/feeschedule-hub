"""Cross-state pattern promotion: automatically elevate patterns to national.md."""

import logging
from datetime import date
from pathlib import Path

log = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).parent

# Pattern lines start with "- " inside "### New Patterns" blocks
_PATTERN_PREFIX = "- "


def promote_cross_state_patterns(min_states: int = 3) -> int:
    """Scan all state knowledge files and promote patterns seen in min_states+ states.

    A "pattern" is any bullet line (starting with "- ") found inside a
    "### New Patterns" section of a state knowledge file. Lines are matched
    exactly after stripping leading/trailing whitespace.

    Patterns already present verbatim in national.md are skipped (dedup).

    Returns the count of newly promoted patterns.
    """
    states_dir = KNOWLEDGE_DIR / "states"
    if not states_dir.exists():
        log.info("No states directory — skipping cross-state promotion")
        return 0

    # Step 1: collect patterns from each state file
    state_patterns: dict[str, set[str]] = {}  # state_code -> set of pattern strings
    for state_file in sorted(states_dir.glob("*.md")):
        state_code = state_file.stem
        patterns = _extract_patterns(state_file)
        if patterns:
            state_patterns[state_code] = patterns

    if not state_patterns:
        log.info("No patterns found in any state files")
        return 0

    # Step 2: count how many states each pattern appears in
    pattern_state_count: dict[str, int] = {}
    for patterns in state_patterns.values():
        for p in patterns:
            pattern_state_count[p] = pattern_state_count.get(p, 0) + 1

    # Step 3: filter to patterns meeting the threshold
    candidates = [
        p for p, count in pattern_state_count.items()
        if count >= min_states
    ]

    if not candidates:
        log.info(
            "No patterns appear in %d+ states — nothing to promote",
            min_states,
        )
        return 0

    # Step 4: deduplicate against what is already in national.md.
    # national.md uses ## headers (not ### New Patterns), so we scan all bullet
    # lines rather than section-scoped extraction used for state files.
    national_path = KNOWLEDGE_DIR / "national.md"
    existing: set[str] = set()
    if national_path.exists():
        existing = _extract_all_bullets(national_path)

    to_promote = [p for p in candidates if p not in existing]

    if not to_promote:
        log.info(
            "%d candidate(s) already in national.md — nothing new to promote",
            len(candidates),
        )
        return 0

    # Step 5: append to national.md
    if not national_path.exists():
        national_path.write_text("# National Fee Schedule Knowledge Base\n\n")

    state_counts_str = ", ".join(
        f"{p!r} ({pattern_state_count[p]} states)" for p in to_promote[:5]
    )
    log.info(
        "Promoting %d pattern(s) to national.md (threshold=%d): %s%s",
        len(to_promote),
        min_states,
        state_counts_str,
        " ..." if len(to_promote) > 5 else "",
    )

    with open(national_path, "a") as f:
        f.write(f"\n## Cross-State Promotion — {date.today().isoformat()}\n")
        f.write(f"Patterns seen in {min_states}+ states:\n")
        for p in sorted(to_promote):
            count = pattern_state_count[p]
            f.write(f"- {p}  [{count} states]\n")

    # Step 6: auto-prune national if it is large after promotion
    from fee_crawler.knowledge.pruner import should_prune_national, prune_national
    if should_prune_national():
        log.info("Auto-pruning national.md after promotion...")
        prune_national()

    return len(to_promote)


def _extract_all_bullets(file_path: Path) -> set[str]:
    """Extract all bullet lines from any section of a knowledge file.

    Used for national.md dedup: promotion blocks use ## headers, not ### New Patterns,
    so section-scoped extraction would miss already-promoted patterns.
    Returns a set of stripped pattern strings (without the leading "- ").
    """
    patterns: set[str] = set()
    try:
        for line in file_path.read_text().splitlines():
            stripped = line.strip()
            if stripped.startswith("- "):
                pattern = stripped[2:].strip()
                # Strip trailing state count annotations like "  [3 states]"
                if "  [" in pattern:
                    pattern = pattern[:pattern.index("  [")].strip()
                if pattern:
                    patterns.add(pattern)
    except OSError:
        log.warning("Could not read %s for bullet extraction", file_path)
    return patterns


def _extract_patterns(file_path: Path) -> set[str]:
    """Extract bullet lines from '### New Patterns' sections of a knowledge file.

    Only reads lines within a New Patterns section (stops at next ### header).
    Returns a set of stripped pattern strings (without the leading "- ").
    """
    patterns: set[str] = set()
    in_section = False

    try:
        for line in file_path.read_text().splitlines():
            stripped = line.strip()
            if stripped == "### New Patterns":
                in_section = True
                continue
            if in_section:
                if stripped.startswith("###"):
                    in_section = False
                    continue
                if stripped.startswith("- "):
                    pattern = stripped[2:].strip()
                    if pattern:
                        patterns.add(pattern)
    except OSError:
        log.warning("Could not read %s for pattern extraction", file_path)

    return patterns
