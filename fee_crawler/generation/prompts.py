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
