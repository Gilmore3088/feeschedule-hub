"use server";

/**
 * Command center server actions.
 *
 * Two surfaces:
 *   1. local()  — run a python -m fee_crawler subcommand via child_process.
 *                 Works when the Next.js server has filesystem access to
 *                 the repo + DATABASE_URL. Useful for dev / self-hosted.
 *   2. modal()  — POST to a Modal HTTP endpoint URL. Useful for the
 *                 deployed case where this UI sits in Vercel and the
 *                 agents run in Modal.
 *
 * Every action requires admin auth + only invokes whitelisted commands.
 */

import { requireAuth } from "@/lib/auth";

const ALLOWED_LOCAL_CMDS = new Set([
  "stats",
  "run-cron run_post_processing",
  "run-cron run_discovery",
  "run-cron test_connection",
  "historical-backfill --source fdic_sdp --years 5", // dry-run by default
]);

const ALLOWED_MODAL_ENDPOINTS = new Set([
  "atlas_dispatch",
  "extract_batch_endpoint",
  "state_run",
  "test_connection",
]);

export interface CommandResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  status?: number;
  error?: string;
  cmd?: string;
  duration_ms?: number;
}

// ─── LOCAL: python subprocess ───────────────────────────────────────

export async function runLocalCommand(cmd: string): Promise<CommandResult> {
  await requireAuth("trigger_jobs");

  if (!ALLOWED_LOCAL_CMDS.has(cmd)) {
    return {
      ok: false,
      error: `Command '${cmd}' not in allowlist. Allowed: ${[...ALLOWED_LOCAL_CMDS].join(", ")}`,
    };
  }

  const { spawn } = await import("node:child_process");
  const args = cmd.split(/\s+/);
  const t0 = Date.now();

  return await new Promise<CommandResult>((resolve) => {
    const child = spawn("python3", ["-m", "fee_crawler", ...args], {
      env: { ...process.env },
      cwd: process.cwd(),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (b) => stdoutChunks.push(b));
    child.stderr.on("data", (b) => stderrChunks.push(b));

    // 5-minute hard timeout — long enough for a real cron tick, short
    // enough that a wedged process doesn't tie up the server worker.
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5 * 60 * 1000);

    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({
        ok: code === 0,
        stdout: Buffer.concat(stdoutChunks).toString("utf8").slice(-8000),
        stderr: Buffer.concat(stderrChunks).toString("utf8").slice(-8000),
        status: code ?? -1,
        cmd: `python -m fee_crawler ${cmd}`,
        duration_ms: Date.now() - t0,
      });
    });
    child.on("error", (err) => {
      clearTimeout(killer);
      resolve({
        ok: false,
        error: err.message,
        cmd: `python -m fee_crawler ${cmd}`,
        duration_ms: Date.now() - t0,
      });
    });
  });
}

// ─── REMOTE: Modal HTTP endpoint ────────────────────────────────────

export async function callModalEndpoint(
  endpointName: string,
  payload: unknown,
): Promise<CommandResult> {
  await requireAuth("trigger_jobs");

  if (!ALLOWED_MODAL_ENDPOINTS.has(endpointName)) {
    return {
      ok: false,
      error: `Endpoint '${endpointName}' not in allowlist.`,
    };
  }

  const baseUrl = process.env.BFI_MODAL_WORKERS_BASE_URL;
  if (!baseUrl) {
    return {
      ok: false,
      error:
        "BFI_MODAL_WORKERS_BASE_URL not set. After `modal deploy`, run " +
        "`modal url bank-fee-index-workers <endpoint>` to get each URL " +
        "and set BFI_MODAL_WORKERS_BASE_URL to the common host prefix.",
    };
  }

  const t0 = Date.now();
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/${endpointName}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.REPORT_INTERNAL_SECRET
          ? { "X-Internal-Secret": process.env.REPORT_INTERNAL_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      stdout: text.slice(-8000),
      cmd: `POST ${url}`,
      duration_ms: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      cmd: `POST ${endpointName}`,
      duration_ms: Date.now() - t0,
    };
  }
}

// ─── Convenience wrappers used by the UI buttons ────────────────────

export async function triggerStats() {
  return await runLocalCommand("stats");
}

export async function triggerLocalDispatcher() {
  return await runLocalCommand("run-cron run_post_processing");
}

export async function triggerLocalDiscovery() {
  return await runLocalCommand("run-cron run_discovery");
}

export async function triggerLocalTestConnection() {
  return await runLocalCommand("run-cron test_connection");
}

export async function triggerHistoricalBackfillDryRun() {
  return await runLocalCommand("historical-backfill --source fdic_sdp --years 5");
}

export async function triggerAtlasForState(stateCode: string, size = 25) {
  // Strict 2-letter validation; can't be smuggled into the Modal endpoint
  if (!/^[A-Z]{2}$/i.test(stateCode)) {
    return { ok: false, error: "state_code must be 2 letters" };
  }
  return await callModalEndpoint("atlas_dispatch", {
    states_per_tick: 1,
    size_per_state: size,
    only_states: [stateCode.toUpperCase()],
    force: true,
  });
}

export async function triggerExtractBatch(size: number, doc_type?: string) {
  return await callModalEndpoint("extract_batch_endpoint", {
    size: Math.min(Math.max(size, 1), 500),  // bound 1..500
    document_type: doc_type ?? null,
    include_failing: false,
  });
}
