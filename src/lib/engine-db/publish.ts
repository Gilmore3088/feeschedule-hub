/**
 * Atlas — national publish surface. Batch history, the live batch, and its
 * validation result, from publish_batches + fees_published_engine.
 */

import { sql } from "@/lib/crawler-db/connection";

export interface PublishBatch {
  batchId: number;
  status: "staging" | "active" | "superseded" | "rejected";
  rowCount: number;
  validation: Record<string, unknown>;
  createdAt: string;
  activatedAt: string | null;
}

export async function getPublishHistory(limit = 20): Promise<PublishBatch[]> {
  try {
    const rows = await sql<
      {
        batch_id: string;
        status: string;
        row_count: string;
        validation: Record<string, unknown> | null;
        created_at: string;
        activated_at: string | null;
      }[]
    >`
      SELECT batch_id, status, row_count, validation, created_at, activated_at
        FROM publish_batches ORDER BY batch_id DESC LIMIT ${limit}
    `;
    return rows.map((r) => ({
      batchId: Number(r.batch_id),
      status: r.status as PublishBatch["status"],
      rowCount: Number(r.row_count),
      validation: r.validation ?? {},
      createdAt: r.created_at,
      activatedAt: r.activated_at,
    }));
  } catch {
    return [];
  }
}

export interface LiveIndexSummary {
  activeBatch: number | null;
  publishedRows: number;
  institutions: number;
  activatedAt: string | null;
}

export async function getLiveIndexSummary(): Promise<LiveIndexSummary> {
  try {
    const [row] = await sql<
      { batch_id: string | null; rows: string; insts: string; activated_at: string | null }[]
    >`
      SELECT b.batch_id, count(fp.id) AS rows,
             count(DISTINCT fp.institution_id) AS insts, b.activated_at
        FROM publish_batches b
        LEFT JOIN fees_published_engine fp ON fp.batch_id = b.batch_id
       WHERE b.status='active'
       GROUP BY b.batch_id, b.activated_at
    `;
    return {
      activeBatch: row?.batch_id == null ? null : Number(row.batch_id),
      publishedRows: Number(row?.rows ?? 0),
      institutions: Number(row?.insts ?? 0),
      activatedAt: row?.activated_at ?? null,
    };
  } catch {
    return { activeBatch: null, publishedRows: 0, institutions: 0, activatedAt: null };
  }
}
