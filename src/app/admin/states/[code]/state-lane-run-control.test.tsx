// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateLaneRunActionState } from "./actions";
import { StateLaneRunControl } from "./state-lane-run-control";

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("./actions", () => ({
  runStateLaneFormAction: vi.fn(),
}));

function renderControl(state: StateLaneRunActionState | null, pending = false, blockedReason: string | null = null) {
  mocks.useActionState.mockReturnValue([state, mocks.formAction, pending]);
  return render(<StateLaneRunControl stateCode="OH" blockedReason={blockedReason} />);
}

beforeEach(() => {
  mocks.useActionState.mockReset();
  mocks.formAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("StateLaneRunControl", () => {
  it("shows a visible run receipt with a run link", () => {
    renderControl({
      ok: true,
      stateCode: "OH",
      runId: 456,
      reused: false,
      message: "Atlas OH lane #456 created",
    });

    expect(screen.getByRole("status")).toHaveTextContent("Atlas OH lane #456 created");
    expect(screen.getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "/admin/states/OH/runs/456",
    );
  });

  it("shows scheduling errors inline", () => {
    renderControl({ ok: false, stateCode: "OH", error: "Automation is stopped." });

    expect(screen.getByRole("alert")).toHaveTextContent("Automation is stopped.");
  });

  it("disables scheduling while the state lane is blocked", () => {
    renderControl(null, false, "Automation safety stop is active.");

    expect(screen.getByRole("button", { name: "State Lane Paused" })).toBeDisabled();
    expect(screen.getByText("Automation safety stop is active.")).toBeInTheDocument();
  });

  it("shows a pending state while scheduling", () => {
    renderControl(null, true);

    expect(screen.getByRole("button", { name: "Scheduling Lane" })).toBeDisabled();
  });
});
