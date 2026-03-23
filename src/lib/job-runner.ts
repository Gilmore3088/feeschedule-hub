/**
 * Spawns Python crawler processes in detached mode and tracks them in ops_jobs.
 * Uses child_process.spawn() -- no job queue dependencies needed.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { sql } from "./crawler-db/connection";

const LOGS_DIR = path.join(process.cwd(), "data", "logs");
const PYTHON_CMD = process.env.PYTHON_CMD || "python";
const MAX_ACTIVE_JOBS = 3;

export interface SpawnResult {
  jobId: number;
  pid: number;
  logPath: string;
}

export async function spawnJob(
  command: string,
  args: string[],
  triggeredBy: string,
  targetId?: number,
): Promise<SpawnResult> {
  // Concurrency guard: prevent runaway job spawning
  try {
    const [row] = await sql`
      SELECT COUNT(*) as cnt FROM ops_jobs WHERE status IN ('running', 'queued')
    `;
    if (row && (row as { cnt: number }).cnt >= MAX_ACTIVE_JOBS) {
      throw new Error(`Cannot start job: ${(row as { cnt: number }).cnt} jobs already active (max ${MAX_ACTIVE_JOBS}). Wait for running jobs to complete.`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Cannot start job")) throw e;
    // If ops_jobs table doesn't exist yet, allow the spawn
  }

  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = `${command}-${timestamp}.log`;
  const logPath = path.join(LOGS_DIR, logFile);

  const [insertRow] = await sql`
    INSERT INTO ops_jobs (command, params_json, status, triggered_by, target_id)
    VALUES (${command}, ${JSON.stringify({ args })}, 'queued', ${triggeredBy}, ${targetId ?? null})
    RETURNING id
  `;
  const jobId = Number(insertRow.id);

  const logStream = fs.openSync(logPath, "w");

  const child = spawn(PYTHON_CMD, ["-u", "-m", "fee_crawler", command, ...args], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logStream, logStream],
    env: { ...process.env, BFI_JOB_ID: String(jobId) },
  });

  const pid = child.pid ?? 0;

  await sql`
    UPDATE ops_jobs SET status = 'running', pid = ${pid}, log_path = ${logPath}, started_at = NOW()
    WHERE id = ${jobId}
  `;

  child.on("exit", (code) => {
    fs.closeSync(logStream);

    const tail = readLogTail(logPath, 50);
    const errorSummary =
      code !== 0 ? extractErrorSummary(tail) : null;

    let resultSummary: string | null = null;
    const resultPath = path.join(LOGS_DIR, `${jobId}_result.json`);
    try {
      if (fs.existsSync(resultPath)) {
        const raw = fs.readFileSync(resultPath, "utf-8");
        JSON.parse(raw);
        resultSummary = raw;
      }
    } catch {
      // File missing or invalid, fall back
    }
    if (!resultSummary) {
      resultSummary = extractResultJson(tail);
    }

    const finalStatus = code === 0 || code === 2 ? "completed" : "failed";

    sql`
      UPDATE ops_jobs
      SET status = ${finalStatus}, exit_code = ${code}, completed_at = NOW(),
          stdout_tail = ${tail}, error_summary = ${errorSummary}, result_summary = ${resultSummary}
      WHERE id = ${jobId}
    `.catch((err) => {
      console.error(`[job-runner] Failed to update job ${jobId}:`, err);
    });
  });

  child.unref();

  return { jobId, pid, logPath };
}

export async function cancelJob(jobId: number): Promise<boolean> {
  const [job] = await sql`
    SELECT id, pid, status FROM ops_jobs WHERE id = ${jobId}
  ` as { id: number; pid: number | null; status: string }[];

  if (!job) return false;
  if (job.status !== "running" && job.status !== "queued") return false;

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      // Process may already be dead
    }
  }

  await sql`
    UPDATE ops_jobs SET status = 'cancelled', completed_at = NOW()
    WHERE id = ${jobId}
  `;

  return true;
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

const RESULT_SENTINEL = "##RESULT_JSON##";

function extractResultJson(logTail: string): string | null {
  const lines = logTail.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const idx = lines[i].indexOf(RESULT_SENTINEL);
    if (idx !== -1) {
      const jsonStr = lines[i].slice(idx + RESULT_SENTINEL.length).trim();
      try {
        JSON.parse(jsonStr);
        return jsonStr;
      } catch {
        return null;
      }
    }
  }
  return null;
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
