import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlCalls: Array<{ values: unknown[] }> = [];
let queuedRows: unknown[][] = [];

const sqlMock = vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
  sqlCalls.push({ values });
  return Promise.resolve(queuedRows.shift() ?? []);
});

vi.mock("@/lib/data-store/connection", () => ({
  sql: sqlMock,
}));

describe("Hamilton artifact context store", () => {
  beforeEach(() => {
    sqlCalls.length = 0;
    queuedRows = [];
    sqlMock.mockClear();
  });

  it("does not query when no artifact lookup is available", async () => {
    const { getHamiltonArtifactInstitutionId } = await import("./artifact-context-store");

    await expect(
      getHamiltonArtifactInstitutionId({
        userId: 7,
        lookup: null,
      }),
    ).resolves.toBeNull();

    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("loads canonical saved analysis institution context for the current user", async () => {
    const { getHamiltonArtifactInstitutionId } = await import("./artifact-context-store");
    queuedRows = [[{ institution_id: "2945" }]];

    await expect(
      getHamiltonArtifactInstitutionId({
        userId: 7,
        lookup: { kind: "analysis", artifactId: "analysis-1" },
      }),
    ).resolves.toBe("2945");

    expect(sqlCalls[0].values).toEqual(["analysis-1", 7]);
  });

  it("loads canonical saved scenario institution context for the current user", async () => {
    const { getHamiltonArtifactInstitutionId } = await import("./artifact-context-store");
    queuedRows = [[{ institution_id: 8109 }]];

    await expect(
      getHamiltonArtifactInstitutionId({
        userId: 7,
        lookup: { kind: "scenario", artifactId: "scenario-1" },
      }),
    ).resolves.toBe("8109");

    expect(sqlCalls[0].values).toEqual(["scenario-1", 7]);
  });

  it("loads canonical saved report institution context for the current user", async () => {
    const { getHamiltonArtifactInstitutionId } = await import("./artifact-context-store");
    queuedRows = [[{ institution_id: "8109" }]];

    await expect(
      getHamiltonArtifactInstitutionId({
        userId: 7,
        lookup: { kind: "report", artifactId: "report-1" },
      }),
    ).resolves.toBe("8109");

    expect(sqlCalls[0].values).toEqual(["report-1", 7]);
  });

  it("rejects saved artifact profile-name slugs as institution context", async () => {
    const { getHamiltonArtifactInstitutionId } = await import("./artifact-context-store");
    queuedRows = [[{ institution_id: "first-national-bank" }]];

    await expect(
      getHamiltonArtifactInstitutionId({
        userId: 7,
        lookup: { kind: "analysis", artifactId: "analysis-1" },
      }),
    ).resolves.toBeNull();
  });
});
