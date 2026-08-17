import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics";

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

  it("swallows Plausible errors", () => {
    window.plausible = () => {
      throw new Error("boom");
    };
    expect(() => trackEvent("newsletter_signup")).not.toThrow();
  });
});
