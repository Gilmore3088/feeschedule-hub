import type { ToolSet } from "ai";
import { buildHamiltonTools, buildHamiltonSystemPrompt } from "@/lib/hamilton/hamilton-agent";

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

// Hamilton is the single universal agent (D-07)
async function buildHamiltonAgent(id: string, requiresAuth: boolean): Promise<AgentConfig> {
  const tools = buildHamiltonTools();
  const systemPrompt = buildHamiltonSystemPrompt();
  return {
    id,
    name: "Hamilton",
    description:
      "Senior research analyst with access to all fee data, economic indicators, and national analytics.",
    systemPrompt,
    tools,
    model: process.env.BFI_MODEL_HAMILTON || "claude-sonnet-4-5-20250929",
    maxTokens: 4096,
    maxSteps: 10,
    requiresAuth,
    requiredRole: requiresAuth ? "premium" : null,
    exampleQuestions: [
      "What is the national median overdraft fee?",
      "Compare bank vs credit union monthly maintenance fees",
      "What does the national fee landscape look like?",
      "Analyze fee dependency ratios across asset tiers",
    ],
  };
}

// Known agent IDs and their auth requirements (per D-07)
const KNOWN_AGENTS: Record<string, boolean> = {
  ask: false,             // public — backward compat
  "fee-analyst": true,
  "content-writer": true,
  "custom-query": true,
  hamilton: true,
};

export async function getAgent(agentId: string): Promise<AgentConfig | undefined> {
  if (!(agentId in KNOWN_AGENTS)) return undefined;
  return buildHamiltonAgent(agentId, KNOWN_AGENTS[agentId]);
}

export async function getPublicAgents(): Promise<AgentConfig[]> {
  return [await buildHamiltonAgent("ask", false)];
}

export async function getAdminAgents(): Promise<AgentConfig[]> {
  return [await buildHamiltonAgent("hamilton", true)];
}
