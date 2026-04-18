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
  reasoning_r2_key: string | null;
  created_at: string | null;
}> {
  await assertAdmin();
  const { sql } = await import("@/lib/crawler-db/connection");
  const rows = await sql`
    SELECT reasoning_prompt_text, reasoning_output_text, reasoning_r2_key, created_at::text AS created_at
      FROM agent_events
     WHERE agent_name = 'darwin'
       AND (
         (entity = 'fees_verified' AND entity_id = ${String(feeRawId)})
         OR (entity = 'classification_cache' AND input_payload::text LIKE ${`%${feeRawId}%`})
       )
     ORDER BY created_at DESC
     LIMIT 1
  `;
  const first = rows[0] as {
    reasoning_prompt_text?: string;
    reasoning_output_text?: string;
    reasoning_r2_key?: string;
    created_at?: string;
  } | undefined;
  return {
    reasoning_prompt: first?.reasoning_prompt_text ?? null,
    reasoning_output: first?.reasoning_output_text ?? null,
    reasoning_r2_key: first?.reasoning_r2_key ?? null,
    created_at: first?.created_at ?? null,
  };
}

export async function fetchReasoningFromR2(
  r2Key: string,
): Promise<{ prompt: string | null; output: string | null }> {
  await assertAdmin();
  if (!r2Key) return { prompt: null, output: null };
  const sidecar = process.env.DARWIN_SIDECAR_URL;
  if (!sidecar) throw new Error("DARWIN_SIDECAR_URL not set");
  const r = await fetch(`${sidecar}/darwin/reasoning/${encodeURIComponent(r2Key)}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`sidecar reasoning ${r.status}`);
  return r.json();
}

export async function reclassifyFee(feeRawId: number): Promise<{
  fee_raw_id: number;
  fee_name: string | null;
  normalized_name: string | null;
  prompt: string | null;
  output: string | null;
  error?: string;
}> {
  await assertAdmin();
  const sidecar = process.env.DARWIN_SIDECAR_URL;
  if (!sidecar) throw new Error("DARWIN_SIDECAR_URL not set");
  const r = await fetch(`${sidecar}/darwin/reclassify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fee_raw_id: feeRawId }),
  });
  if (!r.ok) throw new Error(`reclassify ${r.status}`);
  return r.json();
}
