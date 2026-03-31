"""Stage 5: AI fee validation."""

import os
import json
import logging

import anthropic

log = logging.getLogger(__name__)


def validate_fees(institution: dict, fees: list[dict]) -> dict:
    """
    Ask Claude to review extracted fees for quality.

    Returns: {"data_quality": str, "issues": list, "missing_categories": list}
    """
    if not fees:
        return {"data_quality": "limited", "issues": ["No fees extracted"], "missing_categories": []}

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    charter = institution.get("charter_type", "bank")
    name = institution.get("institution_name", "Unknown")
    state = institution.get("state", "Unknown")

    fees_text = json.dumps(
        [{"name": f.get("fee_name"), "amount": f.get("amount"), "frequency": f.get("frequency")} for f in fees],
        indent=2,
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        system="""You validate extracted bank fee data. Review fees for completeness and accuracy.

Return JSON only:
{
  "data_quality": "excellent|good|partial|limited",
  "issues": ["specific issue 1", "specific issue 2"],
  "missing_categories": ["category names that should be present but aren't"]
}

Quality rubric:
- excellent: 10+ fees, all major categories present, amounts look reasonable
- good: 5-9 fees, most major categories present
- partial: 3-4 fees, some categories missing
- limited: 1-2 fees or data looks incomplete

Major categories for banks/credit unions: monthly maintenance, overdraft, NSF, ATM, wire transfer, stop payment, statement fee""",
        messages=[{
            "role": "user",
            "content": f"Review these extracted fees for {name}, a {charter} in {state}.\n\n{fees_text}",
        }],
        timeout=30,
    )

    text = "".join(b.text for b in response.content if b.type == "text")

    try:
        # Parse JSON
        import re
        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            return json.loads(m.group())
    except (json.JSONDecodeError, AttributeError):
        pass

    return {"data_quality": "unknown", "issues": ["Validation response parse error"], "missing_categories": []}
