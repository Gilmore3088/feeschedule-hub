"use server";

import { getCurrentUser } from "@/lib/auth";
import { MAGELLAN_SIDECAR_URL } from "@/lib/modal-endpoints";
import type { MagellanStatus } from "./types";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("forbidden");
}

export async function fetchMagellanStatus(): Promise<MagellanStatus> {
  await assertAdmin();
  try {
    const r = await fetch(`${MAGELLAN_SIDECAR_URL()}/magellan/status`, {
      cache: "no-store",
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
  await assertAdmin();
  try {
    const r = await fetch(`${MAGELLAN_SIDECAR_URL()}/magellan/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
