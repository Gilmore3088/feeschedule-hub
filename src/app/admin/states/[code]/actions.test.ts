import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  revalidatePath: vi.fn(),
  runAtlasStateLane: vi.fn(),
  applyStateSourceMemoryCorrection: vi.fn(),
  updatePublicDiscoveryFindingDecision: vi.fn(),
  extractInstitutionCommand: vi.fn(),
  markInstitutionOfflineCommand: vi.fn(),
  setInstitutionFeeUrl: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/app/admin/atlas-actions", () => ({
  runAtlasStateLane: mocks.runAtlasStateLane,
}));

vi.mock("@/lib/agents/state-lane-memory", () => ({
  applyStateSourceMemoryCorrection: mocks.applyStateSourceMemoryCorrection,
  updatePublicDiscoveryFindingDecision: mocks.updatePublicDiscoveryFindingDecision,
}));

vi.mock("@/lib/institution-commands", () => ({
  extractInstitutionCommand: mocks.extractInstitutionCommand,
  markInstitutionOfflineCommand: mocks.markInstitutionOfflineCommand,
  setInstitutionFeeUrl: mocks.setInstitutionFeeUrl,
}));

function form(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("state lane admin actions", () => {
  beforeEach(() => {
    mocks.requireAuth.mockReset().mockResolvedValue({ id: 7, username: "atlas-operator" });
    mocks.revalidatePath.mockReset();
    mocks.runAtlasStateLane.mockReset();
    mocks.applyStateSourceMemoryCorrection.mockReset();
    mocks.updatePublicDiscoveryFindingDecision.mockReset();
    mocks.extractInstitutionCommand.mockReset();
    mocks.markInstitutionOfflineCommand.mockReset();
    mocks.setInstitutionFeeUrl.mockReset();
  });

  it("returns visible success metadata after locking source memory", async () => {
    const { correctStateSourceMemory } = await import("./actions");
    mocks.applyStateSourceMemoryCorrection.mockResolvedValue({
      success: true,
      institutionId: 123,
      stateCode: "OH",
      correctionVersion: 4,
    });

    const result = await correctStateSourceMemory(
      null,
      form({
        institution_id: "123",
        state_code: "oh",
        canonical_source_url: "https://example.com/fees.pdf",
        source_kind: "pdf",
        read_strategy: "",
        reason: "Public PDF is current.",
      }),
    );

    expect(result).toEqual({
      ok: true,
      institutionId: 123,
      stateCode: "OH",
      correctionVersion: 4,
      message: "Locked source memory for OH · v4.",
    });
    expect(mocks.requireAuth).toHaveBeenCalledWith("approve");
    expect(mocks.applyStateSourceMemoryCorrection).toHaveBeenCalledWith({
      institutionId: 123,
      stateCode: "OH",
      canonicalSourceUrl: "https://example.com/fees.pdf",
      sourceKind: "pdf",
      readStrategy: null,
      reason: "Public PDF is current.",
      correctedBy: "atlas-operator",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/states");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/states/OH");
  });

  it("returns helper errors without revalidating the Atlas surfaces", async () => {
    const { correctStateSourceMemory } = await import("./actions");
    mocks.applyStateSourceMemoryCorrection.mockResolvedValue({
      success: false,
      error: "Canonical source URL is not valid.",
    });

    const result = await correctStateSourceMemory(
      null,
      form({
        institution_id: "123",
        state_code: "OH",
        canonical_source_url: "not-a-url",
        source_kind: "pdf",
        read_strategy: "pdf_text",
        reason: "",
      }),
    );

    expect(result).toEqual({
      ok: false,
      institutionId: 123,
      stateCode: "OH",
      error: "Canonical source URL is not valid.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid correction input before touching source memory", async () => {
    const { correctStateSourceMemory } = await import("./actions");

    const result = await correctStateSourceMemory(
      null,
      form({
        institution_id: "bad",
        state_code: "OH",
        canonical_source_url: "https://example.com/fees.pdf",
        source_kind: "pdf",
        read_strategy: "pdf_text",
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Check the institution, state, source kind, and read strategy before locking the correction.",
    });
    expect(mocks.applyStateSourceMemoryCorrection).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
