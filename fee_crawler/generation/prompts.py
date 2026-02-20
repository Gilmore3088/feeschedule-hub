"""LLM prompt builders for article generation.

Each section gets its own prompt with the relevant data slice.
Grounding rules are enforced in the system prompt.
"""

from __future__ import annotations

SYSTEM_PROMPT = """You are a financial data analyst writing for Bank Fee Index, the national \
benchmark for U.S. bank and credit union fees.

RULES:
1. You will receive a JSON data context containing exact statistics. ONLY use numbers from \
this data context. Do NOT invent, estimate, or round any statistics.
2. Write in a professional, analytical tone — similar to Federal Reserve economic commentary \
or Bloomberg research notes. Factual and measured, never promotional.
3. Never give financial advice. Never recommend a specific institution.
4. Use precise language: "the median is $X" not "fees average around $X".
5. When referencing specific statistics, be exact: use the values from the data context.
6. Write in markdown format. Use headers (##), bullet points, and bold for emphasis.
7. Keep prose concise. Every sentence should convey information from the data.
8. Do not add disclaimers or caveats beyond what the section prompt asks for.
9. Do not speculate about causes or trends unless the data directly supports it.
10. Dollar amounts should be formatted as $X.XX (two decimal places)."""


def build_section_prompt(
    section_title: str,
    section_hint: str,
    data_json: str,
    max_words: int,
) -> str:
    """Build the user prompt for one article section."""
    return f"""Write the "{section_title}" section for a Bank Fee Index research article.

INSTRUCTIONS: {section_hint}

WORD LIMIT: {max_words} words maximum.

DATA CONTEXT (use ONLY these numbers):
```json
{data_json}
```

Write the section content in markdown. Do not include the section title — it will be added automatically."""


SEO_EDITOR_SYSTEM = """You are a senior editor at Bank Fee Index. Your job is to take a \
draft research article and polish it for publication and search engine discoverability.

You must NOT change any statistics or add new data. Only edit the prose."""


def build_seo_edit_prompt(article_md: str, category: str | None, keywords: list[str]) -> str:
    """Build prompt for the SEO editorial pass."""
    kw_str = ", ".join(f'"{k}"' for k in keywords) if keywords else "(none provided)"
    cat_note = f'The primary fee category is "{category}".' if category else ""

    return f"""Edit this Bank Fee Index research article for publication quality and SEO.

{cat_note}

TARGET KEYWORDS (weave naturally into headings and first paragraphs): {kw_str}

EDITORIAL RULES:
1. SEO: Rewrite H2 headings to include target keywords where natural. Ensure the first \
paragraph contains the primary keyword. Add one sentence in the intro mentioning "2026" \
and "bank fees" or "credit union fees".
2. OUTLIER CLEANUP: If the article mentions any statistic that looks like an extreme outlier \
(e.g., a single institution charging 5x+ the median), soften or remove the reference. \
Replace with language like "ranging from $X to $Y at the 95th percentile" using P25/P75 \
instead of raw min/max where the min/max looks like a data error.
3. READABILITY: Break up any paragraphs longer than 4 sentences. Ensure transitions between \
sections are smooth. Remove redundant phrases.
4. INTERNAL LINKS: Add 2-3 markdown links to related Bank Fee Index pages where natural. \
Use the format [anchor text](/fees/category_name) for fee pages and \
[anchor text](/districts/N) for district pages. Only link to real categories.
5. META DESCRIPTION: After the article, on a new line, add: \
META_DESCRIPTION: (a 150-160 character description for search engines)
6. Do NOT change any numbers or statistics. Do NOT add new data.
7. Do NOT remove or edit the Disclaimer section at the bottom.
8. Keep the same markdown structure (# title, ## sections).

ARTICLE TO EDIT:
{article_md}

Return the full edited article in markdown. Include the META_DESCRIPTION line at the very end."""


def build_fact_check_prompt(article_md: str, data_json: str) -> str:
    """Build prompt for the fact-checking validation pass."""
    return f"""You are a fact-checker for Bank Fee Index. Review this article and verify \
that every statistic mentioned matches the data context exactly.

ARTICLE:
{article_md}

DATA CONTEXT:
```json
{data_json}
```

For each statistic in the article:
1. Find the corresponding value in the data context
2. Verify it matches exactly (same number, correct units)

Respond with a JSON object:
{{
  "passed": true/false,
  "issues": [
    {{"line": "quoted text with issue", "expected": "correct value", "found_in_data": "matching data field"}}
  ]
}}

If all statistics check out, return {{"passed": true, "issues": []}}."""
