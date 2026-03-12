/**
 * Spawns Python crawler processes in detached mode and tracks them in ops_jobs.
 * Uses child_process.spawn() — no job queue dependencies needed.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { getWriteDb } from "./crawler-db/connection";

const LOGS_DIR = path.join(process.cwd(), "data", "logs");
const PYTHON_CMD = process.env.PYTHON_CMD || "python";

export interface SpawnResult {
  jobId: number;
  pid: number;
  logPath: string;
}

export function spawnJob(
  command: string,
  args: string[],
  triggeredBy: string,
  targetId?: number,
): SpawnResult {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = `${command}-${timestamp}.log`;
  const logPath = path.join(LOGS_DIR, logFile);

  const db = getWriteDb();
  let jobId: number;
  try {
    const result = db
      .prepare(
        `INSERT INTO ops_jobs (command, params_json, status, triggered_by, target_id)
         VALUES (?, ?, 'queued', ?, ?)`,
      )
      .run(command, JSON.stringify({ args }), triggeredBy, targetId ?? null);
    jobId = Number(result.lastInsertRowid);
  } finally {
    db.close();
  }

  const logStream = fs.openSync(logPath, "w");

  const child = spawn(PYTHON_CMD, ["-m", "fee_crawler", command, ...args], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logStream, logStream],
    env: { ...process.env },
  });

  const pid = child.pid ?? 0;

  const db2 = getWriteDb();
  try {
    db2.prepare(
      `UPDATE ops_jobs SET status = 'running', pid = ?, log_path = ?, started_at = datetime('now')
       WHERE id = ?`,
    ).run(pid, logPath, jobId);
  } finally {
    db2.close();
  }

  child.on("exit", (code) => {
    fs.closeSync(logStream);

    const tail = readLogTail(logPath, 50);
    const errorSummary =
      code !== 0 ? extractErrorSummary(tail) : null;

    const db3 = getWriteDb();
    try {
      db3.prepare(
        `UPDATE ops_jobs
         SET status = ?, exit_code = ?, completed_at = datetime('now'),
             stdout_tail = ?, error_summary = ?
         WHERE id = ?`,
      ).run(
        code === 0 ? "completed" : "failed",
        code,
        tail,
        errorSummary,
        jobId,
      );
    } finally {
      db3.close();
    }
  });

  child.unref();

  return { jobId, pid, logPath };
}

export function cancelJob(jobId: number): boolean {
  const db = getWriteDb();
  try {
    const job = db
      .prepare("SELECT id, pid, status FROM ops_jobs WHERE id = ?")
      .get(jobId) as { id: number; pid: number | null; status: string } | undefined;

    if (!job) return false;
    if (job.status !== "running" && job.status !== "queued") return false;

    if (job.pid) {
      try {
        process.kill(job.pid, "SIGTERM");
      } catch {
        // Process may already be dead
      }
    }

    db.prepare(
      `UPDATE ops_jobs SET status = 'cancelled', completed_at = datetime('now')
       WHERE id = ?`,
    ).run(jobId);

    return true;
  } finally {
    db.close();
  }
}

function readLogTail(logPath: string, lines: number): string {
  try {
    const content = fs.readFileSync(logPath, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function extractErrorSummary(logTail: string): string {
  const lines = logTail.split("\n");
  const errorLines = lines.filter(
    (l) =>
      l.toLowerCase().includes("error") ||
      l.toLowerCase().includes("traceback") ||
      l.toLowerCase().includes("exception"),
  );
  return errorLines.slice(-5).join("\n") || "Process exited with non-zero code";
}
