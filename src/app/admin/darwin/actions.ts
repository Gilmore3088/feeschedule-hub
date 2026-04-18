"use server";

import { getCurrentUser } from "@/lib/auth";
import type { DarwinStatus } from "./types";

const SIDECAR = process.env.DARWIN_SIDECAR_URL;

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("forbidden");
  }
}

export async function fetchDarwinStatus(): Promise<DarwinStatus> {
  await assertAdmin();
  if (!SIDECAR) throw new Error("DARWIN_SIDECAR_URL not set");
  const r = await fetch(`${SIDECAR}/darwin/status`, { cache: "no-store" });
  if (!r.ok) throw new Error(`sidecar status ${r.status}`);
  return r.json();
}

export async function resetDarwinCircuit(actor: string): Promise<{ ok: boolean }> {
  await assertAdmin();
  if (!SIDECAR) throw new Error("DARWIN_SIDECAR_URL not set");
  const r = await fetch(`${SIDECAR}/darwin/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actor }),
  });
  if (!r.ok) throw new Error(`sidecar reset ${r.status}`);
  return r.json();
}

export async function classifyBatchStreamUrl(size: number): Promise<string> {
  await assertAdmin();
  if (!SIDECAR) throw new Error("DARWIN_SIDECAR_URL not set");
  // Return a URL the browser can EventSource directly. Sidecar accepts POST
  // but EventSource only supports GET — so we proxy through a Next.js API route.
  return `/api/admin/darwin/stream?size=${size}`;
}
