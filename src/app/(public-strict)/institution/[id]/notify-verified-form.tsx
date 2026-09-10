"use client";
import { trackEvent } from "@/lib/analytics";

import { useState } from "react";

const NOTIFY_LEAD_NAME = "Notify request";
const NOTIFY_SOURCE = "notify";

type Status = "idle" | "loading" | "success" | "error";

/** "Tell me when this bank is verified" capture; posts a lead tagged with the institution. */
export function NotifyVerifiedForm({
  institutionId,
  institutionName,
}: {
  institutionId: number;
  institutionName: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const inputId = `notify-verified-${institutionId}`;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("loading");
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: NOTIFY_LEAD_NAME,
          email: trimmed,
          company: institutionName,
          use_case: `notify-verified:${institutionId}`,
          source: NOTIFY_SOURCE,
        }),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setStatus("success");
        trackEvent("notify_verified_request");
      setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="text-sm font-semibold text-emerald-700" role="status">
        Noted — we will email you when {institutionName} is verified.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold text-[#1A1815]">
        Tell me when this institution is verified
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={inputId}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          required
          className="w-full max-w-[260px] rounded-md border border-[#D4C9BA] bg-white px-3 py-2 text-sm text-[#1A1815] placeholder:text-[#6B6255] focus:border-transparent focus:outline-none focus:ring-1 focus:ring-[#C44B2E]/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-md border border-[#1A1815] px-3 py-2 text-sm font-semibold text-[#1A1815] transition-colors hover:bg-[#1A1815] hover:text-white disabled:opacity-50"
        >
          {status === "loading" ? "Sending..." : "Notify me"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-sm text-red-700" role="alert">
          Something went wrong — try again.
        </p>
      )}
    </form>
  );
}
