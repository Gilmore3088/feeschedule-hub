// src/app/api/scout/audit-batch/route.ts

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  ensureAuditTables,
  createAuditRun,
  updateAuditRunStats,
  getInstitutionsByScope,
} from "@/lib/scout/audit-db";
import { validator, discoverer, aiScout } from "@/lib/scout/audit-agents";
import type { AuditSSEEvent, AuditAgentId, BatchSummary } from "@/lib/scout/audit-types";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const { scope, value } = body;
  if (!scope || !value || !["state", "district"].includes(scope)) {
    return new Response(
      JSON.stringify({ error: "scope (state|district) and value required" }),
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AuditSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const log = (agentId: AuditAgentId) => (msg: string) => {
        send({ type: "log", agentId, msg });
      };

      try {
        await ensureAuditTables();

        const institutions = await getInstitutionsByScope(scope, value);
        if (!institutions.length) {
          send({ type: "error", msg: `No active institutions found for ${scope}=${value}` });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        // Cap at 500
        const batch = institutions.slice(0, 500);
        send({ type: "log", agentId: "reporter", msg: `Starting audit of ${batch.length} institutions (${scope}=${value})` });

        const auditRunId = await createAuditRun(scope, value, batch.length);
        const stats: BatchSummary = {
          total: batch.length,
          validated: 0,
          cleared: 0,
          discovered: 0,
          aiFound: 0,
          stillMissing: 0,
          aiCostCents: 0,
        };

        for (let i = 0; i < batch.length; i++) {
          // Check cancellation
          if (req.signal.aborted) {
            send({ type: "log", agentId: "reporter", msg: "Audit cancelled by client" });
            break;
          }

          const inst = batch[i];
          send({
            type: "batch_progress",
            batchProgress: { current: i + 1, total: batch.length, institution: inst.institution_name },
          });

          try {
            // Validator
            const valResult = await validator(inst, auditRunId, log("validator"));

            if (valResult.action === "validated") {
              stats.validated++;
              continue;
            }
            if (valResult.action === "cleared") {
              stats.cleared++;
            }

            // Discoverer
            const discResult = await discoverer(inst, auditRunId, log("discoverer"));
            if (discResult.action === "discovered") {
              stats.discovered++;
              continue;
            }

            // AI Scout
            const aiResult = await aiScout(inst, auditRunId, log("ai_scout"));
            stats.aiCostCents += aiResult.costCents;
            if (aiResult.result.action === "ai_found") {
              stats.aiFound++;
            } else {
              stats.stillMissing++;
            }
          } catch (instErr) {
            const msg = instErr instanceof Error ? instErr.message : String(instErr);
            send({ type: "log", agentId: "reporter", msg: `Error on ${inst.institution_name}: ${msg} — skipping` });
            stats.stillMissing++;
          }
        }

        await updateAuditRunStats(auditRunId, {
          urls_validated: stats.validated,
          urls_cleared: stats.cleared,
          urls_discovered: stats.discovered,
          urls_ai_found: stats.aiFound,
          still_missing: stats.stillMissing,
          ai_cost_cents: stats.aiCostCents,
        });

        send({ type: "batch_summary", batchSummary: stats });
        send({ type: "done", success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", msg });
        send({ type: "done", success: false });
      } finally {
        controller.close();
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
