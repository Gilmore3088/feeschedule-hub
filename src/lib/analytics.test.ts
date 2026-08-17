import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAUSIBLE_QUEUE_SHIM, trackEvent } from "./analytics";

describe("trackEvent", () => {
  afterEach(() => {
    delete (window as Window & { plausible?: unknown }).plausible;
  });

  it("is a no-op when Plausible is not loaded", () => {
    expect(() => trackEvent("create_account")).not.toThrow();
  });

  it("forwards the event and props to Plausible when present", () => {
    const plausible = vi.fn();
    window.plausible = plausible;
    trackEvent("request_report", { plan: "report" });
    expect(plausible).toHaveBeenCalledWith("request_report", { props: { plan: "report" } });
  });

  it("queues events through the inline shim before the script loads", () => {
    // Same code the root layout injects when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set.
    new Function(PLAUSIBLE_QUEUE_SHIM)();
    expect(typeof window.plausible).toBe("function");

    trackEvent("request_report", { src: "profile" });
    trackEvent("newsletter_signup");

    const queue = window.plausible?.q ?? [];
    expect(queue).toHaveLength(2);
    expect(Array.from(queue[0] as ArrayLike<unknown>)).toEqual([
      "request_report",
      { props: { src: "profile" } },
    ]);
    expect(Array.from(queue[1] as ArrayLike<unknown>)).toEqual(["newsletter_signup", undefined]);
  });

  it("does not replace a real Plausible function with the shim", () => {
    const plausible = vi.fn();
    window.plausible = plausible;
    new Function(PLAUSIBLE_QUEUE_SHIM)();
    trackEvent("checkout_start");
    expect(plausible).toHaveBeenCalledWith("checkout_start", undefined);
  });

  it("swallows Plausible errors", () => {
    window.plausible = () => {
      throw new Error("boom");
    };
    expect(() => trackEvent("newsletter_signup")).not.toThrow();
  });
});
