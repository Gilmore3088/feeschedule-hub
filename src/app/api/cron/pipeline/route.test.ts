import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  createRun: vi.fn(),
  seedSteps: vi.fn(),
  executeRun: vi.fn(),
  stageNames: vi.fn(() => ["publish"]),
}));
vi.mock("@/lib/pipeline/db", () => ({ createRun: h.createRun, seedSteps: h.seedSteps }));
vi.mock("@/lib/pipeline/runner", () => ({ executeRun: h.executeRun }));
vi.mock("@/lib/pipeline/stages", () => ({ stageNames: h.stageNames }));

async function loadRoute(secret: string | undefined) {
  vi.resetModules();
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  return import("./route");
}

function request(auth?: string) {
  return new Request("http://localhost/api/cron/pipeline", {
    headers: auth ? { authorization: auth } : {},
  }) as unknown as Parameters<Awaited<ReturnType<typeof loadRoute>>["GET"]>[0];
}

describe("GET /api/cron/pipeline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when CRON_SECRET is not configured", async () => {
    const { GET } = await loadRoute(undefined);
    const res = await GET(request("Bearer anything"));
    expect(res.status).toBe(401);
    expect(h.executeRun).not.toHaveBeenCalled();
  });

  it("401s on a wrong token", async () => {
    const { GET } = await loadRoute("right-secret");
    const res = await GET(request("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(h.executeRun).not.toHaveBeenCalled();
  });

  it("runs a dry-run snapshot on the correct token", async () => {
    h.createRun.mockResolvedValue(7);
    h.executeRun.mockResolvedValue({ status: "succeeded" });
    const { GET } = await loadRoute("right-secret");
    const res = await GET(request("Bearer right-secret"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.runId).toBe(7);
    expect(h.createRun).toHaveBeenCalledWith("cron", "vercel-cron", ["publish"], {});
    expect(h.executeRun).toHaveBeenCalledWith(7, ["publish"], {});
  });
});
