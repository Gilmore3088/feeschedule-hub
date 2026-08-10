/**
 * Fleet board — per-persona queue health from the engine `jobs` table.
 *
 * Magellan(fetch) · Rosetta(read) · Knox(extract) · Darwin(verify). Reads the
 * live queue, not the legacy agent_messages telemetry. Safe fallbacks so a DB
 * hiccup renders an empty board, never a crash.
 */

import { sql } from "@/lib/crawler-db/connection";

export type QueueName = "resolve" | "fetch" | "read" | "extract" | "verify" | "rollup" | "report";

export interface PersonaQueue {
  queue: QueueName;
  persona: string; // Magellan / Rosetta / Knox / Darwin
  depth: number; // pending & runnable now
  running: number;
  dead: number;
  completedLastHour: number;
  oldestPendingSecs: number | null; // age of the oldest waiting job
}

const PERSONA: Record<string, string> = {
  fetch: "Magellan",
  read: "Rosetta",
  extract: "Knox",
  verify: "Darwin",
  resolve: "Magellan",
  rollup: "Atlas",
  report: "Hamilton",
};

/** One row per queue with depth / running / dead / throughput / oldest age. */
export async function getFleet(): Promise<PersonaQueue[]> {
  try {
    const rows = await sql<
      {
        queue: string;
        depth: string;
        running: string;
        dead: string;
        done_1h: string;
        oldest_secs: string | null;
      }[]
    >`
      SELECT queue,
             count(*) FILTER (WHERE status='pending' AND run_at <= NOW())      AS depth,
             count(*) FILTER (WHERE status='running')                           AS running,
             count(*) FILTER (WHERE status='dead')                              AS dead,
             count(*) FILTER (WHERE status='succeeded'
                              AND completed_at > NOW() - INTERVAL '1 hour')     AS done_1h,
             EXTRACT(EPOCH FROM (NOW() - min(run_at)
                     FILTER (WHERE status='pending' AND run_at <= NOW())))      AS oldest_secs
        FROM jobs
       GROUP BY queue
    `;
    return rows.map((r) => ({
      queue: r.queue as QueueName,
      persona: PERSONA[r.queue] ?? r.queue,
      depth: Number(r.depth),
      running: Number(r.running),
      dead: Number(r.dead),
      completedLastHour: Number(r.done_1h),
      oldestPendingSecs: r.oldest_secs == null ? null : Math.round(Number(r.oldest_secs)),
    }));
  } catch {
    return [];
  }
}

/** Dead-letter items for the triage view. */
export interface DeadJob {
  id: number;
  queue: string;
  persona: string;
  entityId: string;
  stateCode: string | null;
  attempts: number;
  error: string | null;
  failedAt: string | null;
}

export async function getDeadLetter(limit = 100): Promise<DeadJob[]> {
  try {
    const rows = await sql<
      {
        id: string;
        queue: string;
        entity_id: string;
        state_code: string | null;
        attempts: string;
        error: string | null;
        completed_at: string | null;
      }[]
    >`
      SELECT id, queue, entity_id, state_code, attempts, error, completed_at
        FROM jobs WHERE status='dead'
       ORDER BY completed_at DESC NULLS LAST
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      queue: r.queue,
      persona: PERSONA[r.queue] ?? r.queue,
      entityId: r.entity_id,
      stateCode: r.state_code,
      attempts: Number(r.attempts),
      error: r.error,
      failedAt: r.completed_at,
    }));
  } catch {
    return [];
  }
}
