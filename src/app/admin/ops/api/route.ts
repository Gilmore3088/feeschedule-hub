import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getOpsJobSummary, getActiveJobs, getRecentJobs } from "@/lib/crawler-db/ops";
import fs from "fs";
import path from "path";

const ALLOWED_LOGS_DIR = path.resolve(process.cwd(), "data", "logs");

function tailFile(filePath: string, lines = 40): string {
  try {
    if (!filePath) return "";
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(ALLOWED_LOGS_DIR)) return "";
    if (!fs.existsSync(resolved)) return "";
    const content = fs.readFileSync(resolved, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function getFileSize(filePath: string): number {
  try {
    if (!filePath) return 0;
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(ALLOWED_LOGS_DIR)) return 0;
    if (!fs.existsSync(resolved)) return 0;
    return fs.statSync(resolved).size;
  } catch {
    return 0;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "trigger_jobs")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getOpsJobSummary();
  const activeJobs = await getActiveJobs();
  const recentJobs = await getRecentJobs(20);

  // Attach live log tail + elapsed time to running jobs
  const now = Date.now();
  const activeWithLogs = activeJobs.map((job) => {
    const elapsed = job.started_at
      ? Math.floor((now - new Date(job.started_at).getTime()) / 1000)
      : 0;
    return {
      ...job,
      live_log: job.log_path ? tailFile(job.log_path, 40) : "",
      log_size: job.log_path ? getFileSize(job.log_path) : 0,
      elapsed_seconds: elapsed,
    };
  });

  return NextResponse.json({ summary, activeJobs: activeWithLogs, recentJobs });
}
