import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriorityAlertCard } from "./PriorityAlertCard";
import type { AlertEntry } from "@/lib/hamilton/home-data";

describe("PriorityAlertCard", () => {
  it("preserves the alert institution on the recommended next move CTA", () => {
    const alert: AlertEntry = {
      id: "alert-1",
      signalId: "signal-1",
      institutionId: "2945",
      signalType: "fee_change",
      severity: "high",
      title: "Fee movement",
      body: "Review the selected institution.",
      status: "active",
      createdAt: "2026-08-15T12:00:00.000Z",
      evidencePolicy: "verified-only",
      providerCallQueued: false,
    };

    const html = renderToStaticMarkup(<PriorityAlertCard alert={alert} />);

    expect(html).toContain('href="/pro/analyze?instId=2945"');
  });

  it("falls back to the canonical analyze screen when alert context is missing", () => {
    const alert: AlertEntry = {
      id: "alert-2",
      signalId: "signal-2",
      institutionId: null,
      signalType: "market_move",
      severity: "medium",
      title: "Market movement",
      body: "Review the broader market.",
      status: "active",
      createdAt: "2026-08-15T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(<PriorityAlertCard alert={alert} />);

    expect(html).toContain('href="/pro/analyze"');
  });
});
