import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { sql } from "@/lib/crawler-db/connection";
import { summarizeJobOutput } from "@/lib/job-output-summary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mapJob(row: Record<string, unknown>) {
  const stdoutTail = row.stdout_tail ? String(row.stdout_tail) : null;
  const outputSummary = summarizeJobOutput(stdoutTail);
  return {
    id: Number(row.id),
    command: String(row.command),
    agent: String(row.agent_name ?? "atlas"),
    status: String(row.status),
    createdAt: row.created_at ? new Date(row.created_at as string | Date).toISOString() : null,
    startedAt: row.started_at ? new Date(row.started_at as string | Date).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string | Date).toISOString() : null,
    heartbeatAt: row.heartbeat_at ? new Date(row.heartbeat_at as string | Date).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string | Date).toISOString() : null,
    modalCallId: row.modal_call_id ? String(row.modal_call_id) : null,
    error: row.error_summary ? String(row.error_summary) : null,
    resultSummary: outputSummary ?? (row.result_summary ? String(row.result_summary) : null),
    stdoutTail,
    pipelineRunId: row.pipeline_run_id ? Number(row.pipeline_run_id) : null,
    pipelineStatus: row.pipeline_status ? String(row.pipeline_status) : null,
    lastCompletedJob: row.last_completed_job ? String(row.last_completed_job) : null,
    stagesDone: row.stages_done === null || row.stages_done === undefined ? null : Number(row.stages_done),
    stagesTotal: row.stages_total === null || row.stages_total === undefined ? null : Number(row.stages_total),
    pipelineError: row.pipeline_error ? String(row.pipeline_error) : null,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sql`
    SELECT ops.id, ops.command, ops.status, ops.agent_name, ops.created_at,
           ops.started_at, ops.completed_at, ops.heartbeat_at, ops.updated_at,
           ops.modal_call_id, ops.error_summary, ops.result_summary, ops.stdout_tail,
           pipeline.id AS pipeline_run_id,
           pipeline.status AS pipeline_status,
           pipeline.last_completed_job,
           pipeline.stages_done,
           pipeline.stages_total,
           pipeline.error_msg AS pipeline_error
      FROM ops_jobs ops
      LEFT JOIN LATERAL (
        SELECT id, status, last_completed_job, stages_done, stages_total, error_msg
          FROM pipeline_runs
         WHERE ops_job_id = ops.id
         ORDER BY id DESC
         LIMIT 1
      ) pipeline ON TRUE
     ORDER BY ops.created_at DESC
     LIMIT 20
  `;

  const jobs = rows.map(mapJob);
  const activeJobs = jobs.filter((job) =>
    ["queued", "running", "cancel_requested"].includes(job.status),
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    activeJobs,
    recentJobs: jobs.filter((job) => !activeJobs.some((active) => active.id === job.id)).slice(0, 8),
  });
}
