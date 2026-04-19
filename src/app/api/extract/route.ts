import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EXTRACT_SINGLE_URL } from "@/lib/modal-endpoints";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "analyst")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { targetId } = await req.json();
  if (!targetId || typeof targetId !== "number") {
    return NextResponse.json({ error: "targetId required" }, { status: 400 });
  }

  try {
    const res = await fetch(EXTRACT_SINGLE_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: targetId }),
      signal: AbortSignal.timeout(130_000),
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { ok: res.ok, output: text.slice(-500) },
        { status: res.status },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
