import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const SIDECAR = process.env.DARWIN_SIDECAR_URL;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }
  const size = parseInt(req.nextUrl.searchParams.get("size") ?? "100", 10);
  if (!SIDECAR) return new Response("sidecar not configured", { status: 500 });

  const upstream = await fetch(`${SIDECAR}/darwin/classify-batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ size }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`sidecar ${upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
