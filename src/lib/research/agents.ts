import type { ToolSet } from "ai";
import { publicTools } from "./tools";
import { internalTools } from "./tools-internal";

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
  requiredRole: "viewer" | "analyst" | "admin" | null;
  exampleQuestions: string[];
}

const ASK_SYSTEM_PROMPT = `You are the Bank Fee Index research assistant. You help consumers and researchers understand bank and credit union fees across the United States.

You have access to a database of 65,000+ fee observations from 2,100+ institutions across all 50 states and 12 Federal Reserve districts.

Rules:
- Always cite specific numbers from tool results. Never invent or estimate data.
- Present comparisons in tables when comparing 3+ items.
- Keep responses concise — 2-4 paragraphs max.
- When a user asks about a specific institution, use the getInstitution tool with its ID, or searchInstitutions to find it first.
- When asked about fee categories, use searchFees. When asked about geographic or peer comparisons, use searchIndex.
- Link to relevant pages when helpful: /fees/[category], /research/state/[code], /institution/[id].
- Never provide financial advice. You report data; you don't recommend actions.
- If you cannot answer from the available data, say so clearly.`;

const FEE_ANALYST_SYSTEM_PROMPT = `You are a senior bank fee analyst with full access to the Bank Fee Index database. You help analysts benchmark fees, identify pricing patterns, compare institutions against peers, and produce data-driven insights.

You have access to 65,000+ fee observations across 49 categories from 2,100+ institutions, plus financial data from FDIC Call Reports and NCUA 5300 Reports, Fed Beige Book economic commentary, and fee-to-revenue correlation data.

Rules:
- Always cite specific data points with institution names, amounts, and observation counts.
- Present comparisons in tables. Use precise numbers, not approximations.
- Flag statistical outliers (fees more than 2x the median or below P25).
- When asked about trends, note whether historical data is available or if analysis is point-in-time.
- Cross-reference multiple data sources when possible (e.g., fees + financial data + geographic context).
- Explain your analytical methodology when performing complex comparisons.
- For peer comparisons, specify the peer group definition (charter type, asset tier, district).`;

const CUSTOM_QUERY_SYSTEM_PROMPT = `You are a flexible research assistant with comprehensive read-only access to the Bank Fee Index database. You can answer any analytical question about fees, institutions, financial data, and regulatory context.

You have access to all internal data: 49 fee categories, 2,100+ institutions with fees, financial data from call reports, Fed Beige Book summaries, district-level statistics, and fee-to-revenue correlations.

Rules:
- You construct efficient queries using the available tools. Explain your methodology.
- Present results clearly with tables and specific numbers.
- You CANNOT modify data — all access is read-only.
- When uncertain about data quality or completeness, say so.
- For complex questions, break them into steps and show your work.
- You can combine multiple tool calls to answer multi-part questions.`;

export const AGENTS: Record<string, AgentConfig> = {
  ask: {
    id: "ask",
    name: "Ask the Data",
    description:
      "Ask questions about bank fees, compare institutions, and explore fee data across the United States.",
    systemPrompt: ASK_SYSTEM_PROMPT,
    tools: publicTools,
    model: "claude-sonnet-4-5-20250514",
    maxTokens: 1024,
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
    systemPrompt: FEE_ANALYST_SYSTEM_PROMPT,
    tools: { ...publicTools, ...internalTools },
    model: "claude-sonnet-4-5-20250514",
    maxTokens: 2048,
    maxSteps: 5,
    requiresAuth: true,
    requiredRole: "analyst",
    exampleQuestions: [
      "Compare overdraft pricing for community banks in District 7 vs the national median",
      "Which asset tier has the highest fee-to-revenue dependency?",
      "Identify the top 10 institutions with the most fees above the 75th percentile",
      "How do credit union NSF fees in the Southeast compare to bank NSF fees?",
    ],
  },

  "custom-query": {
    id: "custom-query",
    name: "Custom Query",
    description:
      "Free-form analytical questions with broad data access. For complex, multi-step analysis.",
    systemPrompt: CUSTOM_QUERY_SYSTEM_PROMPT,
    tools: { ...publicTools, ...internalTools },
    model: "claude-sonnet-4-5-20250514",
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

export function getAgent(agentId: string): AgentConfig | undefined {
  return AGENTS[agentId];
}

export function getPublicAgents(): AgentConfig[] {
  return Object.values(AGENTS).filter((a) => !a.requiresAuth);
}

export function getAdminAgents(): AgentConfig[] {
  return Object.values(AGENTS).filter((a) => a.requiresAuth);
}
