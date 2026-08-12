"use server";

import { requireAuth } from "@/lib/auth";
import { spawnJob } from "@/lib/job-runner";
import { MAGELLAN_SIDECAR_URL, modalInternalHeaders } from "@/lib/modal-endpoints";
import type { MagellanStatus } from "./types";

export async function fetchMagellanStatus(): Promise<MagellanStatus> {
  await requireAuth("view");
  try {
    const r = await fetch(`${MAGELLAN_SIDECAR_URL()}/magellan/status`, {
      cache: "no-store",
      headers: modalInternalHeaders(),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`sidecar ${r.status}`);
    return r.json();
  } catch (e) {
    console.warn("magellan sidecar unavailable:", e instanceof Error ? e.message : e);
    return {
      pending: 0,
      circuit: { halted: true, reason: "sidecar unavailable" },
      rescued: 0,
      dead: 0,
      needs_human: 0,
      retry_after: 0,
      today_cost_usd: 0,
    };
  }
}

export async function resetMagellanCircuit(actor: string): Promise<{ ok: boolean }> {
  await requireAuth("trigger_jobs");
  try {
    const r = await fetch(`${MAGELLAN_SIDECAR_URL()}/magellan/reset`, {
      method: "POST",
      headers: { "content-type": "application/json", ...modalInternalHeaders() },
      body: JSON.stringify({ actor }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`sidecar reset ${r.status}`);
    return r.json();
  } catch (e) {
    console.warn("magellan sidecar reset failed:", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

export async function runMagellanRepair(
  size: number,
  batches: number,
): Promise<{ success: boolean; jobId?: number; reused?: boolean; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  if (![100, 500, 1000].includes(size) || !Number.isInteger(batches) || batches < 1 || batches > 20) {
    return { success: false, error: "Invalid repair batch request" };
  }
  try {
    const result = await spawnJob(
      "magellan-rescue",
      ["--size", String(size), "--batches", String(batches)],
      user.username,
      undefined,
      { agent: "magellan", idempotencyKey: "magellan:rescue" },
    );
    return { success: true, jobId: result.jobId, reused: result.reused };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
