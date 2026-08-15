// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDiscoveryFindingDecisionActionState } from "./actions";
import { PublicFindingDecisionForm } from "./public-finding-decision-form";

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
  decidePublicDiscoveryFinding: vi.fn(),
}));

function renderForm(state: PublicDiscoveryFindingDecisionActionState | null, pending = false) {
  mocks.useActionState.mockReturnValue([state, mocks.formAction, pending]);
  return render(<PublicFindingDecisionForm findingId={91} stateCode="CA" />);
}

beforeEach(() => {
  mocks.useActionState.mockReset();
  mocks.formAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PublicFindingDecisionForm", () => {
  it("shows a visible success receipt after a finding is reviewed", () => {
    renderForm({ ok: true, message: "Confirmed public finding #91." });

    expect(screen.getByRole("status")).toHaveTextContent("Confirmed public finding #91.");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled();
  });

  it("shows helper errors inline", () => {
    renderForm({ ok: false, error: "Public discovery finding was already reviewed." });

    expect(screen.getByRole("alert")).toHaveTextContent("Public discovery finding was already reviewed.");
  });

  it("disables both decision buttons while a decision is pending", () => {
    renderForm(null, true);

    expect(screen.getAllByRole("button", { name: "Reviewing" })).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: "Reviewing" })) {
      expect(button).toBeDisabled();
    }
  });
});
