"""Article generation orchestrator.

Pipeline: query data -> build prompts -> call Claude -> assemble -> validate -> store.
"""

from __future__ import annotations

import hashlib
import json
import re
import logging
from datetime import datetime

import anthropic

from fee_crawler.db import Database
from fee_crawler.generation.article_data import (
    query_national_benchmark,
    query_district_comparison,
    query_charter_comparison,
    query_top_10,
)
from fee_crawler.generation.prompts import (
    SYSTEM_PROMPT,
    SEO_EDITOR_SYSTEM,
    build_section_prompt,
    build_seo_edit_prompt,
    build_fact_check_prompt,
)
from fee_crawler.generation.quality_gates import run_quality_gates
from fee_crawler.generation.templates import (
    DISCLAIMER_TEXT,
    get_article_type_def,
    format_title,
    format_slug,
)

logger = logging.getLogger(__name__)

GENERATION_MODEL = "claude-sonnet-4-5-20250929"
SEO_EDIT_MODEL = "claude-sonnet-4-5-20250929"
FACT_CHECK_MODEL = "claude-haiku-4-5-20251001"


def _quarter_slug() -> str:
    """e.g. 'q1-2026'"""
    now = datetime.now()
    q = (now.month - 1) // 3 + 1
    return f"q{q}-{now.year}"


def _call_claude(
    client: anthropic.Anthropic,
    model: str,
    system: str,
    user_prompt: str,
    max_tokens: int = 1500,
    max_retries: int = 3,
) -> str:
    """Make a single Claude API call with retry on transient errors."""
    import time

    for attempt in range(max_retries):
        try:
            message = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return message.content[0].text.strip()
        except anthropic.APIStatusError as e:
            if e.status_code in (429, 529) and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning("  API %d, retrying in %ds...", e.status_code, wait)
                time.sleep(wait)
            else:
                raise


def _query_data(db: Database, article_type: str, category: str | None, district: int | None):
    """Query the appropriate data payload for the article type."""
    if article_type == "national_benchmark":
        if not category:
            raise ValueError("national_benchmark requires --category")
        return query_national_benchmark(db, category)

    if article_type == "district_comparison":
        if not category or not district:
            raise ValueError("district_comparison requires --category and --district")
        return query_district_comparison(db, category, district)

    if article_type == "charter_comparison":
        return query_charter_comparison(db)

    if article_type == "top_10":
        if not category:
            raise ValueError("top_10 requires --category")
        return query_top_10(db, category)

    raise ValueError(f"Unknown article type: {article_type}")


def _build_title_kwargs(data, article_type: str) -> dict[str, str]:
    """Extract template variables from data payload for title/slug formatting."""
    kwargs = {"quarter_slug": _quarter_slug()}

    if article_type == "national_benchmark":
        kwargs["display_name"] = data.display_name
        kwargs["category"] = data.category
        kwargs["quarter"] = data.quarter

    elif article_type == "district_comparison":
        kwargs["display_name"] = data.display_name
        kwargs["category"] = data.category
        kwargs["district"] = str(data.district)
        kwargs["district_name"] = data.district_name
        kwargs["quarter"] = getattr(data, "quarter", _quarter_slug().replace("-", " ").upper())

    elif article_type == "charter_comparison":
        kwargs["quarter"] = data.quarter

    elif article_type == "top_10":
        kwargs["display_name"] = data.display_name
        kwargs["category"] = data.category

    return kwargs


def _build_seo_keywords(article_type: str, data) -> list[str]:
    """Build target SEO keywords from the article data context."""
    keywords = ["bank fees 2026", "fee benchmark"]

    if hasattr(data, "display_name"):
        name = data.display_name.lower()
        keywords.insert(0, f"{name} fee")
        keywords.append(f"{name} fee comparison")
        keywords.append(f"average {name} fee")

    if hasattr(data, "district_name"):
        keywords.append(f"{data.district_name} district bank fees")

    if article_type == "charter_comparison":
        keywords = [
            "credit union vs bank fees",
            "bank fees vs credit union fees 2026",
            "credit union fee comparison",
            "bank fee benchmark",
        ]

    if article_type == "top_10":
        keywords.append(f"lowest {data.display_name.lower()} fees")
        keywords.append(f"cheapest {data.display_name.lower()}")

    return keywords[:6]


def generate_article(
    db: Database,
    article_type: str,
    category: str | None = None,
    district: int | None = None,
    dry_run: bool = False,
) -> dict | None:
    """Generate a single article.

    Returns dict with article metadata if successful, None if dry_run.
    In dry_run mode, prints the data context JSON and exits.
    """
    # 1. Get type definition
    type_def = get_article_type_def(article_type)

    # 2. Query data
    data = _query_data(db, article_type, category, district)
    data_json = data.to_json()

    if dry_run:
        print(f"\n--- Data Context for {article_type} ---")
        print(json.dumps(json.loads(data_json), indent=2))
        return None

    # 3. Build title and slug
    title_kwargs = _build_title_kwargs(data, article_type)
    title = format_title(type_def, **title_kwargs)
    slug = format_slug(type_def, **title_kwargs)

    logger.info("Generating: %s", title)

    # 4. Generate each section
    client = anthropic.Anthropic()
    sections_md: list[str] = []
    all_prompts: list[str] = []

    for section in type_def.sections:
        if section.is_static:
            sections_md.append(f"## {section.title}\n\n{DISCLAIMER_TEXT}")
            continue

        prompt = build_section_prompt(
            section_title=section.title,
            section_hint=section.prompt_hint,
            data_json=data_json,
            max_words=section.max_words,
        )
        all_prompts.append(prompt)

        logger.info("  Generating section: %s", section.key)
        section_text = _call_claude(
            client, GENERATION_MODEL, SYSTEM_PROMPT, prompt
        )
        sections_md.append(f"## {section.title}\n\n{section_text}")

    # 5. Assemble full article
    article_md = f"# {title}\n\n" + "\n\n".join(sections_md)

    # 5b. SEO editorial pass
    logger.info("  Running SEO editorial pass...")
    seo_keywords = _build_seo_keywords(article_type, data)
    seo_prompt = build_seo_edit_prompt(article_md, category, seo_keywords)
    edited_md = _call_claude(
        client, SEO_EDIT_MODEL, SEO_EDITOR_SYSTEM, seo_prompt, max_tokens=4000
    )

    # Extract meta description if present
    meta_description = None
    if "META_DESCRIPTION:" in edited_md:
        parts = edited_md.split("META_DESCRIPTION:", 1)
        article_md = parts[0].strip()
        meta_description = parts[1].strip().strip('"').strip("'")
    else:
        article_md = edited_md

    # 6. Generate summary
    summary_prompt = f"""Write a 1-2 sentence summary of this article for use as an excerpt/preview card. \
Be specific — include the key statistic (e.g., national median). Keep it under 30 words.

DATA CONTEXT:
```json
{data_json}
```

ARTICLE TITLE: {title}"""

    summary = _call_claude(
        client, GENERATION_MODEL, SYSTEM_PROMPT, summary_prompt, max_tokens=100
    )

    # Use SEO meta description as summary if available (better for search)
    if meta_description and len(meta_description) > 20:
        summary = meta_description

    # 7. Fact-check validation pass
    logger.info("  Running fact-check validation...")
    fact_check_prompt = build_fact_check_prompt(article_md, data_json)
    fact_check_raw = _call_claude(
        client, FACT_CHECK_MODEL, "", fact_check_prompt, max_tokens=1000
    )

    fact_check_passed = True
    try:
        # Extract JSON from response (may be wrapped in code blocks)
        json_match = re.search(r"\{[\s\S]*\}", fact_check_raw)
        if json_match:
            fact_result = json.loads(json_match.group())
            fact_check_passed = fact_result.get("passed", False)
            if not fact_check_passed:
                issues = fact_result.get("issues", [])
                logger.warning("  Fact-check found %d issues:", len(issues))
                for issue in issues:
                    logger.warning("    - %s", issue.get("line", "?"))
    except (json.JSONDecodeError, AttributeError):
        logger.warning("  Could not parse fact-check response")

    # 8. Run quality gates
    logger.info("  Running quality gates...")
    quality_report = run_quality_gates(article_md)
    if not quality_report.passed:
        for gate in quality_report.gates:
            if not gate.passed:
                logger.warning("  Quality gate failed: %s - %s", gate.name, gate.message)

    # 9. Compute prompt hash for reproducibility
    prompt_hash = hashlib.sha256(
        "\n---\n".join(all_prompts).encode()
    ).hexdigest()[:16]

    # 10. Compute metadata for new columns
    word_count = len(article_md.split())
    reading_time_min = max(1, round(word_count / 238))
    data_snapshot_date = datetime.now().strftime("%Y-%m-%d")

    # 11. Determine status
    now = datetime.now().isoformat()
    if not fact_check_passed or not quality_report.passed:
        status = "draft"
    else:
        status = "review"

    # 12. Store in database (UPSERT: overwrite draft/rejected, skip others)
    quality_json = json.dumps(quality_report.to_dict())

    existing = db.execute(
        "SELECT id, status FROM articles WHERE slug = ?", (slug,)
    ).fetchone()

    if existing and existing["status"] not in ("draft", "rejected"):
        logger.info("  Skipping %s: existing article in '%s' status", slug, existing["status"])
        return {
            "id": existing["id"],
            "slug": slug,
            "title": title,
            "status": existing["status"],
            "skipped": True,
        }

    if existing:
        db.execute(
            """UPDATE articles SET title = ?, content_md = ?, data_context = ?, summary = ?,
                                   status = ?, model_id = ?, prompt_hash = ?,
                                   word_count = ?, reading_time_min = ?,
                                   data_snapshot_date = ?, quality_gate_results = ?,
                                   updated_at = ?
               WHERE id = ?""",
            (
                title, article_md, data_json, summary, status,
                GENERATION_MODEL, prompt_hash,
                word_count, reading_time_min, data_snapshot_date, quality_json,
                now, existing["id"],
            ),
        )
        article_id = existing["id"]
        logger.info("  Updated article #%d: %s [%s]", article_id, slug, status)
    else:
        article_id = db.insert_returning_id(
            """INSERT INTO articles (slug, title, article_type, fee_category, fed_district,
                                     status, review_tier, content_md, data_context, summary,
                                     word_count, reading_time_min, data_snapshot_date,
                                     quality_gate_results,
                                     model_id, prompt_hash, generated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                slug, title, article_type, category, district,
                status, type_def.review_tier, article_md, data_json, summary,
                word_count, reading_time_min, data_snapshot_date, quality_json,
                GENERATION_MODEL, prompt_hash, now,
            ),
        )
        logger.info("  Stored article #%d: %s [%s]", article_id, slug, status)

    db.commit()

    return {
        "id": article_id,
        "slug": slug,
        "title": title,
        "status": status,
        "fact_check_passed": fact_check_passed,
        "quality_gates_passed": quality_report.passed,
    }
