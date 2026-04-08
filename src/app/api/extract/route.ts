import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getCurrentUser } from "@/lib/auth";

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
    // Run extraction directly against Postgres using the agent's extract path
    // This bypasses the legacy SQLite-based CLI crawl command
    const script = `
import os, json, sys
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path('.env.local'))
load_dotenv()

import psycopg2, psycopg2.extras
conn = psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=psycopg2.extras.RealDictCursor)
cur = conn.cursor()
cur.execute('SELECT * FROM crawl_targets WHERE id = %s', (${targetId},))
inst = cur.fetchone()
if not inst:
    print(json.dumps({"error": "not found"}))
    sys.exit(1)
if not inst['fee_schedule_url']:
    print(json.dumps({"error": "no url"}))
    sys.exit(1)

from fee_crawler.agents.classify import classify_document
from fee_crawler.agents.extract_pdf import extract_pdf
from fee_crawler.agents.extract_html import extract_html

url = inst['fee_schedule_url']
doc_type = classify_document(url)
fees = extract_pdf(url, inst) if doc_type == 'pdf' else extract_html(url, inst)

if fees:
    from fee_crawler.agents.state_agent import _write_fees
    _write_fees(conn, inst['id'], fees)

print(json.dumps({"ok": True, "feeCount": len(fees), "docType": doc_type}))
conn.close()
`;

    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
      const proc = spawn("python3", ["-c", script], {
        cwd: process.cwd(),
        env: { ...process.env },
        timeout: 120_000,
      });

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });

    try {
      const parsed = JSON.parse(result.stdout.trim().split("\n").pop() || "{}");
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({
        ok: result.code === 0,
        output: result.stdout.slice(-500),
        stderr: result.stderr.slice(-500),
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
