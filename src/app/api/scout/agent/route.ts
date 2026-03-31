// src/app/api/scout/agent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ensureAgentTables } from "@/lib/scout/agent-db";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { state } = await req.json();
  if (!state || state.length !== 2) {
    return NextResponse.json({ error: "state required (2-letter code)" }, { status: 400 });
  }

  await ensureAgentTables();

  const modalUrl = process.env.MODAL_AGENT_URL;
  if (!modalUrl) {
    return NextResponse.json({ error: "MODAL_AGENT_URL not configured" }, { status: 500 });
  }

  // Trigger Modal job (fire-and-forget — Modal runs async)
  try {
    const res = await fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state_code: state }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Modal error: ${text}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
