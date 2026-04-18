import type { AgentStatus } from "@/components/agent-console/types";

export type MagellanStatus = AgentStatus & {
  rescued: number;
  dead: number;
  needs_human: number;
  retry_after: number;
  today_cost_usd: number;
};

export type RescueEvent =
  | { type: "candidates_selected"; count: number }
  | { type: "rung_done"; target_id: number; rung: string; fees: number; outcome: string }
  | {
      type: "row_complete";
      target_id: number;
      outcome: "rescued" | "dead" | "needs_human" | "retry_after" | "failure";
      rung?: string;
      fees?: number;
      error?: string;
    }
  | { type: "halted"; reason: string }
  | { type: "done"; result: RescueResult }
  | { type: "error"; message: string };

export type RescueResult = {
  processed: number;
  rescued: number;
  dead: number;
  needs_human: number;
  retry_after: number;
  failures: number;
  cost_usd: number;
  duration_s: number;
  circuit_tripped: boolean;
  halt_reason: string | null;
};
