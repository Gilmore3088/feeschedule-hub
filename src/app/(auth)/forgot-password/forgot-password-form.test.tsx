// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./forgot-password-form";

const mocks = vi.hoisted(() => ({
  forgotPasswordAction: vi.fn(),
}));

vi.mock("./actions", () => ({
  forgotPasswordAction: mocks.forgotPasswordAction,
}));

afterEach(() => {
  cleanup();
  mocks.forgotPasswordAction.mockReset();
});

async function submitForm() {
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "jane@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  await waitFor(() => {
    expect(mocks.forgotPasswordAction).toHaveBeenCalled();
  });
}

describe("ForgotPasswordForm", () => {
  it("promises a reset link when lead email is configured", async () => {
    mocks.forgotPasswordAction.mockResolvedValue({ success: true });
    render(<ForgotPasswordForm emailConfigured={true} />);

    await submitForm();

    expect(
      await screen.findByText("If that email is on file, a reset link is on its way.")
    ).toBeInTheDocument();
  });

  it("does not promise an email that was never sent when lead email is not configured", async () => {
    mocks.forgotPasswordAction.mockResolvedValue({ success: true });
    render(<ForgotPasswordForm emailConfigured={false} />);

    await submitForm();

    const confirmation = await screen.findByText(/we'll reset your password/);
    expect(confirmation).toHaveTextContent(
      "If that email is on file, we'll reset your password — if you don't hear from us " +
        "within a few minutes, email hello@bankfeeindex.com."
    );
    expect(screen.queryByText("a reset link is on its way.", { exact: false })).not.toBeInTheDocument();
  });
});
