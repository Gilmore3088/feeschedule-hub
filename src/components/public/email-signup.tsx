"use client";

import { useState } from "react";

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
          name: "Newsletter signup",
          email: email.trim(),
          source: "newsletter",
        }),
      });
      if (resp.ok) {
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
      <p className="text-[12px] text-emerald-600">
        You&apos;re on the list. We&apos;ll send updates that matter.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        className="w-full max-w-[200px] rounded-lg border border-[#D4C9BA] bg-[#FAF7F2] px-3 py-1.5 text-[12px] text-[#1A1815] placeholder:text-[#B0A89C] focus:outline-none focus:ring-1 focus:ring-[#C44B2E]/30 focus:border-transparent"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="shrink-0 rounded-lg bg-[#C44B2E] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#A83D25] transition-colors disabled:opacity-50"
      >
        {status === "loading" ? "..." : "Subscribe"}
      </button>
      {status === "error" && (
        <span className="self-center text-[11px] text-red-500">Failed</span>
      )}
    </form>
  );
}
