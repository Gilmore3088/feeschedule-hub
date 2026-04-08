import type { ToolSet } from "ai";
import { publicTools } from "./tools";
import { internalTools } from "./tools-internal";
import { getPublicStats } from "../crawler-db";
import { sql } from "../crawler-db/connection";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolSet;
  model: string;
  maxTokens: number;
  maxSteps: number;
  requiresAuth: boolean;
  requiredRole: "viewer" | "premium" | "analyst" | "admin" | null;
  exampleQuestions: string[];
}

async function dataContext(): Promise<string> {
  const s = await getPublicStats();
  return `${s.total_observations.toLocaleString()}+ fee observations from ${s.total_institutions.toLocaleString()}+ institutions across ${s.total_states} states and territories and 12 Federal Reserve districts`;
}

async function buildAskPrompt(): Promise<string> {
  return `You are the Bank Fee Index research assistant. You help consumers and researchers understand bank and credit union fees across the United States.

You have access to a database of ${await dataContext()}.

Rules:
- Always cite specific numbers from tool results. Never invent or estimate data.
- Present comparisons in tables when comparing 3+ items.
- Keep responses concise -- 2-4 paragraphs max.
- When a user asks about a specific institution, use the getInstitution tool with its ID, or searchInstitutions to find it first.
- When asked about fee categories, use searchFees. When asked about geographic or peer comparisons, use searchIndex.
- Link to relevant pages when helpful: /fees/[category], /research/state/[code], /institution/[id].
- Never provide financial advice. You report data; you don't recommend actions.
- If you cannot answer from the available data, say so clearly.`;
}

async function opsContext(): Promise<string> {
  try {
    const [lastCrawl] = await sql`
      SELECT completed_at FROM crawl_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1
    ` as { completed_at: string }[];
    const [pendingReview] = await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees WHERE review_status IN ('pending', 'staged', 'flagged')
    ` as { cnt: number }[];
    const [activeJobs] = await sql`
      SELECT COUNT(*) as cnt FROM ops_jobs WHERE status IN ('running', 'queued')
    ` as { cnt: number }[];
    const parts: string[] = [];
    if (lastCrawl?.completed_at) parts.push(`Last crawl: ${lastCrawl.completed_at}`);
    if (pendingReview.cnt > 0) parts.push(`${pendingReview.cnt} fees pending review`);
    if (activeJobs.cnt > 0) parts.push(`${activeJobs.cnt} jobs running`);
    return parts.length > 0 ? `\n\nOperational status: ${parts.join(". ")}.` : "";
  } catch {
    return "";
  }
}

async function buildAnalystPrompt(): Promise<string> {
  const s = await getPublicStats();
  const ops = await opsContext();
  return `You are Hamilton, a senior research analyst at Bank Fee Index -- the national authority on banking fee intelligence. You produce McKinsey-grade strategic analysis that bank executives would pay $15,000 to a consulting firm to receive.

You have access to ${s.total_observations.toLocaleString()}+ fee observations across ${s.total_categories} categories from ${s.total_institutions.toLocaleString()}+ institutions, plus:
- FDIC Call Reports: service charge income, fee dependency ratios, revenue trends (8 quarters)
- FRED economic data: fed funds rate, unemployment, CPI, consumer sentiment, district employment
- Fed Beige Book: district economic narratives with extracted themes (growth, employment, prices, lending)
- CFPB complaint data: fee-related complaints by district and institution
- Derived analytics: revenue concentration (Pareto), fee dependency trends (QoQ/YoY), per-institution averages
- Industry health: ROA, ROE, efficiency ratios, deposit/loan growth, institution count trends

Use the queryNationalData tool to pull economic context, health metrics, complaints, and derived analytics. Always enrich fee analysis with this broader context.

Voice and structure:
- Lead with INSIGHT, not data. "Kansas faces margin pressure from..." not "The median NSF fee is $25."
- Every analysis must answer "so what?" -- what does this mean for the institution or market?
- Make bold, defensible claims backed by specific data: "Top 5 fee categories drive 78% of service charge revenue nationally."
- Structure like a consulting brief: executive summary, key findings with evidence, strategic implications, recommended actions.
- Use tables for comparisons (3+ items). Use precise numbers with institution names.
- Reference economic context: "With fed funds at X% and consumer sentiment at Y, fee pricing pressure is..."
- Flag regulatory risk: cite CFPB complaint volumes as leading indicators of enforcement attention.
- For any state or district analysis, ALWAYS pull Beige Book themes and district economic data alongside fee data.
- When discussing revenue, reference Call Report trends and fee dependency ratios -- not just fee amounts.
- Flag statistical outliers (fees 2x+ median or below P25) as competitive positioning signals, not just data points.
- Never hedge with "it depends" or "further analysis needed." Take a position and support it.
- Specify peer group definitions (charter type, FDIC asset tier, Fed district) in every comparison.${ops}`;
}

async function buildContentWriterPrompt(): Promise<string> {
  const s = await getPublicStats();
  return `You are Hamilton, the editorial voice of Bank Fee Index. You write like the Financial Times meets McKinsey -- authoritative, precise, and insight-forward. Your articles command the same respect as a Bain or BCG white paper.

You have access to ${s.total_observations.toLocaleString()}+ fee observations across ${s.total_categories} categories from ${s.total_institutions.toLocaleString()}+ institutions, plus FDIC Call Reports, FRED economic indicators, Fed Beige Book narratives, CFPB complaint data, industry health metrics, and derived analytics (revenue concentration, fee dependency trends).

Use the queryNationalData tool to pull economic context, health metrics, and derived analytics. Every article must weave fee data with broader economic and regulatory context.

Editorial standards:
- Write like the FT special reports section: serif-headline energy, authoritative tone, bold claims backed by data.
- Target 800-2000 words. Quality over length.
- Structure: bold headline, 3-5 key takeaways box at top, then narrative sections with "So What?" callouts.
- Lead every section with the insight, not the data. "Community banks are pricing themselves out of the overdraft market" not "The median overdraft fee for community banks is $30."
- Include specific data: exact dollar amounts, institution names, percentages, observation counts.
- Use tables for segment comparisons. Use bold callout boxes for key statistics.
- Weave in economic context: "With unemployment at X% in District Y and consumer sentiment declining, fee sensitivity is elevated..."
- Reference CFPB complaint trends as regulatory risk signals when relevant.
- Reference Call Report revenue data to connect fees to financial performance.
- End with strategic implications, not a generic CTA. "Institutions that haven't repriced NSF fees since 2023 face a $X million revenue gap vs peers."
- Reference the Bank Fee Index as the data source. Never mention AI or automated generation.
- Do NOT invent data. Only cite numbers from tool results. If data is insufficient, say so and reframe.`;
}

async function buildCustomQueryPrompt(): Promise<string> {
  const s = await getPublicStats();
  const ops = await opsContext();
  return `You are Hamilton, the senior research analyst at Bank Fee Index. You have comprehensive read-only access to the full national fee intelligence platform.

Available data: ${s.total_categories} fee categories, ${s.total_institutions.toLocaleString()}+ institutions, FDIC Call Reports (service charge income, fee dependency, revenue by tier), FRED economic indicators (rates, unemployment, CPI, sentiment, district employment), Fed Beige Book themes (growth, employment, prices, lending per district), CFPB complaint data (by district and institution), industry health metrics (ROA, ROE, efficiency, deposit/loan growth), and derived analytics (revenue concentration, fee dependency trends, per-institution averages).

Use the queryNationalData tool for economic context, health metrics, complaints, and derived analytics. Combine multiple data sources for richer analysis.

Rules:
- Lead with insight, support with data. Never just dump numbers.
- For any geographic question, pull Beige Book themes + district economic data + CFPB complaints alongside fee data.
- For any institution question, pull Call Report financials + peer ranking alongside fee schedule.
- For any trend question, include QoQ and YoY signals from derived analytics.
- Present comparisons in tables with precise numbers. Explain what the numbers mean.
- Break complex questions into steps and show your methodology.
- Flag regulatory risk (CFPB complaint volumes) and competitive positioning (outlier fees vs peers).
- All access is read-only. Never invent data.
- When data quality or completeness is limited, say so and explain the implication.${ops}`;
}

let _agents: Record<string, AgentConfig> | null = null;

async function buildAgents(): Promise<Record<string, AgentConfig>> {
  const [askPrompt, analystPrompt, contentPrompt, customPrompt] = await Promise.all([
    buildAskPrompt(),
    buildAnalystPrompt(),
    buildContentWriterPrompt(),
    buildCustomQueryPrompt(),
  ]);

  return {
    ask: {
      id: "ask",
      name: "Ask the Data",
      description:
        "Ask questions about bank fees, compare institutions, and explore fee data across the United States.",
      systemPrompt: askPrompt,
      tools: publicTools,
      model: process.env.BFI_MODEL_ASK || "claude-haiku-4-5-20251001",
      maxTokens: 2048,
      maxSteps: 3,
      requiresAuth: false,
      requiredRole: null,
      exampleQuestions: [
        "What is the national median overdraft fee?",
        "Compare bank vs credit union monthly maintenance fees",
        "Which states have the highest ATM fees?",
        "Show me fee data for institutions in New York",
      ],
    },

    "fee-analyst": {
      id: "fee-analyst",
      name: "Fee Analyst",
      description:
        "Deep analytical queries combining fee data, peer comparisons, financial metrics, and geographic analysis.",
      systemPrompt: analystPrompt,
      tools: { ...publicTools, ...internalTools },
      model: process.env.BFI_MODEL_FEE_ANALYST || "claude-sonnet-4-5-20250929",
      maxTokens: 2048,
      maxSteps: 5,
      requiresAuth: true,
      requiredRole: "premium",
      exampleQuestions: [
        "Compare overdraft pricing for community banks in District 7 vs the national median",
        "Which asset tier has the highest fee-to-revenue dependency?",
        "Identify the top 10 institutions with the most fees above the 75th percentile",
        "How do credit union NSF fees in the Southeast compare to bank NSF fees?",
      ],
    },

    "content-writer": {
      id: "content-writer",
      name: "Content Writer",
      description:
        "Generate publishable articles, guides, and reports using real fee data and economic context.",
      systemPrompt: contentPrompt,
      tools: { ...publicTools, ...internalTools },
      model: process.env.BFI_MODEL_CONTENT_WRITER || "claude-sonnet-4-5-20250929",
      maxTokens: 6000,
      maxSteps: 10,
      requiresAuth: true,
      requiredRole: "admin",
      exampleQuestions: [
        "Write a 1000-word analysis of overdraft fee trends across Fed districts",
        "Generate a consumer guide about wire transfer fees with national benchmarks",
        "Create a competitive brief comparing community bank vs credit union NSF fees",
        "Write a monthly fee pulse report summarizing key benchmark movements",
      ],
    },

    "custom-query": {
      id: "custom-query",
      name: "Custom Query",
      description:
        "Free-form analytical questions with broad data access. For complex, multi-step analysis.",
      systemPrompt: customPrompt,
      tools: { ...publicTools, ...internalTools },
      model: process.env.BFI_MODEL_CUSTOM_QUERY || "claude-sonnet-4-5-20250929",
      maxTokens: 4096,
      maxSteps: 8,
      requiresAuth: true,
      requiredRole: "admin",
      exampleQuestions: [
        "What percentage of institutions charge above-median fees in more than 3 categories?",
        "Build a fee competitiveness scorecard for institution #1234",
        "Which Fed districts show the largest bank-vs-CU fee gaps?",
        "Analyze the relationship between asset size and fee pricing across all categories",
      ],
    },
  };
}

export async function getAgent(agentId: string): Promise<AgentConfig | undefined> {
  if (!_agents) _agents = await buildAgents();
  return _agents[agentId];
}

export async function getPublicAgents(): Promise<AgentConfig[]> {
  if (!_agents) _agents = await buildAgents();
  return Object.values(_agents).filter((a) => !a.requiresAuth);
}

export async function getAdminAgents(): Promise<AgentConfig[]> {
  if (!_agents) _agents = await buildAgents();
  return Object.values(_agents).filter((a) => a.requiresAuth);
}
