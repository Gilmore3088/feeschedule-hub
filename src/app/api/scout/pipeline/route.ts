import { NextRequest } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { searchInstitutions, getExtractedFees, getCrawlResults } from "@/lib/scout/db";
import { scout, classifier, extractor, analyst } from "@/lib/scout/agents";
import type { SSEEvent, AgentId } from "@/lib/scout/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "research")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = await req.json();
  const query = body.query?.trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "query required" }), {
      status: 400,
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      const log =
        (agentId: AgentId) =>
        (msg: string) => {
          send({ type: "log", agentId, msg });
        };

      const startAgent = (id: AgentId) =>
        send({ type: "agent", agentId: id, status: "running" });

      const doneAgent = (id: AgentId, ok: boolean, ms: number) =>
        send({
          type: "agent",
          agentId: id,
          status: ok ? "ok" : "warn",
          durationMs: ms,
        });

      try {
        startAgent("scout");
        const t1 = Date.now();

        log("scout")(`Searching for "${query}"...`);
        const targets = await searchInstitutions(query);

        if (!targets.length) {
          send({
            type: "error",
            msg: `No institutions found matching "${query}"`,
          });
          send({ type: "done", success: false });
          controller.close();
          return;
        }

        const institution = targets[0];
        log("scout")(
          `Found ${targets.length} match(es) — using: ${institution.institution_name}`
        );

        const [fees, crawlResults] = await Promise.all([
          getExtractedFees(institution.id),
          getCrawlResults(institution.id),
        ]);

        const scoutResult = scout(
          institution,
          targets,
          fees,
          crawlResults,
          log("scout")
        );
        doneAgent("scout", true, Date.now() - t1);

        startAgent("classifier");
        const t2 = Date.now();
        const classifierResult = classifier(scoutResult, log("classifier"));
        doneAgent("classifier", true, Date.now() - t2);

        startAgent("extractor");
        const t3 = Date.now();
        const extractorResult = extractor(
          scoutResult,
          classifierResult,
          log("extractor")
        );
        doneAgent(
          "extractor",
          extractorResult.fees.length > 0,
          Date.now() - t3
        );

        startAgent("analyst");
        const t4 = Date.now();
        try {
          const report = await analyst(
            scoutResult,
            classifierResult,
            extractorResult,
            log("analyst")
          );
          doneAgent("analyst", true, Date.now() - t4);
          send({ type: "report", report });
          send({ type: "done", success: true });
        } catch (analystErr) {
          const analystMsg =
            analystErr instanceof Error ? analystErr.message : String(analystErr);
          send({
            type: "agent",
            agentId: "analyst",
            status: "error",
            durationMs: Date.now() - t4,
          });
          send({
            type: "log",
            agentId: "analyst",
            msg: `Analyst error: ${analystMsg}`,
          });
          send({
            type: "error",
            msg: `Analyst failed: ${analystMsg}. Scout/Classifier/Extractor data is still available above.`,
          });
          send({ type: "done", success: false });
        }
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
