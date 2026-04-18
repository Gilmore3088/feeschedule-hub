"use server";

import { getCurrentUser } from "@/lib/auth";
import type { MagellanStatus } from "./types";

const SIDECAR = process.env.MAGELLAN_SIDECAR_URL;

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("forbidden");
}

export async function fetchMagellanStatus(): Promise<MagellanStatus> {
  await assertAdmin();
  if (!SIDECAR) throw new Error("MAGELLAN_SIDECAR_URL not set");
  const r = await fetch(`${SIDECAR}/magellan/status`, { cache: "no-store" });
  if (!r.ok) throw new Error(`sidecar status ${r.status}`);
  return r.json();
}

export async function resetMagellanCircuit(actor: string): Promise<{ ok: boolean }> {
  await assertAdmin();
  if (!SIDECAR) throw new Error("MAGELLAN_SIDECAR_URL not set");
  const r = await fetch(`${SIDECAR}/magellan/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor }),
  });
  if (!r.ok) throw new Error(`sidecar reset ${r.status}`);
  return r.json();
}
