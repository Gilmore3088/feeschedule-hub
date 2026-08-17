/**
 * Thin, dependency-free event tracking. Sends to Plausible when its script is
 * loaded (NEXT_PUBLIC_PLAUSIBLE_DOMAIN set); otherwise a no-op. Safe on the server.
 */
export type AnalyticsEvent =
  | "create_account"
  | "request_report"
  | "see_sample_report"
  | "newsletter_signup"
  | "checkout_start"
  | "book_walkthrough"
  | "contact_sales";

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

export function trackEvent(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  const plausible = window.plausible;
  if (typeof plausible !== "function") return;
  try {
    plausible(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break the page.
  }
}
