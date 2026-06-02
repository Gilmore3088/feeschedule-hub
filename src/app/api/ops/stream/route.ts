/**
 * Audit #7: Server-Sent Events stream of /admin/ops job-status changes.
 *
 * Subscribes via PostgreSQL LISTEN on the `ops_jobs` channel (populated by the
 * AFTER INSERT/UPDATE trigger from migration 20260602_ops_jobs_notify_trigger).
 * Replaces the previous 3-second setInterval poll in ops-client.tsx so the UI
 * updates the instant a job's status flips.
 *
 * Requires DATABASE_URL_SESSION (session-mode pooler, port 5432) — the
 * transaction-mode pooler does NOT persist LISTEN registrations.
 */

import { getSessionSql } from "@/lib/crawler-db/connection";
import { getCurrentUser, hasPermission } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEEPALIVE_MS = 25_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "trigger_jobs")) {
    return new Response("Unauthorized", { status: 401 });
  }

  let sessionSql: ReturnType<typeof getSessionSql>;
  try {
    sessionSql = getSessionSql();
  } catch (err) {
    return new Response(
      `SSE unavailable: ${(err as Error).message}`,
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  let listenHandle: { unlisten: () => Promise<void> } | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed
        }
      };

      safeEnqueue(`: connected\n\n`);
      safeEnqueue(`event: ready\ndata: {"ok":true}\n\n`);

      try {
        listenHandle = await sessionSql.listen("ops_jobs", (payload) => {
          safeEnqueue(`event: ops_job\ndata: ${payload}\n\n`);
        });
      } catch (err) {
        safeEnqueue(
          `event: error\ndata: ${JSON.stringify({
            message: (err as Error).message,
          })}\n\n`,
        );
        controller.close();
        closed = true;
        return;
      }

      keepalive = setInterval(() => {
        safeEnqueue(`: keepalive ${Date.now()}\n\n`);
      }, KEEPALIVE_MS);
    },

    async cancel() {
      closed = true;
      if (keepalive) {
        clearInterval(keepalive);
        keepalive = null;
      }
      if (listenHandle) {
        try {
          await listenHandle.unlisten();
        } catch {
          // best-effort cleanup
        }
        listenHandle = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
