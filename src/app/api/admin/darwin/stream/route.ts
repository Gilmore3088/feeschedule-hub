import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DARWIN_SIDECAR_URL } from "@/lib/modal-endpoints";

function degradedStream(reason: string): Response {
  const body = new ReadableStream({
    start(controller) {
      const ev = `event: error\ndata: ${JSON.stringify({ type: "error", message: reason })}\n\n`;
      controller.enqueue(new TextEncoder().encode(ev));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
    status: 200, // degraded stream, not a server error
  });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }
  const size = parseInt(req.nextUrl.searchParams.get("size") ?? "100", 10);

  try {
    const upstream = await fetch(`${DARWIN_SIDECAR_URL()}/darwin/classify-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ size }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!upstream.ok || !upstream.body) {
      return degradedStream(`sidecar ${upstream.status}`);
    }

    return new Response(upstream.body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return degradedStream(`sidecar unreachable: ${msg}`);
  }
}
