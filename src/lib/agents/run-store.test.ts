import { beforeEach, describe, expect, it, vi } from "vitest";

type TxMock = ReturnType<typeof vi.fn> & { unsafe: ReturnType<typeof vi.fn> };

const {
  sqlMock,
  txMock,
  withTransactionMock,
  getExecutionBackendMock,
  runDarwinVerifyMock,
  runHamiltonPublishMock,
  runKnoxExtractMock,
  runMagellanDiscoveryMock,
  runMagellanFetchMock,
  runRosettaReadMock,
} = vi.hoisted(() => {
  const tx = vi.fn() as TxMock;
  tx.unsafe = vi.fn();
  const withTransaction = vi.fn(async (callback: (transaction: TxMock) => Promise<unknown>) => callback(tx));
  return {
    sqlMock: vi.fn(),
    txMock: tx,
    withTransactionMock: withTransaction,
    getExecutionBackendMock: vi.fn(),
    runDarwinVerifyMock: vi.fn(),
    runHamiltonPublishMock: vi.fn(),
    runKnoxExtractMock: vi.fn(),
    runMagellanDiscoveryMock: vi.fn(),
    runMagellanFetchMock: vi.fn(),
    runRosettaReadMock: vi.fn(),
  };
});

vi.mock("@/lib/crawler-db/connection", () => ({
  sql: sqlMock,
  withTransaction: withTransactionMock,
}));

vi.mock("@/lib/execution-backend", () => ({
  getExecutionBackend: getExecutionBackendMock,
}));

vi.mock("@/lib/agents/darwin/verify", () => ({
  runDarwinVerify: runDarwinVerifyMock,
}));

vi.mock("@/lib/agents/hamilton/publish", () => ({
  runHamiltonPublish: runHamiltonPublishMock,
}));

vi.mock("@/lib/agents/knox/extract", () => ({
  runKnoxExtract: runKnoxExtractMock,
}));

vi.mock("@/lib/agents/magellan/discovery", () => ({
  runMagellanDiscovery: runMagellanDiscoveryMock,
}));

vi.mock("@/lib/agents/magellan/fetch", () => ({
  runMagellanFetch: runMagellanFetchMock,
}));

vi.mock("@/lib/agents/rosetta/read", () => ({
  runRosettaRead: runRosettaReadMock,
}));

import { cancelAgentRun, startAgentRun } from "./run-store";

const runRow = {
  id: 101,
  agent_name: "atlas",
  run_kind: "workflow",
  title: "Atlas full data cycle",
  status: "queued",
  started_at: "2026-08-12T20:00:00.000Z",
  completed_at: null,
  updated_at: "2026-08-12T20:00:00.000Z",
  trigger_source: "admin",
  triggered_by: "admin",
  correlation_id: "00000000-0000-4000-8000-000000000001",
  backend: "agentic_v1",
  progress_current: 0,
  progress_total: 2,
  current_stage: "discover",
  error_summary: null,
  summary: "Created",
  params_json: { limit: 10 },
};

const blockedRunRow = {
  ...runRow,
  status: "blocked",
  error_summary: "agentic execution backend is disabled",
};

const completedRunRow = {
  ...runRow,
  status: "completed",
  completed_at: "2026-08-12T20:01:00.000Z",
  updated_at: "2026-08-12T20:01:00.000Z",
  progress_current: 2,
  current_stage: null,
  summary: "Agentic run advanced through the TypeScript run ledger.",
};

const queuedStepRows = [
  {
    id: 201,
    agent_run_id: 101,
    step_key: "discover",
    agent_name: "magellan",
    title: "Find URLs",
    status: "queued",
    sequence: 1,
    summary: null,
    error_summary: null,
    queued_at: "2026-08-12T20:00:00.000Z",
    started_at: null,
    completed_at: null,
    updated_at: "2026-08-12T20:00:00.000Z",
  },
  {
    id: 202,
    agent_run_id: 101,
    step_key: "review",
    agent_name: "knox",
    title: "Review exceptions",
    status: "queued",
    sequence: 2,
    summary: null,
    error_summary: null,
    queued_at: "2026-08-12T20:00:00.000Z",
    started_at: null,
    completed_at: null,
    updated_at: "2026-08-12T20:00:00.000Z",
  },
];

const blockedStepRows = [
  {
    ...queuedStepRows[0],
    status: "blocked",
    error_summary: "Waiting for EXECUTION_BACKEND=agentic_v1",
  },
  queuedStepRows[1],
];

const completedStepRows = queuedStepRows.map((step) => ({
  ...step,
  status: "completed",
  summary: `${step.title} completed`,
  completed_at: "2026-08-12T20:01:00.000Z",
  updated_at: "2026-08-12T20:01:00.000Z",
}));

function templateText(strings: unknown): string {
  return Array.isArray(strings) ? strings.join(" ") : String(strings);
}

function installSqlMocks({
  idempotencyRows = [],
  finalRun = blockedRunRow,
  finalSteps = blockedStepRows,
}: {
  idempotencyRows?: Array<Record<string, unknown>>;
  finalRun?: Record<string, unknown>;
  finalSteps?: Array<Record<string, unknown>>;
} = {}) {
  sqlMock.mockImplementation((strings: TemplateStringsArray) => {
    const text = templateText(strings);
    if (text.includes("WHERE idempotency_key")) return Promise.resolve(idempotencyRows);
    if (text.includes("FROM agent_run_steps")) return Promise.resolve(finalSteps);
    if (text.includes("FROM agent_runs")) return Promise.resolve([finalRun]);
    return Promise.resolve([]);
  });
}

function installTxMocks(
  stepRows = queuedStepRows,
  runOverride: Record<string, unknown> = runRow,
) {
  txMock.mockImplementation((strings: TemplateStringsArray) => {
    const text = templateText(strings);
    if (text.includes("INSERT INTO agent_runs")) return Promise.resolve([runOverride]);
    if (text.includes("FROM agent_runs")) return Promise.resolve([runOverride]);
    if (text.includes("FROM agent_run_steps")) return Promise.resolve(stepRows);
    if (text.includes("FROM agent_messages")) {
      return Promise.resolve([
        { bucket: "pending", cnt: "3" },
        { bucket: "confirmed", cnt: "2" },
        { bucket: "overridden", cnt: "1" },
      ]);
    }
    return Promise.resolve([]);
  });
  txMock.unsafe.mockResolvedValue([{ count: "7" }]);
}

function combinedTransactionSql(): string {
  return txMock.mock.calls.map((call) => templateText(call[0])).join("\n");
}

describe("agentic run store", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    txMock.mockReset();
    txMock.unsafe.mockReset();
    withTransactionMock.mockClear();
    getExecutionBackendMock.mockReset().mockReturnValue("disabled");
    runDarwinVerifyMock.mockReset().mockResolvedValue({
      selectedRawFees: 7,
      processedRawFees: 7,
      verifiedFees: 6,
      skippedFees: 1,
      limit: 10,
      dryRun: false,
      results: [],
    });
    runHamiltonPublishMock.mockReset().mockResolvedValue({
      selectedVerifiedFees: 6,
      processedVerifiedFees: 6,
      publishedFees: 5,
      skippedFees: 1,
      limit: 10,
      minConfidence: 0.8,
      dryRun: false,
      batchId: "agentic-run-101",
      results: [],
    });
    runMagellanDiscoveryMock.mockReset().mockResolvedValue({
      selected: 10,
      processed: 10,
      discovered: 3,
      dead: 2,
      needsHuman: 1,
      retryAfter: 4,
      failures: 0,
      attemptedUrls: 21,
      limit: 10,
      dryRun: false,
      results: [],
    });
    runMagellanFetchMock.mockReset().mockResolvedValue({
      selected: 10,
      processed: 10,
      succeeded: 8,
      failed: 1,
      skipped: 1,
      bytes: 1024,
      limit: 10,
      dryRun: false,
      results: [],
    });
    runRosettaReadMock.mockReset().mockResolvedValue({
      selected: 4,
      processed: 4,
      completed: 3,
      empty: 0,
      needsOcr: 1,
      failed: 0,
      skipped: 0,
      chars: 4096,
      limit: 4,
      dryRun: false,
      results: [],
    });
    runKnoxExtractMock.mockReset().mockResolvedValue({
      selectedDocuments: 3,
      processedDocuments: 3,
      extractedFees: 8,
      insertedFees: 7,
      skippedFees: 1,
      limit: 10,
      dryRun: false,
      results: [],
    });
  });

  it("creates a visible blocked run shell without any legacy backend call when execution is disabled", async () => {
    installSqlMocks();
    installTxMocks();

    const result = await startAgentRun({
      agent: "atlas",
      kind: "workflow",
      title: "Atlas full data cycle",
      params: { limit: 10 },
      triggeredBy: "admin",
      idempotencyKey: "atlas:test",
      steps: [
        { key: "discover", agent: "magellan", title: "Find URLs" },
        { key: "review", agent: "knox", title: "Review exceptions" },
      ],
    });

    expect(result.reused).toBe(false);
    expect(result.run).toMatchObject({
      id: 101,
      agent: "atlas",
      status: "blocked",
      backend: "agentic_v1",
      progressTotal: 2,
    });
    expect(result.steps[0]).toMatchObject({ status: "blocked" });
    expect(txMock.unsafe).not.toHaveBeenCalled();
    expect(runMagellanDiscoveryMock).not.toHaveBeenCalled();
    expect(runMagellanFetchMock).not.toHaveBeenCalled();
    const combinedSql = combinedTransactionSql();
    expect(combinedSql).toContain("INSERT INTO agent_runs");
    expect(combinedSql).toContain("INSERT INTO agent_run_steps");
    expect(combinedSql).toContain("run.blocked");
    expect(combinedSql).not.toContain("ops_jobs");
  });

  it("advances steps through the TypeScript ledger when agentic_v1 is enabled", async () => {
    getExecutionBackendMock.mockReturnValue("agentic_v1");
    installSqlMocks({ finalRun: completedRunRow, finalSteps: completedStepRows });
    installTxMocks();

    const result = await startAgentRun({
      agent: "atlas",
      kind: "workflow",
      title: "Atlas full data cycle",
      params: { limit: 10 },
      triggeredBy: "admin",
      idempotencyKey: "atlas:test",
      steps: [
        { key: "discover", agent: "magellan", title: "Find URLs" },
        { key: "review", agent: "knox", title: "Review exceptions" },
      ],
    });

    expect(result.reused).toBe(false);
    expect(result.run).toMatchObject({
      id: 101,
      status: "completed",
      progressCurrent: 2,
      progressTotal: 2,
    });
    expect(result.steps.every((step) => step.status === "completed")).toBe(true);
    expect(runMagellanDiscoveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 101,
        mode: "discover",
        dryRun: false,
        limit: 10,
      }),
    );
    const combinedSql = combinedTransactionSql();
    expect(combinedSql).toContain("FROM agent_messages");
    expect(combinedSql).toContain("knox_overrides");
    expect(combinedSql).not.toContain("extracted_fees");
    expect(combinedSql).toContain("step.started");
    expect(combinedSql).toContain("step.finished");
    expect(combinedSql).toContain("run.completed");
    expect(combinedSql).not.toContain("ops_jobs");
  });

  it("runs Magellan fetch through the agentic worker instead of measuring only", async () => {
    getExecutionBackendMock.mockReturnValue("agentic_v1");
    const fetchStepRows = [
      {
        ...queuedStepRows[0],
        step_key: "fetch",
        title: "Fetch the institution fee document",
      },
    ];
    const completedFetchStepRows = [
      {
        ...completedStepRows[0],
        step_key: "fetch",
        title: "Fetch the institution fee document",
      },
    ];
    const fetchRunRow = {
      ...runRow,
      agent_name: "magellan",
      run_kind: "manual_repair",
      params_json: { institution_id: 42, fetch_limit: 1 },
    };
    installSqlMocks({ finalRun: completedRunRow, finalSteps: completedFetchStepRows });
    installTxMocks(fetchStepRows, fetchRunRow);

    const result = await startAgentRun({
      agent: "magellan",
      kind: "manual_repair",
      title: "Extract fees for Test Bank",
      params: { institution_id: 42, fetch_limit: 1 },
      triggeredBy: "admin",
      idempotencyKey: "institution:42:extract",
      steps: [{ key: "fetch", agent: "magellan", title: "Fetch the institution fee document" }],
    });

    expect(result.reused).toBe(false);
    expect(runMagellanFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 101,
        dryRun: false,
        limit: 1,
        institutionId: 42,
      }),
    );
    expect(txMock.unsafe).not.toHaveBeenCalledWith(
      expect.stringContaining("fee_schedule_url IS NOT NULL"),
    );
  });

  it("runs Rosetta read through the agentic worker instead of measuring only", async () => {
    getExecutionBackendMock.mockReturnValue("agentic_v1");
    const readStepRows = [
      {
        ...queuedStepRows[0],
        step_key: "read",
        agent_name: "rosetta",
        title: "Read source document text",
      },
    ];
    const completedReadStepRows = [
      {
        ...completedStepRows[0],
        step_key: "read",
        agent_name: "rosetta",
        title: "Read source document text",
      },
    ];
    const readRunRow = {
      ...runRow,
      agent_name: "rosetta",
      run_kind: "manual_repair",
      params_json: { institution_id: 42, read_limit: 4 },
    };
    installSqlMocks({ finalRun: completedRunRow, finalSteps: completedReadStepRows });
    installTxMocks(readStepRows, readRunRow);

    const result = await startAgentRun({
      agent: "rosetta",
      kind: "manual_repair",
      title: "Read fees for Test Bank",
      params: { institution_id: 42, read_limit: 4 },
      triggeredBy: "admin",
      idempotencyKey: "institution:42:read",
      steps: [{ key: "read", agent: "rosetta", title: "Read source document text" }],
    });

    expect(result.reused).toBe(false);
    expect(runRosettaReadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 101,
        dryRun: false,
        limit: 4,
        institutionId: 42,
      }),
    );
    expect(txMock.unsafe).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM crawl_results"),
    );
  });

  it("runs Knox extraction through the agentic worker instead of measuring only", async () => {
    getExecutionBackendMock.mockReturnValue("agentic_v1");
    const extractStepRows = [
      {
        ...queuedStepRows[0],
        step_key: "extract",
        agent_name: "knox",
        title: "Extract raw fee observations",
      },
    ];
    const completedExtractStepRows = [
      {
        ...completedStepRows[0],
        step_key: "extract",
        agent_name: "knox",
        title: "Extract raw fee observations",
      },
    ];
    const extractRunRow = {
      ...runRow,
      agent_name: "knox",
      run_kind: "manual_repair",
      params_json: { institution_id: 42, extract_limit: 10 },
    };
    installSqlMocks({ finalRun: completedRunRow, finalSteps: completedExtractStepRows });
    installTxMocks(extractStepRows, extractRunRow);

    const result = await startAgentRun({
      agent: "knox",
      kind: "manual_repair",
      title: "Extract fees for Test Bank",
      params: { institution_id: 42, extract_limit: 10 },
      triggeredBy: "admin",
      idempotencyKey: "institution:42:extract",
      steps: [{ key: "extract", agent: "knox", title: "Extract raw fee observations" }],
    });

    expect(result.reused).toBe(false);
    expect(runKnoxExtractMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 101,
        dryRun: false,
        limit: 10,
        institutionId: 42,
        db: txMock,
      }),
    );
    expect(txMock.unsafe).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM fees_raw"),
    );
  });

  it("runs Darwin verification through the agentic worker instead of measuring only", async () => {
    getExecutionBackendMock.mockReturnValue("agentic_v1");
    const verifyStepRows = [
      {
        ...queuedStepRows[0],
        step_key: "verify",
        agent_name: "darwin",
        title: "Verify raw fee observations",
      },
    ];
    const completedVerifyStepRows = [
      {
        ...completedStepRows[0],
        step_key: "verify",
        agent_name: "darwin",
        title: "Verify raw fee observations",
      },
    ];
    const verifyRunRow = {
      ...runRow,
      agent_name: "darwin",
      run_kind: "manual_repair",
      params_json: { institution_id: 42, verify_limit: 10 },
    };
    installSqlMocks({ finalRun: completedRunRow, finalSteps: completedVerifyStepRows });
    installTxMocks(verifyStepRows, verifyRunRow);

    const result = await startAgentRun({
      agent: "darwin",
      kind: "manual_repair",
      title: "Verify fees for Test Bank",
      params: { institution_id: 42, verify_limit: 10 },
      triggeredBy: "admin",
      idempotencyKey: "institution:42:verify",
      steps: [{ key: "verify", agent: "darwin", title: "Verify raw fee observations" }],
    });

    expect(result.reused).toBe(false);
    expect(runDarwinVerifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 101,
        dryRun: false,
        limit: 10,
        institutionId: 42,
        db: txMock,
      }),
    );
    expect(txMock.unsafe).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM fees_verified"),
    );
  });

  it("runs Hamilton publish through the agentic worker instead of measuring only", async () => {
    getExecutionBackendMock.mockReturnValue("agentic_v1");
    const publishStepRows = [
      {
        ...queuedStepRows[0],
        step_key: "publish",
        agent_name: "hamilton",
        title: "Publish clean fee intelligence",
      },
    ];
    const completedPublishStepRows = [
      {
        ...completedStepRows[0],
        step_key: "publish",
        agent_name: "hamilton",
        title: "Publish clean fee intelligence",
      },
    ];
    const publishRunRow = {
      ...runRow,
      agent_name: "hamilton",
      run_kind: "manual_repair",
      params_json: {
        institution_id: 42,
        publish_limit: 10,
        publish_min_confidence: 0.88,
      },
    };
    installSqlMocks({ finalRun: completedRunRow, finalSteps: completedPublishStepRows });
    installTxMocks(publishStepRows, publishRunRow);

    const result = await startAgentRun({
      agent: "hamilton",
      kind: "manual_repair",
      title: "Publish fees for Test Bank",
      params: {
        institution_id: 42,
        publish_limit: 10,
        publish_min_confidence: 0.88,
      },
      triggeredBy: "admin",
      idempotencyKey: "institution:42:publish",
      steps: [{ key: "publish", agent: "hamilton", title: "Publish clean fee intelligence" }],
    });

    expect(result.reused).toBe(false);
    expect(runHamiltonPublishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 101,
        dryRun: false,
        limit: 10,
        institutionId: 42,
        minConfidence: 0.88,
        db: txMock,
      }),
    );
    expect(txMock.unsafe).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM fees_published"),
    );
  });

  it("reuses an active idempotent run instead of creating a duplicate", async () => {
    sqlMock
      .mockResolvedValueOnce([{ ...runRow, status: "running" }])
      .mockResolvedValueOnce(queuedStepRows);

    const result = await startAgentRun({
      agent: "atlas",
      kind: "workflow",
      title: "Atlas full data cycle",
      triggeredBy: "admin",
      idempotencyKey: "atlas:test",
      steps: [{ key: "discover", agent: "magellan", title: "Find URLs" }],
    });

    expect(result.reused).toBe(true);
    expect(result.run.id).toBe(101);
    expect(result.steps).toHaveLength(2);
    expect(withTransactionMock).not.toHaveBeenCalled();
  });

  it("cancels an active agent run without touching ops_jobs", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 101, status: "running" }]);
    txMock
      .mockResolvedValueOnce([{ id: 101 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(cancelAgentRun(101, "admin")).resolves.toEqual({ success: true });
    expect(txMock).toHaveBeenCalledTimes(3);
    const combinedSql = combinedTransactionSql();
    expect(combinedSql).toContain("UPDATE agent_runs");
    expect(combinedSql).toContain("UPDATE agent_run_steps");
    expect(combinedSql).not.toContain("ops_jobs");
  });
});
