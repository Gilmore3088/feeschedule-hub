"""Article type definitions and section templates.

Each article type defines its sections, review tier, and slug pattern.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SectionDef:
    """Definition of one section within an article."""

    key: str
    title: str
    prompt_hint: str
    is_static: bool = False  # If True, content is hardcoded (not LLM-generated)
    max_words: int = 300


@dataclass
class ArticleTypeDef:
    """Definition of an article type with its sections and metadata."""

    type_key: str
    title_template: str  # Python format string with data context fields
    slug_template: str
    review_tier: int
    sections: list[SectionDef] = field(default_factory=list)


DISCLAIMER_TEXT = """---

**Data Sourcing:** Fee data sourced from Bank Fee Index, a proprietary database of \
fee schedule documents collected from U.S. banks and credit unions.

**Coverage:** This analysis covers institutions from which fee data was successfully \
extracted and may not be representative of the full market.

**Not Financial Advice:** This content is for informational purposes only and does not \
constitute financial advice or a recommendation regarding any specific institution.

**Methodology:** Fee amounts reflect disclosed fee schedules and may not reflect \
promotional rates, relationship pricing, or waived fees.

**AI Disclosure:** Statistical analysis computed from source data. Narrative generated \
with AI assistance and reviewed by editorial staff."""


ARTICLE_TYPES: dict[str, ArticleTypeDef] = {
    "national_benchmark": ArticleTypeDef(
        type_key="national_benchmark",
        title_template="{display_name}: {quarter} National Benchmark Report",
        slug_template="{category}-national-benchmark-{quarter_slug}",
        review_tier=2,
        sections=[
            SectionDef(
                key="executive_summary",
                title="Executive Summary",
                prompt_hint="Write a 2-3 paragraph executive summary of this fee category's national benchmark data. Lead with the national median, mention the range (P25-P75), and highlight one notable finding from the charter or district breakdown.",
                max_words=250,
            ),
            SectionDef(
                key="distribution",
                title="National Distribution",
                prompt_hint="Describe the distribution of this fee across all institutions. Mention median, mean, P25, P75, min, and max. Note if the distribution is skewed. Reference the total institution count.",
                max_words=200,
            ),
            SectionDef(
                key="charter_comparison",
                title="Banks vs. Credit Unions",
                prompt_hint="Compare bank and credit union medians for this fee. Which charges more? By how much? Are the distributions similar or different? Use specific numbers from the data.",
                max_words=200,
            ),
            SectionDef(
                key="tier_breakdown",
                title="By Asset Size",
                prompt_hint="Analyze how this fee varies across asset size tiers. Do larger institutions charge more or less? Is there a clear trend? Mention specific tier medians.",
                max_words=250,
            ),
            SectionDef(
                key="geographic_variation",
                title="Regional Variation",
                prompt_hint="Describe geographic variation across Fed districts. Which districts have the highest/lowest medians? Are there notable regional patterns? Mention specific district names and numbers.",
                max_words=250,
            ),
            SectionDef(
                key="consumer_takeaway",
                title="What This Means for Consumers",
                prompt_hint="Write a brief consumer-facing takeaway. What should someone shopping for a bank account know about this fee? Keep it factual and grounded in the data — no financial advice.",
                max_words=150,
            ),
            SectionDef(
                key="methodology",
                title="Methodology",
                prompt_hint="Write a brief methodology note explaining that data comes from fee schedule documents, the sample size, and date range. Keep it factual.",
                max_words=100,
            ),
            SectionDef(
                key="disclaimer",
                title="Disclaimer",
                prompt_hint="",
                is_static=True,
            ),
        ],
    ),
    "district_comparison": ArticleTypeDef(
        type_key="district_comparison",
        title_template="How {district_name} District Banks Compare on {display_name}",
        slug_template="{category}-district-{district}-comparison-{quarter_slug}",
        review_tier=2,
        sections=[
            SectionDef(
                key="district_overview",
                title="District Overview",
                prompt_hint="Introduce the Fed district with economic context from the Beige Book summary. Set the scene for why fee levels might differ here. Mention the district name and number.",
                max_words=200,
            ),
            SectionDef(
                key="fee_landscape",
                title="Fee Landscape: Local vs. National",
                prompt_hint="Compare the district median to the national median for this fee. Is the district above or below national? By what percentage? Describe the local distribution.",
                max_words=250,
            ),
            SectionDef(
                key="top_performers",
                title="Lowest-Fee Institutions",
                prompt_hint="List the top 5 lowest-fee institutions in this district for this category. Include their name, city, state, charter type, and fee amount.",
                max_words=200,
            ),
            SectionDef(
                key="methodology",
                title="Methodology",
                prompt_hint="Brief methodology note.",
                max_words=100,
            ),
            SectionDef(
                key="disclaimer",
                title="Disclaimer",
                prompt_hint="",
                is_static=True,
            ),
        ],
    ),
    "charter_comparison": ArticleTypeDef(
        type_key="charter_comparison",
        title_template="Credit Union vs Bank Fees: The Complete {quarter} Comparison",
        slug_template="charter-comparison-{quarter_slug}",
        review_tier=2,
        sections=[
            SectionDef(
                key="executive_summary",
                title="Executive Summary",
                prompt_hint="Summarize the overall comparison between banks and credit unions across all spotlight fee categories. Which institution type is cheaper overall? Are there exceptions?",
                max_words=250,
            ),
            SectionDef(
                key="category_by_category",
                title="Category-by-Category Breakdown",
                prompt_hint="For each spotlight category, compare bank vs credit union median, noting which is lower and by how much. Use a structured format. Include all categories from the data.",
                max_words=400,
            ),
            SectionDef(
                key="where_cus_win",
                title="Where Credit Unions Win",
                prompt_hint="Identify categories where credit unions charge less than banks. Quantify the difference. Explain potential reasons grounded in the data (not speculation).",
                max_words=200,
            ),
            SectionDef(
                key="where_banks_win",
                title="Where Banks Win",
                prompt_hint="Identify categories where banks charge less than credit unions, if any. Quantify. Note if banks and CUs are essentially equal in some categories.",
                max_words=200,
            ),
            SectionDef(
                key="methodology",
                title="Methodology",
                prompt_hint="Brief methodology note.",
                max_words=100,
            ),
            SectionDef(
                key="disclaimer",
                title="Disclaimer",
                prompt_hint="",
                is_static=True,
            ),
        ],
    ),
    "top_10": ArticleTypeDef(
        type_key="top_10",
        title_template="Top 10 Institutions with the Lowest {display_name}",
        slug_template="top-10-lowest-{category}-{quarter_slug}",
        review_tier=3,  # Names specific institutions — full review required
        sections=[
            SectionDef(
                key="intro",
                title="Introduction",
                prompt_hint="Introduce the ranking: what fee, how many institutions were compared, what the national median is. Set context for why consumers might care about this ranking.",
                max_words=150,
            ),
            SectionDef(
                key="ranked_list",
                title="The Ranking",
                prompt_hint="Present the top 10 ranked list. For each institution: rank, name, city/state, charter type, fee amount, and how it compares to the national median. Use a numbered list.",
                max_words=400,
            ),
            SectionDef(
                key="methodology",
                title="Methodology & Caveats",
                prompt_hint="Explain methodology and important caveats: fees may vary by account type, promotional rates not reflected, data as of sample date. Do not recommend any institution.",
                max_words=150,
            ),
            SectionDef(
                key="disclaimer",
                title="Disclaimer",
                prompt_hint="",
                is_static=True,
            ),
        ],
    ),
}


def get_article_type_def(type_key: str) -> ArticleTypeDef:
    """Get the article type definition by key."""
    if type_key not in ARTICLE_TYPES:
        valid = ", ".join(ARTICLE_TYPES.keys())
        raise ValueError(f"Unknown article type '{type_key}'. Valid types: {valid}")
    return ARTICLE_TYPES[type_key]


def format_title(type_def: ArticleTypeDef, **kwargs: str) -> str:
    """Format the article title from template and data context."""
    return type_def.title_template.format(**kwargs)


def format_slug(type_def: ArticleTypeDef, **kwargs: str) -> str:
    """Format the article slug from template and data context."""
    return type_def.slug_template.format(**kwargs)
