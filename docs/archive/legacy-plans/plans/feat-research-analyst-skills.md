# Consultant-Grade Research Analyst: Domain Skills System

## Overview

Claude Prism's "scientific skills" are structured SKILL.md files that inject domain expertise into Claude's system prompt — methodology frameworks, decision trees, reporting templates, and analysis workflows. Each skill turns a general-purpose LLM into a domain specialist.

We can build the same thing for financial services research. Instead of "Scanpy for RNA-seq" or "Porter's Five Forces," our skills would be:

- **Fee Benchmarking Analyst** — peer comparison methodology, percentile interpretation, outlier detection
- **Regulatory Intelligence** — CFPB enforcement trends, OCC guidance, state-level fee regulations
- **District Economic Analyst** — Beige Book interpretation, FRED indicator analysis, regional fee correlations
- **Competitive Intelligence** — market positioning, pricing strategy frameworks, charter-specific analysis
- **Executive Report Writer** — McKinsey-style deliverables with data visualizations
- **Consumer Advocacy Researcher** — plain-language fee guides, consumer impact analysis

Each skill is a SKILL.md file loaded into the agent's context when the user selects a topic. The agent becomes a specialist, not a generalist.

## How Prism Skills Work (Pattern to Adopt)

A skill is a markdown file with:
1. **Frontmatter** — name, description, allowed tools
2. **When to Use** — trigger conditions
3. **Methodology** — step-by-step analytical framework
4. **Decision Trees** — "if X then do Y" logic
5. **Output Templates** — structured report formats
6. **Examples** — concrete analysis patterns with real data shapes

The key insight: **skills don't add tools — they add expertise.** The same DB tools produce dramatically different output when guided by a domain-specific methodology.

## Proposed Skills for Fee Insight

### Category 1: Analysis Skills

#### `fee-benchmarking`
```markdown
# Fee Benchmarking Analysis

When to use: User asks to compare fees, benchmark an institution, or evaluate pricing.

## Methodology
1. Identify the subject (institution, category, segment)
2. Define peer group (charter type + asset tier + district)
3. Pull national median as baseline
4. Pull peer median for contextual comparison
5. Calculate percentile position
6. Flag outliers (>P75 or <P25)
7. Present with delta analysis

## Output Format
| Category | Your Fee | Peer Median | National Median | Percentile | Assessment |
|----------|----------|-------------|-----------------|------------|------------|

## Interpretation Guide
- P0-P25: Below average (competitive advantage or potential underpricing)
- P25-P75: Market rate (aligned with peers)
- P75-P100: Above average (premium pricing or potential risk)
- >2x median: Statistical outlier (verify data accuracy)
```

#### `district-economic-outlook`
```markdown
# District Economic Outlook

When to use: User asks about a Fed district, regional trends, or economic context.

## Methodology
1. Pull district fee statistics (median, coverage, institution count)
2. Retrieve latest Beige Book commentary for the district
3. Pull FRED economic indicators (unemployment, CPI, lending activity)
4. Cross-reference: do fee trends align with economic conditions?
5. Compare district to national baseline
6. Identify 3 key insights

## Analysis Framework
- Economic Health: GDP growth, unemployment, consumer spending
- Banking Stress: Delinquency rates, charge-offs, capital ratios
- Fee Pressure: Rising costs -> higher fees? Consumer pushback?
- Regulatory Climate: Any recent state-level fee legislation?

## Output Format
### District [N]: [City] — Fee Outlook
**Economic Context:** [2-3 sentences from Beige Book]
**Key Indicators:** [table of FRED data]
**Fee Landscape:** [comparison to national, peer analysis]
**Outlook:** [synthesis: what's likely to happen with fees]
```

#### `fee-revenue-correlation`
```markdown
# Fee-to-Revenue Correlation Analysis

When to use: User asks about fee income, service charge revenue, or fee dependency.

## Methodology
1. Pull service charge income from FDIC Call Reports / NCUA 5300
2. Pull extracted fee schedules for the same institutions
3. Calculate fee-to-revenue ratio by tier and charter
4. Identify institutions with high fee dependency (>20% non-interest income)
5. Flag discrepancies between published fees and actual revenue

## Key Metrics
- Service charge income as % of non-interest income
- Fee schedule completeness score (observed fees / expected categories)
- Revenue per fee category (estimated from volume assumptions)
- Year-over-year revenue trends (if historical data available)
```

#### `competitive-intelligence`
```markdown
# Competitive Intelligence Brief

When to use: User asks to compare institutions, evaluate market positioning, or assess competitive landscape.

## Methodology
1. Identify target institution and 5-10 closest peers (same tier + district)
2. Pull fee schedules for all
3. Build fee competitiveness scorecard (% of fees above/below peer median)
4. Identify pricing advantages and vulnerabilities
5. Cross-reference with financial health (ROA, efficiency ratio, capital)

## Scorecard Template
| Category | Target | Peer Median | Position | Signal |
|----------|--------|-------------|----------|--------|
| Overdraft | $35 | $30 | Above | Premium |
| NSF | $25 | $29 | Below | Competitive |
| Monthly Maint. | $0 | $6 | Below | Loss leader |

## Strategic Assessment
- Pricing Power: Can they raise fees without losing customers?
- Fee Dependency: How much revenue depends on fee income?
- Market Position: Premium, market-rate, or value?
```

### Category 2: Content Skills

#### `executive-report`
```markdown
# Executive Research Report

When to use: User needs a polished, publishable report for professional audience.

## Structure (1500-2500 words)
1. Executive Summary (3-5 bullet key takeaways)
2. Market Context (economic environment, regulatory landscape)
3. Data Analysis (tables, comparisons, peer benchmarks)
4. Regional Variations (district and state-level insights)
5. Strategic Implications (what this means for institutions)
6. Methodology Note (data sources, sample size, date range)
7. CTA (contact for custom analysis)

## Writing Guidelines
- Lead with the insight, not the data
- Every claim backed by a specific number from tools
- Use tables for 3+ comparisons
- Bold key figures in running text
- Professional but accessible tone
- No jargon without definition
- Attribution: "According to Fee Insight data..."
```

#### `consumer-guide`
```markdown
# Consumer Fee Guide

When to use: User needs plain-language content for consumers about a fee type.

## Structure (800-1200 words)
1. What is this fee? (1 sentence definition)
2. How much does it typically cost? (national median, P25-P75 range)
3. Who charges the most/least? (charter, tier, geographic patterns)
4. How to avoid or reduce this fee (actionable tips)
5. What regulators say (CFPB guidance, recent enforcement)
6. Compare your bank (link to search tool)

## Tone
- Written for a consumer, not a banker
- No abbreviations without explanation (NSF = Non-Sufficient Funds)
- Use "you" and "your bank"
- Empathetic but factual
```

#### `monthly-pulse`
```markdown
# Monthly Fee Pulse Report

When to use: Generating the recurring monthly summary of fee index movements.

## Structure (400-600 words)
1. Headline metric: Overall index movement (if tracking month-over-month)
2. Category movers: Top 3 categories with biggest changes
3. Notable observations: New data, coverage milestones, outlier events
4. District spotlight: One district's notable pattern
5. Looking ahead: What to watch next month

## Data to Pull
- Current month's index snapshot vs prior month (if available)
- Total observation count growth
- New institutions added to dataset
- Categories with most new observations
```

### Category 3: Methodology Skills

#### `data-quality-audit`
```markdown
# Data Quality Audit

When to use: User asks about data reliability, coverage, or methodology.

## Checks to Run
1. Coverage funnel: total -> with URL -> with fees -> approved
2. Uncategorized fee count and trend
3. Null amount prevalence by category
4. Duplicate detection results
5. Stale institution count
6. Review status distribution

## Reporting
Present as a data quality scorecard with pass/warn/fail indicators.
Include sample sizes and confidence notes.
```

## Implementation Plan

### Phase 1: Create skills directory and loader

**Directory structure:**
```
.claude/skills/
  fee-benchmarking/SKILL.md
  district-economic-outlook/SKILL.md
  fee-revenue-correlation/SKILL.md
  competitive-intelligence/SKILL.md
  executive-report/SKILL.md
  consumer-guide/SKILL.md
  monthly-pulse/SKILL.md
  data-quality-audit/SKILL.md
```

**Skill loader** (`src/lib/research/skills.ts`):
```typescript
export function loadSkill(skillId: string): string | null {
  // Read SKILL.md from .claude/skills/[id]/SKILL.md
  // Return content to inject into agent system prompt
}

export function listSkills(): SkillInfo[] {
  // Scan .claude/skills/ directory
  // Return id, name, description for each
}
```

### Phase 2: Inject skills into agent prompts

When user selects a skill/topic in the Research Hub chat:
1. Load the SKILL.md content
2. Append to the agent's system prompt as additional context
3. The agent now follows the methodology framework in the skill

```typescript
// In the API route
const skill = loadSkill(selectedSkillId);
const systemPrompt = skill
  ? `${agent.systemPrompt}\n\n---\n\n## Active Skill: ${skill}`
  : agent.systemPrompt;
```

### Phase 3: Skill selector in chat UI

Add a dropdown or chip selector in the chat composer:
- "Select Analysis Type" -> shows available skills
- Selecting a skill adds it to the prompt context
- Visual indicator: "Using: Fee Benchmarking" badge in chat header

## Why This Creates a Consultant-Grade Analyst

| Without Skills | With Skills |
|----------------|-------------|
| "Tell me about overdraft fees" -> generic summary | "Tell me about overdraft fees" -> structured peer analysis with percentiles, outlier flags, strategic assessment |
| "Write about District 5" -> basic fee stats | "Write about District 5" -> economic context from Beige Book, FRED indicators, fee-economic correlation, 3 key insights |
| "Compare these banks" -> list of numbers | "Compare these banks" -> competitive scorecard, pricing position, fee dependency analysis, strategic recommendations |

The same tools, the same data, the same model — but dramatically better output because the agent follows a structured methodology instead of winging it.

## Acceptance Criteria

- [ ] 8 skill SKILL.md files created in .claude/skills/
- [ ] Skill loader reads and injects into system prompts
- [ ] Chat UI has skill selector
- [ ] Agent output quality visibly improves when skill is active
- [ ] Skills are reusable across all agents (Fee Analyst, Content Writer, Custom Query)

## Files to Create

| File | Purpose |
|------|--------|
| `.claude/skills/fee-benchmarking/SKILL.md` | Peer comparison methodology |
| `.claude/skills/district-economic-outlook/SKILL.md` | Regional analysis framework |
| `.claude/skills/fee-revenue-correlation/SKILL.md` | Revenue analysis methodology |
| `.claude/skills/competitive-intelligence/SKILL.md` | Market positioning framework |
| `.claude/skills/executive-report/SKILL.md` | Professional report template |
| `.claude/skills/consumer-guide/SKILL.md` | Plain-language guide template |
| `.claude/skills/monthly-pulse/SKILL.md` | Recurring report template |
| `.claude/skills/data-quality-audit/SKILL.md` | Data hygiene audit framework |
| `src/lib/research/skills.ts` | Skill loader and listing |

## Files to Modify

| File | Change |
|------|--------|
| `src/app/api/research/[agentId]/route.ts` | Inject selected skill into system prompt |
| `src/app/admin/research/[agentId]/research-chat.tsx` | Add skill selector UI |
