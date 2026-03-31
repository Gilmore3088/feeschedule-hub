// src/app/api/scout/audit/route.ts

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureAuditTables, createAuditRun, updateAuditRunStats, getInstitutionById } from "@/lib/scout/audit-db";
import { validator, discoverer, aiScout } from "@/lib/scout/audit-agents";
import type { AuditSSEEvent, AuditAgentId, BatchSummary } from "@/lib/scout/audit-types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await req.json();
  const institutionId = body.institutionId;
  if (!institutionId) {
    return new Response(JSON.stringify({ error: "institutionId required" }), { status: 400 });
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
      const startAgent = (id: AuditAgentId) =>
        send({ type: "agent", agentId: id, status: "running" });
      const doneAgent = (id: AuditAgentId, ok: boolean, ms: number) =>
        send({ type: "agent", agentId: id, status: ok ? "ok" : "warn", durationMs: ms });

      try {
        await ensureAuditTables();

        const institution = await getInstitutionById(institutionId);
        if (!institution) {
          send({ type: "error", msg: `Institution ${institutionId} not found` });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        const auditRunId = await createAuditRun("institution", String(institutionId), 1);
        const stats: BatchSummary = { total: 1, validated: 0, cleared: 0, discovered: 0, aiFound: 0, stillMissing: 0, aiCostCents: 0 };

        // ── Validator ──
        startAgent("validator");
        const t1 = Date.now();
        const valResult = await validator(institution, auditRunId, log("validator"));
        doneAgent("validator", true, Date.now() - t1);

        if (valResult.action === "validated") {
          stats.validated = 1;
          send({ type: "result", result: valResult });
        } else if (valResult.action === "cleared") {
          stats.cleared = 1;
        }

        // ── Discoverer (if URL still missing) ──
        const needsDiscovery = valResult.action !== "validated";
        if (needsDiscovery) {
          startAgent("discoverer");
          const t2 = Date.now();
          const discResult = await discoverer(institution, auditRunId, log("discoverer"));
          doneAgent("discoverer", discResult.action === "discovered", Date.now() - t2);

          if (discResult.action === "discovered") {
            stats.discovered = 1;
            send({ type: "result", result: discResult });
          } else {
            // ── AI Scout (if heuristics failed) ──
            startAgent("ai_scout");
            const t3 = Date.now();
            const aiResult = await aiScout(institution, auditRunId, log("ai_scout"));
            doneAgent("ai_scout", aiResult.result.action === "ai_found", Date.now() - t3);
            stats.aiCostCents = aiResult.costCents;

            if (aiResult.result.action === "ai_found") {
              stats.aiFound = 1;
              send({ type: "result", result: aiResult.result });
            } else {
              stats.stillMissing = 1;
              send({ type: "result", result: aiResult.result });
            }
          }
        } else {
          // Skip discoverer and AI scout — already valid
          send({ type: "agent", agentId: "discoverer", status: "ok" });
          send({ type: "agent", agentId: "ai_scout", status: "ok" });
        }

        // ── Reporter ──
        startAgent("reporter");
        const t4 = Date.now();
        log("reporter")(`Audit complete for ${institution.institution_name}`);
        log("reporter")(`Result: ${valResult.action === "validated" ? "URL valid" : stats.discovered ? "URL discovered via heuristics" : stats.aiFound ? "URL found via AI" : "No fee schedule found"}`);
        doneAgent("reporter", true, Date.now() - t4);

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
