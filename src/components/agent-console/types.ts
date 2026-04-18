export const BATCH_SIZES = [100, 500, 1000] as const;
export type BatchSizeOption = (typeof BATCH_SIZES)[number];

export type AgentCircuit = {
  halted: boolean;
  reason?: string | null;
};

export type AgentStatus = {
  pending: number;
  circuit: AgentCircuit;
};
