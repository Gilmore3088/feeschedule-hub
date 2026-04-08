import type { ToolSet } from "ai";
import { publicTools } from "./tools";
import { internalTools } from "./tools-internal";
import { getPublicStats } from "../crawler-db";
import { sql } from "../crawler-db/connection";
import { HAMILTON_SYSTEM_PROMPT } from "../hamilton/voice";

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

export type HamiltonRole = "consumer" | "pro" | "admin";

// Role prefix constants — prepended before HAMILTON_SYSTEM_PROMPT
const CONSUMER_PREFIX =
  "You are speaking with a consumer or general public user. Use plain language — avoid banking jargon and acronyms without explanation. Lead with what this means for the person, not the data. Explain fee terms simply and focus on practical implications for everyday banking decisions.";

const PRO_PREFIX = `You are speaking with a banking professional with an active Bank Fee Index subscription.

OUTPUT STRUCTURE (every response):
1. HEADLINE: One sentence with a tension
2. MARKET CONTEXT: Competitive positioning with peer benchmarks
3. INSTITUTION EXAMPLES: 3-5 specific institutions, quantified
4. STRATEGIC IMPLICATION: What this means for their competitive position

Focus on peer group definitions (charter type, asset tier, Fed district) in every comparison. Anchor to revenue dynamics — fee pricing is evidence, revenue impact is the insight.

CONFIDENCE FRAMING: Never reference missing data. Use "observed fee schedules indicate", "available data shows", "patterns suggest". Be decisive — "institutions must" not "may consider".`;

const ADMIN_PREFIX = `You are speaking with the Bank Fee Index administrator — a senior operator who needs consulting-grade analysis.

OUTPUT STRUCTURE (every response):
1. HEADLINE: One sentence with a tension ("X while Y" or "X but Y")
2. MARKET CONTEXT: 1-2 paragraphs — state/national comparison, competitive framing
3. INSTITUTION EXAMPLES: 3-5 specific institutions with quantified positions
4. PATTERN RECOGNITION: What the examples collectively reveal
5. STRATEGIC IMPLICATION: Clear directive — what institutions must do

CONFIDENCE FRAMING (mandatory):
- Never say "no data", "missing data", "not available", "couldn't find", or "not disclosed"
- HIGH confidence: "The data shows..."
- MODERATE confidence: "Observed fee schedules across reporting institutions indicate..."
- EMERGING signal: "Patterns suggest..."
- Turn uncertainty into insight: "A meaningful segment operates with simplified fee structures" not "59% don't publish overdraft fees"

AUTHORITY RULES:
- Lead with verified signal, never data gaps
- "Institutions must" not "institutions may consider"
- "The data shows" not "there is a trend"
- Consumer-friendly = reduced penalty exposure OR alternative monetization, not just low fees
- Every section begins with what we KNOW, not what's missing

Include operational flags and pipeline context when relevant.`;

const REGULATION_INSTRUCTION =
  "When analyzing fees subject to regulatory scrutiny — overdraft, NSF, monthly maintenance, junk fees — always check CFPB complaint data and Fed Content for enforcement signals before concluding. Use queryRegulatoryRisk for compliance, enforcement risk, or regulatory exposure questions. Flag institutions with above-median fees AND above-average complaint rates as potential compliance risks. Reference ROA, efficiency ratio, and deposit growth when answering fee revenue questions — the financial context makes fee analysis actionable.";

const EXTERNAL_INTELLIGENCE_INSTRUCTION =
  "When your analysis benefits from external research, surveys, or industry reports, query external intelligence using queryNationalData(source='external', query='relevant terms'). When citing external intelligence in your response, always include inline attribution using the citation field from the result, formatted as [Source: Name, Date]. Treat external intelligence as supplementary context — internal fee data and Call Reports remain your primary evidence. Never fabricate external source citations; only cite sources returned by the tool.";

// Non-ops internal tools available to pro role (all internalTools minus ops-only tools)
const OPS_TOOL_NAMES = new Set([
  "getCrawlStatus",
  "getReviewQueueStats",
  "queryJobStatus",
  "queryDataQuality",
  "triggerPipelineJob",
]);

const proOnlyInternalTools: ToolSet = Object.fromEntries(
  Object.entries(internalTools).filter(([name]) => !OPS_TOOL_NAMES.has(name))
);

// Toolset definitions — curated to stay under 200K token context limit
// queryNationalData (11 sources) replaces most individual data tools
const consumerTools: ToolSet = { ...publicTools };
const chatInternalTools: ToolSet = {
  queryNationalData: internalTools.queryNationalData,
  queryRegulatoryRisk: internalTools.queryRegulatoryRisk,
  queryOutliers: internalTools.queryOutliers,
  searchInstitutionsByName: internalTools.searchInstitutionsByName,
  rankInstitutions: internalTools.rankInstitutions,
};
const proTools: ToolSet = { ...publicTools, ...chatInternalTools };
const adminTools: ToolSet = { ...publicTools, ...chatInternalTools };

async function dataContext(): Promise<string> {
  const s = await getPublicStats();
  return `${s.total_observations.toLocaleString()}+ fee observations from ${s.total_institutions.toLocaleString()}+ institutions across ${s.total_states} states and territories and 12 Federal Reserve districts`;
}

async function opsContext(): Promise<string> {
  try {
    const [lastCrawl] = (await sql`
      SELECT completed_at FROM crawl_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1
    `) as { completed_at: string }[];
    const [pendingReview] = (await sql`
      SELECT COUNT(*) as cnt FROM extracted_fees WHERE review_status IN ('pending', 'staged', 'flagged')
    `) as { cnt: number }[];
    const [activeJobs] = (await sql`
      SELECT COUNT(*) as cnt FROM ops_jobs WHERE status IN ('running', 'queued')
    `) as { cnt: number }[];
    const parts: string[] = [];
    if (lastCrawl?.completed_at) parts.push(`Last crawl: ${lastCrawl.completed_at}`);
    if (pendingReview.cnt > 0) parts.push(`${pendingReview.cnt} fees pending review`);
    if (activeJobs.cnt > 0) parts.push(`${activeJobs.cnt} jobs running`);
    return parts.length > 0 ? `\n\nOperational status: ${parts.join(". ")}.` : "";
  } catch {
    return "";
  }
}

export async function getHamilton(role: HamiltonRole): Promise<AgentConfig> {
  const s = await getPublicStats();

  const dataStats = `You have access to ${s.total_observations.toLocaleString()}+ fee observations across ${s.total_categories} categories from ${s.total_institutions.toLocaleString()}+ institutions, plus: FDIC Call Reports (revenue trends), FRED economic indicators, Fed Beige Book narratives, Fed speeches and research papers (Fed Content), CFPB complaint data, industry health metrics (ROA, efficiency, deposits, loans), BLS labor indicators, Census ACS demographics, NY Fed research data, OFR financial stability data, FDIC Summary of Deposits (market share), derived analytics (revenue concentration, fee dependency trends, per-institution averages), and admin-curated external intelligence (industry research, surveys, regulatory reports).`;

  switch (role) {
    case "consumer": {
      const systemPrompt = `${CONSUMER_PREFIX}\n\n${HAMILTON_SYSTEM_PROMPT}`;
      return {
        id: "hamilton",
        name: "Hamilton",
        description:
          "Ask questions about bank fees, compare institutions, and understand what fees mean for your everyday banking.",
        systemPrompt,
        tools: consumerTools,
        model: process.env.BFI_MODEL_CONSUMER || "claude-haiku-4-5-20251001",
        maxTokens: 2048,
        maxSteps: 3,
        requiresAuth: false,
        requiredRole: null,
        exampleQuestions: [
          "What is a monthly maintenance fee and how can I avoid it?",
          "Which banks have no overdraft fee?",
          "How does my bank's ATM fee compare to the national average?",
          "What fees should I watch out for when opening a checking account?",
        ],
      };
    }

    case "pro": {
      const systemPrompt = `${PRO_PREFIX}\n\n${dataStats}\n\n${REGULATION_INSTRUCTION}\n\n${EXTERNAL_INTELLIGENCE_INSTRUCTION}\n\n${HAMILTON_SYSTEM_PROMPT}`;
      return {
        id: "hamilton",
        name: "Hamilton",
        description:
          "Deep analytical queries combining fee data, peer comparisons, financial metrics, and geographic analysis.",
        systemPrompt,
        tools: proTools,
        model: process.env.BFI_MODEL_PRO || "claude-sonnet-4-6",
        maxTokens: 4096,
        maxSteps: 4,
        requiresAuth: true,
        requiredRole: "premium",
        exampleQuestions: [
          "Compare overdraft pricing for community banks in District 7 vs the national median",
          "Which asset tier has the highest fee-to-revenue dependency?",
          "Identify the top 10 institutions with the most fees above the 75th percentile",
          "How do credit union NSF fees in the Southeast compare to bank NSF fees?",
        ],
      };
    }

    case "admin": {
      const ops = await opsContext();
      const systemPrompt = `${ADMIN_PREFIX}\n\n${dataStats}\n\n${REGULATION_INSTRUCTION}\n\n${EXTERNAL_INTELLIGENCE_INSTRUCTION}\n\nCRITICAL TOOL USAGE RULE: Make at most 2-3 tool calls total, then synthesize your findings into a complete response. Never call the same tool twice with the same parameters. If a tool returns empty or insufficient data, state what you found and what data was unavailable — do not retry.\n\n${HAMILTON_SYSTEM_PROMPT}${ops}`;
      return {
        id: "hamilton",
        name: "Hamilton",
        description:
          "Full analytical access with operational context, data quality signals, and pipeline management.",
        systemPrompt,
        tools: adminTools,
        model: process.env.BFI_MODEL_ADMIN || "claude-sonnet-4-6",
        maxTokens: 12000,
        maxSteps: 4,
        requiresAuth: true,
        requiredRole: "admin",
        exampleQuestions: [
          "What percentage of institutions charge above-median fees in more than 3 categories?",
          "Show me data quality gaps — categories with low coverage or high extraction uncertainty",
          "Which Fed districts show the largest bank-vs-CU fee gaps?",
          "What jobs are currently running and when did the last crawl complete?",
        ],
      };
    }
  }
}
