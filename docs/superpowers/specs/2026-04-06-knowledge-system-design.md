# Compounding Knowledge System Design

Add a knowledge layer to the state agent that compounds learnings across runs and states. Agents read knowledge before running and write learnings after. Periodic pruning keeps files manageable, with retired knowledge archived for reference.

## Problem

Each agent run starts from scratch — no memory of what worked or failed before. This wastes API calls rediscovering patterns (e.g., "this site is JS-rendered", "this CU doesn't publish online") and repeating failed approaches.

## Solution

Markdown knowledge files at two levels (national + state), read before each run, appended after each run, pruned periodically, with retired entries archived.

## File Structure

```
fee_crawler/knowledge/
  national.md              <- universal patterns (all states)
  states/
    WY.md                  <- Wyoming-specific learnings
    MT.md                  <- Montana-specific learnings
    ...
  retired/
    national.md            <- pruned national entries (archive)
    states/
      WY.md               <- pruned WY entries (archive)
      MT.md
```

## Knowledge File Format

### National Knowledge (`national.md`)

```markdown
# National Fee Schedule Knowledge Base

## CMS & Platform Patterns
- WordPress sites: fee schedules often at /wp-content/uploads/fee-schedule.pdf
- Kentico CMS: pages are JS-rendered, always use Playwright
- Wix/Squarespace: PDFs hosted on CDN, check document links

## Document Type Handling
- Scanned PDFs: pdfplumber returns empty, need OCR fallback
- Accordion pages: Playwright must click expand buttons before extracting text
- Link index pages (like Space Coast): follow sub-links to actual fee content

## Discovery Patterns
- ~40% of bank sites are JS-rendered, need Playwright for discovery
- Fee schedules are often 3-4 clicks deep under Disclosures/Resources
- Always check /disclosures page and scan all PDFs there
- Small community banks (<$1M assets) often don't publish online

## Common Failure Modes
- "Download is starting" Playwright error: URL is a direct PDF download, use requests instead
- Sites with only privacy/terms disclosures but no fee schedule
- Trust companies don't have consumer fee schedules
```

### State Knowledge (`states/WY.md`)

```markdown
# Wyoming Fee Schedule Knowledge

## Run History
Total runs: 3 | Last run: 2026-04-06 | Coverage: 25/43 (58%)

## Run #8 — 2026-04-06
Discovered: 3 | Extracted: 24 | Failed: 19

### New Patterns
- Sundance State Bank: 4KB homepage, fully JS-rendered. /documents page empty via basic fetch.
- Wyoming community CUs (<$0.5M assets) rarely publish fee schedules online.

### Site Notes
- statebankwy.com: Navigated /personal, /about, /disclosures — no fee content. Likely in-branch only.
- acpefcu.com: Fee schedule at /rates/fee-schedule/ (HTML, 52 fees extracted)
- bluefcu.com: PDF at /wp-content/uploads/...pdf but mostly rate tables, only 1 fee extracted

### Promoted to National
- None (first state)

## Institutions Without Fee Schedules Online
- Bank Of Jackson Hole Trust (trust company, not consumer bank)
- Guernsey Community FCU (no website)
- Cheyenne State Bank, Cowboy State Bank, State Bank (minimal sites, no disclosures)
- [12 total — see agent_run_results for full list]
```

### Retired Knowledge (`retired/states/WY.md`)

```markdown
# Wyoming — Retired Knowledge

## Pruned 2026-07-06 (after run #10)

### Removed Patterns
- [pattern that was superseded or resolved]

### Removed Site Notes
- [institution note that's no longer relevant — e.g., site was redesigned]
```

## Agent Integration

### Before Each Run

The state agent reads two knowledge files and injects them as context for the discovery AI:

```python
def _load_knowledge(state_code: str) -> str:
    """Load national + state knowledge as context string."""
    knowledge = []
    
    national_path = Path("fee_crawler/knowledge/national.md")
    if national_path.exists():
        knowledge.append(national_path.read_text())
    
    state_path = Path(f"fee_crawler/knowledge/states/{state_code}.md")
    if state_path.exists():
        knowledge.append(state_path.read_text())
    
    return "\n\n---\n\n".join(knowledge)
```

This context is passed to the discovery agent's Claude prompt so it knows:
- Which institutions are known to not publish online (skip expensive discovery)
- Which sites need Playwright (don't waste time with basic HTTP)
- CMS-specific tricks that worked before
- Common patterns for this state

### After Each Run

The agent appends a structured learning block to the state knowledge file:

```python
def _write_learnings(state_code: str, run_id: int, stats: dict, learnings: list[dict]):
    """Append run learnings to state knowledge file."""
    state_path = Path(f"fee_crawler/knowledge/states/{state_code}.md")
    
    # Create file with header if it doesn't exist
    if not state_path.exists():
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(f"# {state_code} Fee Schedule Knowledge\n\n")
    
    block = f"""
## Run #{run_id} — {date.today().isoformat()}
Discovered: {stats['discovered']} | Extracted: {stats['extracted']} | Failed: {stats['failed']}

### New Patterns
{chr(10).join('- ' + l['pattern'] for l in learnings if l.get('pattern'))}

### Site Notes
{chr(10).join('- ' + l['site_note'] for l in learnings if l.get('site_note'))}

### Promoted to National
{chr(10).join('- ' + l['national'] for l in learnings if l.get('national')) or '- None'}
"""
    
    with open(state_path, "a") as f:
        f.write(block)
```

### Learning Generation

After processing each institution, the agent generates learnings by asking Claude:

```
Given what happened with this institution:
- Institution: {name} ({charter_type})
- Website: {url}
- Discovery method: {method} (or failed: {reason})
- Document type: {doc_type}
- Fees extracted: {count}
- Validation quality: {quality}

What should we remember for next time? Return JSON:
{"pattern": "optional general pattern", "site_note": "optional institution-specific note", "national": "optional pattern to promote to national knowledge"}
```

This runs once per institution as part of the validate stage. Cost: ~$0.001 per institution (Haiku).

### National Promotion

If the agent sees the same pattern appearing in 3+ states' knowledge files, it auto-promotes to national. Check happens during pruning.

## Pruning

### Trigger
- **State files:** After every 5th run for that state (count `## Run #` headers)
- **National file:** After every 10 state runs across all states (count total runs in all state files)

### Process
1. Read the full knowledge file
2. Send to Claude: "Condense this knowledge file. Keep actionable patterns, site-specific notes for active institutions, and failure notes for institutions still without fees. Remove redundant entries, resolved patterns (institutions that now have fees), and stale information. Target 50% reduction."
3. Claude returns the condensed version
4. Diff the old and new — anything removed gets appended to the corresponding `retired/` file with a pruning timestamp
5. Write the condensed version back

### Retired File Format

```markdown
## Pruned YYYY-MM-DD

[removed content with original timestamps preserved]
```

## Discovery Agent Changes

The discovery agent (`fee_crawler/agents/discover.py`) needs two changes:

1. **Accept knowledge context** — `discover_url()` gets an optional `knowledge: str` parameter. When present, it's included in Claude's system prompt for navigation decisions.

2. **Skip known failures** — if the knowledge file says an institution doesn't publish online, skip discovery entirely (record as "skipped_known" instead of running 15 page loads).

## State Agent Changes

The orchestrator (`fee_crawler/agents/state_agent.py`) needs:

1. **Load knowledge** before the institution loop
2. **Collect learnings** per institution during processing
3. **Write learnings** after the loop completes
4. **Check pruning threshold** and prune if needed
5. **Pass knowledge to discovery agent** as context

## File Changes

```
fee_crawler/
  knowledge/
    __init__.py           <- Package init
    loader.py             <- Load/write knowledge files
    pruner.py             <- Pruning logic + retired archive
    national.md           <- Seeded with learnings from WY+MT pilot
    states/
      WY.md               <- Seeded with WY learnings
      MT.md               <- Seeded with MT learnings
    retired/
      national.md          <- Empty initially
      states/              <- Empty initially
  agents/
    state_agent.py         <- Modify: integrate knowledge loading/writing
    discover.py            <- Modify: accept knowledge context, skip known failures
```

## Seeding

Pre-populate `national.md` and `states/WY.md` and `states/MT.md` from the learnings captured in `docs/solutions/crawl-pipeline/state-agent-e2e-learnings-20260406.md`. This gives the system a head start instead of learning from scratch.

## Admin UI

Add to the Agent tab in FeeScout:
- "Knowledge" section showing the current state knowledge file
- "Needs Manual Review" list of institutions where the agent couldn't find a fee schedule
- Both visible after selecting a state, before or after running the agent

## Scope

Building:
- Knowledge file structure (national + state + retired)
- Loader module (read before run)
- Writer module (append after run)
- Pruner module (condense + archive)
- Learning generation (Claude call per institution)
- Discovery integration (knowledge as context, skip known failures)
- State agent integration (load/write/prune lifecycle)
- Seed files from existing learnings
- Admin UI: knowledge viewer + manual review list

Not building:
- National orchestrator (future — manages 50 state agents)
- Scheduled runs (future — cron-based state rotation)
- Cross-state pattern promotion (future — analyze all state files for common patterns)
