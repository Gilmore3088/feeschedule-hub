"use server";

import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import { revalidatePath } from "next/cache";

export async function updateFeeUrl(
  institutionId: number,
  url: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("edit");

  if (!url.startsWith("http")) {
    return { error: "URL must start with http" };
  }

  try {
    await sql`
      UPDATE crawl_targets
      SET fee_schedule_url = ${url},
          document_type = NULL
      WHERE id = ${institutionId}
    `;

    // Auto-trigger extraction after URL save (fire-and-forget)
    runExtract(institutionId).catch(() => {});

    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("updateFeeUrl failed:", e);
    return { error: "Failed to update URL" };
  }
}

export async function approveFee(
  feeId: number,
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("approve");

  try {
    await sql`
      UPDATE extracted_fees SET review_status = 'approved' WHERE id = ${feeId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("approveFee failed:", e);
    return { error: "Failed to approve fee" };
  }
}

export async function markDuplicate(
  feeId: number,
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("reject");

  try {
    await sql`
      UPDATE extracted_fees SET review_status = 'rejected', validation_flags = jsonb_build_object('reason', 'duplicate') WHERE id = ${feeId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("markDuplicate failed:", e);
    return { error: "Failed to mark as duplicate" };
  }
}

export async function rejectFee(
  feeId: number,
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("reject");

  try {
    await sql`
      UPDATE extracted_fees SET review_status = 'rejected' WHERE id = ${feeId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("rejectFee failed:", e);
    return { error: "Failed to reject fee" };
  }
}

export async function approveAllFees(
  institutionId: number,
): Promise<{ ok?: boolean; error?: string; count?: number }> {
  await requireAuth("approve");

  try {
    const result = await sql`
      UPDATE extracted_fees SET review_status = 'approved'
      WHERE crawl_target_id = ${institutionId} AND review_status IN ('staged', 'pending')
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true, count: result.count };
  } catch (e) {
    console.error("approveAllFees failed:", e);
    return { error: "Failed to approve fees" };
  }
}

export async function updateFee(
  feeId: number,
  institutionId: number,
  updates: { amount?: number | null; fee_name?: string; conditions?: string },
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("edit");

  try {
    if (updates.amount !== undefined) {
      await sql`UPDATE extracted_fees SET amount = ${updates.amount} WHERE id = ${feeId}`;
    }
    if (updates.fee_name !== undefined) {
      await sql`UPDATE extracted_fees SET fee_name = ${updates.fee_name} WHERE id = ${feeId}`;
    }
    if (updates.conditions !== undefined) {
      await sql`UPDATE extracted_fees SET conditions = ${updates.conditions} WHERE id = ${feeId}`;
    }
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("updateFee failed:", e);
    return { error: "Failed to update fee" };
  }
}

export async function runExtract(
  institutionId: number,
): Promise<{ ok?: boolean; error?: string; feeCount?: number }> {
  await requireAuth("edit");

  try {
    const [inst] = await sql`SELECT * FROM crawl_targets WHERE id = ${institutionId}`;
    if (!inst) return { error: "Institution not found" };
    if (!inst.fee_schedule_url) return { error: "No fee schedule URL set" };

    // Run extraction directly via Python subprocess (no HTTP round-trip, no auth issues)
    const { spawn } = await import("child_process");
    const script = `
import os, json, sys
from dotenv import load_dotenv; load_dotenv('.env.local'); load_dotenv()
import psycopg2, psycopg2.extras
conn = psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()
cur.execute('SELECT * FROM crawl_targets WHERE id = %s', (${institutionId},))
inst = cur.fetchone()
if not inst or not inst['fee_schedule_url']:
    print(json.dumps({"error": "no url"})); sys.exit(1)
from fee_crawler.agents.classify import classify_document
from fee_crawler.agents.extract_pdf import extract_pdf
from fee_crawler.agents.extract_html import extract_html
url = inst['fee_schedule_url']
doc_type = classify_document(url)
fees = extract_pdf(url, inst) if doc_type == 'pdf' else extract_html(url, inst)
if fees:
    from fee_crawler.agents.state_agent import _write_fees
    _write_fees(conn, inst['id'], fees)
print(json.dumps({"ok": True, "feeCount": len(fees), "docType": doc_type}))
conn.close()
`;

    const result = await new Promise<{ stdout: string; code: number }>((resolve) => {
      const proc = spawn("python3", ["-c", script], {
        cwd: process.cwd(),
        env: { ...process.env },
        timeout: 120_000,
      });
      let stdout = "";
      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", () => {});
      proc.on("close", (code: number | null) => resolve({ stdout, code: code ?? 1 }));
    });

    revalidatePath(`/admin/institution/${institutionId}`);

    try {
      const parsed = JSON.parse(result.stdout.trim().split("\n").pop() || "{}");
      if (parsed.error) return { error: parsed.error };
      return { ok: true, feeCount: parsed.feeCount };
    } catch {
      return { ok: result.code === 0 };
    }
  } catch (e) {
    console.error("runExtract failed:", e);
    return { error: "Extraction failed: " + (e instanceof Error ? e.message : String(e)) };
  }
}

export async function markInstitutionOffline(
  institutionId: number,
): Promise<{ ok?: boolean; error?: string }> {
  await requireAuth("edit");

  try {
    await sql`
      UPDATE crawl_targets
      SET fee_schedule_url = NULL,
          document_type = 'offline'
      WHERE id = ${institutionId}
    `;
    revalidatePath(`/admin/institution/${institutionId}`);
    return { ok: true };
  } catch (e) {
    console.error("markInstitutionOffline failed:", e);
    return { error: "Failed to mark offline" };
  }
}
