// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateSourceMemoryProfile } from "@/lib/agents/state-lane-memory";
import type { SourceMemoryCorrectionActionState } from "./actions";
import { SourceMemoryCorrectionForm } from "./source-memory-correction-form";

const mocks = vi.hoisted(() => ({
  useActionState: vi.fn(),
  formAction: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useActionState: mocks.useActionState,
  };
});

vi.mock("./actions", () => ({
  correctStateSourceMemory: vi.fn(),
}));

function row(): StateSourceMemoryProfile {
  return {
    institutionId: 123,
    institutionName: "Atlas Bank",
    city: "Cleveland",
    websiteUrl: "https://example.com",
    feeScheduleUrl: "https://example.com/old-fees.pdf",
    canonicalSourceUrl: "https://example.com/fees.pdf",
    sourceKind: "pdf",
    readStrategy: "pdf_text",
    lockedByCorrection: false,
    correctionVersion: 0,
    correctionCount: 0,
    latestCorrectionType: null,
    latestCorrectionAt: null,
    consecutiveFailures: 0,
    lastFailureReason: null,
    lastFailureAt: null,
    lastSuccessAt: null,
    lastSuccessfulSourceDocumentId: null,
    lastSuccessfulTextId: null,
    updatedAt: null,
  };
}

function renderForm(state: SourceMemoryCorrectionActionState | null, pending = false) {
  mocks.useActionState.mockReturnValue([state, mocks.formAction, pending]);
  return render(<SourceMemoryCorrectionForm stateCode="OH" row={row()} />);
}

beforeEach(() => {
  mocks.useActionState.mockReset();
  mocks.formAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("SourceMemoryCorrectionForm", () => {
  it("shows a visible success receipt after a correction is locked", () => {
    renderForm({ ok: true, message: "Locked source memory for OH · v4." });

    expect(screen.getByRole("status")).toHaveTextContent("Locked source memory for OH · v4.");
    expect(screen.getByRole("button", { name: "Lock" })).toBeEnabled();
  });

  it("shows helper errors inline and marks the source URL input invalid", () => {
    renderForm({ ok: false, error: "Canonical source URL is not valid." });

    expect(screen.getByRole("alert")).toHaveTextContent("Canonical source URL is not valid.");
    expect(screen.getByLabelText("Canonical source URL")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the correction controls while the action is pending", () => {
    renderForm(null, true);

    expect(screen.getByRole("button", { name: "Locking" })).toBeDisabled();
    expect(screen.getByLabelText("Canonical source URL")).toBeDisabled();
    expect(screen.getByLabelText("Source kind")).toBeDisabled();
    expect(screen.getByLabelText("Read strategy")).toBeDisabled();
  });
});
