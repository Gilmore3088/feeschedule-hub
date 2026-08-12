"use server";

import { requireAuth } from "@/lib/auth";
import { spawnJob } from "@/lib/job-runner";
import { DARWIN_SIDECAR_URL, modalInternalHeaders } from "@/lib/modal-endpoints";
import type { DarwinStatus } from "./types";

export async function fetchDarwinStatus(): Promise<DarwinStatus> {
  await requireAuth("view");
  const r = await fetch(`${DARWIN_SIDECAR_URL()}/darwin/status`, {
    cache: "no-store",
    headers: modalInternalHeaders(),
  });
  if (!r.ok) throw new Error(`sidecar status ${r.status}`);
  return r.json();
}

export async function resetDarwinCircuit(actor: string): Promise<{ ok: boolean }> {
  await requireAuth("trigger_jobs");
  const r = await fetch(`${DARWIN_SIDECAR_URL()}/darwin/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", ...modalInternalHeaders() },
    body: JSON.stringify({ actor }),
  });
  if (!r.ok) throw new Error(`sidecar reset ${r.status}`);
  return r.json();
}

export async function runDarwinRepair(
  size: number,
  batches: number,
): Promise<{ success: boolean; jobId?: number; reused?: boolean; error?: string }> {
  const user = await requireAuth("trigger_jobs");
  if (![100, 500, 1000].includes(size) || !Number.isInteger(batches) || batches < 1 || batches > 20) {
    return { success: false, error: "Invalid classification batch request" };
  }
  try {
    const result = await spawnJob(
      "darwin-drain",
      ["--size", String(size), "--batches", String(batches)],
      user.username,
      undefined,
      { agent: "darwin", idempotencyKey: "darwin:classification-repair" },
    );
    return { success: true, jobId: result.jobId, reused: result.reused };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchDarwinReasoning(feeRawId: number): Promise<{
  reasoning_prompt: string | null;
  reasoning_output: string | null;
  reasoning_r2_key: string | null;
  created_at: string | null;
}> {
  await requireAuth("view");
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
  await requireAuth("view");
  if (!r2Key) return { prompt: null, output: null };
  const r = await fetch(`${DARWIN_SIDECAR_URL()}/darwin/reasoning/${encodeURIComponent(r2Key)}`, {
    cache: "no-store",
    headers: modalInternalHeaders(),
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
  await requireAuth("trigger_jobs");
  const r = await fetch(`${DARWIN_SIDECAR_URL()}/darwin/reclassify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...modalInternalHeaders() },
    body: JSON.stringify({ fee_raw_id: feeRawId }),
  });
  if (!r.ok) throw new Error(`reclassify ${r.status}`);
  return r.json();
}
