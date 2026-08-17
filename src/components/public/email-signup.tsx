"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const NEWSLETTER_SOURCE = "newsletter";
const NEWSLETTER_LEAD_NAME = "Newsletter signup";

export function EmailSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const resp = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: NEWSLETTER_LEAD_NAME,
          email: email.trim(),
          source: NEWSLETTER_SOURCE,
        }),
      });
      if (resp.ok) {
        trackEvent("newsletter_signup", { placement: "footer" });
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p className="text-[12px] text-emerald-700" role="status">
        You&apos;re on the list — first issue next month.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="footer-newsletter-email" className="text-[12px] font-semibold text-[#5A5347]">
        Monthly fee index update
      </label>
      <p className="text-[12px] leading-relaxed text-[#7A7062]">
        New benchmarks, notable fee changes, one chart. Once a month.
      </p>
      <div className="flex gap-2">
        <input
          id="footer-newsletter-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          required
          className="w-full max-w-[200px] rounded-lg border border-[#D4C9BA] bg-[#FAF7F2] px-3 py-1.5 text-[12px] text-[#1A1815] placeholder:text-[#7A7062] focus:border-transparent focus:outline-none focus:ring-1 focus:ring-[#C44B2E]/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-lg bg-[#C44B2E] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#A93D25] disabled:opacity-50"
        >
          {status === "loading" ? "..." : "Subscribe"}
        </button>
        {status === "error" && (
          <span className="self-center text-[11px] text-red-600" role="alert">
            Something went wrong — try again.
          </span>
        )}
      </div>
    </form>
  );
}
