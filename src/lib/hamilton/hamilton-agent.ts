/**
 * Hamilton Agent — Tool registry and system prompt builder.
 *
 * Provides the LLM with access to:
 * - Fee data tools (national index, peer index, institution lookup)
 * - Fed district data + Beige Book
 * - Report generation trigger
 * - Admin pipeline tools
 */

import { tool } from "ai";
import { z } from "zod";
import { HAMILTON_SYSTEM_PROMPT } from "@/lib/hamilton/voice";
import { publicTools } from "@/lib/research/tools";
import { internalTools } from "@/lib/research/tools-internal";

// Allowlist for report types passed to the report engine (T-17-01)
const VALID_REPORT_TYPES = new Set([
  "national_index",
  "state_index",
  "peer_brief",
  "monthly_pulse",
]);

// Keywords that signal a complex analytical query requiring structured output
const GEOGRAPHIC_ANALYSIS_KEYWORDS = [
  "analyze",
  "analysis",
  "compare",
  "comparison",
  "benchmark",
  "benchmarking",
  "review",
  "trend",
  "trends",
  "district",
  "state",
  "region",
  "regional",
];

const REPORT_TYPE_KEYWORDS = [
  "report",
  "generate report",
  "create report",
  "produce report",
  "national index",
  "state index",
  "peer brief",
  "monthly pulse",
];

/**
 * Classify a user query as streaming (conversational) or report (structured analysis).
 *
 * Returns "report" if the query contains:
 * - Geographic scope + analysis verb (complex multi-entity analysis)
 * - Explicit report type mention
 * Returns "streaming" for all other queries.
 */
export function classifyQuery(text: string): "streaming" | "report" {
  const lower = text.toLowerCase();

  // Check for explicit report keywords
  for (const keyword of REPORT_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return "report";
  }

  // Check for geographic + analysis verb combo
  const hasAnalysisVerb = GEOGRAPHIC_ANALYSIS_KEYWORDS.some((kw) =>
    lower.includes(kw)
  );
  const hasGeographicScope =
    lower.includes(" district") ||
    lower.includes(" state") ||
    lower.includes(" region") ||
    lower.includes(" peer") ||
    // Two or more institution names (rough heuristic: "compare X to Y")
    (lower.includes(" to ") && hasAnalysisVerb) ||
    lower.includes(" vs ") ||
    lower.includes(" versus ");

  if (hasAnalysisVerb && hasGeographicScope) return "report";

  return "streaming";
}

/**
 * Build the Hamilton system prompt for chat context.
 *
 * Starts with the locked HAMILTON_SYSTEM_PROMPT from voice.ts, then appends:
 * - Tool usage instructions
 * - Response format guidance
 * - Date anchor
 */
export function buildHamiltonSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0];

  return `${HAMILTON_SYSTEM_PROMPT}

TOOL USAGE:
Hamilton has access to tools for querying live fee data, Federal Reserve district data, and institution records. Always query tools to ground analysis in live data before composing a response. Do not invent statistics.

RESPONSE FORMAT:
- Simple factual queries (single fee, single institution, quick comparison): respond conversationally in 2-4 paragraphs.
- Complex analyses (geographic scope, peer comparison, multi-category trends): produce a structured mini-report in markdown with ### headings, data tables, and a "## Key Finding" pull-quote section at the conclusion.
- When triggering a report, confirm the report type and parameters before calling triggerReport, then inform the user the report is generating.

Today's date: ${today}. Always ground analysis in tool results — never invent statistics.`;
}

/**
 * Build the Hamilton tool set — all public + admin internal tools + report trigger.
 */
export function buildHamiltonTools() {
  const triggerReport = tool({
    description:
      "Trigger a structured report for a geographic area or national index. Use when the user asks to generate, create, or produce a report. Returns a jobId — inform the user the report is being generated.",
    inputSchema: z.object({
      report_type: z
        .enum([
          "national_index",
          "state_index",
          "peer_brief",
          "monthly_pulse",
        ])
        .describe("The type of report to generate"),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .default({})
        .describe(
          "Report parameters. For state_index: { state_code: 'TX' }. For peer_brief: { charter: 'bank', tier: 'a' }."
        ),
    }),
    execute: async ({ report_type, params }) => {
      // T-17-01: validate report_type against explicit allowlist
      if (!VALID_REPORT_TYPES.has(report_type)) {
        return {
          error: `Invalid report type '${report_type}'. Allowed types: ${[...VALID_REPORT_TYPES].join(", ")}`,
        };
      }

      const baseUrl =
        process.env.BFI_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        "http://localhost:3000";

      try {
        const response = await fetch(`${baseUrl}/api/reports/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Pass internal cron secret so the report route accepts this request
            "X-Cron-Secret": process.env.BFI_REVALIDATE_TOKEN ?? "",
          },
          body: JSON.stringify({ report_type, params: params ?? {} }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          return {
            error: `Report generation failed (${response.status}): ${errBody}`,
          };
        }

        const data = (await response.json()) as { jobId?: string; error?: string };
        if (data.error) {
          return { error: data.error };
        }

        return {
          success: true,
          jobId: data.jobId,
          message: `Report '${report_type}' is now generating. Job ID: ${data.jobId}. The report will be available in the Reports tab once complete.`,
        };
      } catch (err) {
        return { error: `Failed to trigger report: ${String(err)}` };
      }
    },
  });

  return {
    ...publicTools,
    ...internalTools,
    triggerReport,
  };
}
