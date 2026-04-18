export type DarwinStatus = {
  pending: number;
  today_promoted: number;
  today_cost_usd: number;
  circuit: { halted: boolean; reason?: string | null };
  recent_run_avg_tokens_per_row: number | null;
};

export type BatchEvent =
  | { type: "batch_start"; size: number }
  | { type: "candidates_selected"; count: number }
  | { type: "cache_lookup_done"; hits: number; total: number }
  | { type: "llm_call_start"; size: number }
  | { type: "llm_call_done"; success: boolean; error?: string }
  | {
      type: "row_complete";
      fee_raw_id: number;
      fee_name?: string;
      outcome: "promoted" | "cached_low_conf" | "rejected" | "failure";
      key?: string | null;
      confidence?: number;
      error?: string;
    }
  | { type: "halted"; reason: string }
  | { type: "done"; result: BatchResult }
  | { type: "error"; message: string };

export type BatchResult = {
  processed: number;
  cache_hits: number;
  llm_calls: number;
  promoted: number;
  cached_low_conf: number;
  rejected: number;
  failures: number;
  cost_usd: number;
  duration_s: number;
  circuit_tripped: boolean;
  halt_reason: string | null;
};

export const BATCH_SIZES = [100, 500, 1000] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];
