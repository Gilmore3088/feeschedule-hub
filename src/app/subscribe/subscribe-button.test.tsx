import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/stripe-actions", () => ({
  createCheckoutSession: mocks.createCheckoutSessionMock,
}));

import { SubscribeButton } from "./subscribe-button";

describe("SubscribeButton checkout hand-off", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mocks.push.mockClear();
    mocks.createCheckoutSessionMock.mockReset();
    // jsdom's window.location does not allow spying on `assign` directly, so
    // swap in a stand-in object that does.
    // @ts-expect-error jsdom location cannot be reassigned in place
    delete window.location;
    window.location = {
      ...originalLocation,
      pathname: "/subscribe",
      search: "?plan=monthly&checkout=1",
      assign: vi.fn(),
    } as unknown as Location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it("should_replace_history_before_redirecting_to_stripe", async () => {
    mocks.createCheckoutSessionMock.mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const callOrder: string[] = [];
    replaceStateSpy.mockImplementation(() => {
      callOrder.push("replaceState");
    });
    (window.location.assign as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push("assign");
    });

    render(<SubscribeButton priceId="price_monthly" label="Start monthly" />);
    fireEvent.click(screen.getByRole("button", { name: "Start monthly" }));

    await waitFor(() => expect(window.location.assign).toHaveBeenCalled());

    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/subscribe?plan=monthly");
    expect(window.location.assign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
    expect(callOrder).toEqual(["replaceState", "assign"]);

    replaceStateSpy.mockRestore();
  });

  it("should_show_an_error_instead_of_spinning_forever_when_price_id_is_missing", async () => {
    render(<SubscribeButton priceId="" label="Continue to checkout" autoStart />);

    const errorPattern = /Checkout is not available right now\. Email .+ and we'll set up your seat/;
    await waitFor(() => {
      expect(screen.getByText(errorPattern)).toBeInTheDocument();
    });
    expect(screen.getByRole("button")).not.toBeDisabled();
    expect(mocks.createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
