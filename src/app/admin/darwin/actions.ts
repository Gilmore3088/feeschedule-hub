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

export async function fetchDarwinReasoning(feeRawId: number): Promise<{
  reasoning_prompt: string | null;
  reasoning_output: string | null;
  created_at: string | null;
}> {
  await assertAdmin();
  // agent_events stores only reasoning_hash (SHA256), not raw prompt/output text.
  // The schema has no reasoning_prompt / reasoning_output columns — only reasoning_hash (BYTEA).
  // We return the event metadata we do have (entity_id, created_at) so the drawer
  // can confirm an event was logged, but raw text is not stored.
  const { sql } = await import("@/lib/crawler-db/connection");
  const rows = await sql`
    SELECT created_at::text AS created_at
      FROM agent_events
     WHERE agent_name = 'darwin'
       AND (
         (entity = 'fees_verified' AND entity_id = ${String(feeRawId)})
         OR (entity = 'classification_cache' AND input_payload::text LIKE ${`%${feeRawId}%`})
       )
     ORDER BY created_at DESC
     LIMIT 1
  `;
  const first = rows[0] as { created_at?: string } | undefined;
  return {
    reasoning_prompt: null,
    reasoning_output: null,
    created_at: first?.created_at ?? null,
  };
}
