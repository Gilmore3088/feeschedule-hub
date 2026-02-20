"use client";

import { useState } from "react";

export function RequestAccessForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    try {
      const res = await fetch("/api/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(body.error || "Request failed");
      }

      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
        <p className="text-lg font-semibold text-white">Request Submitted</p>
        <p className="mt-2 text-[14px] text-slate-400">
          Thank you for your interest. We will review your request and follow up shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot field - hidden from users, catches bots */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Name
          </label>
          <input
            type="text"
            name="name"
            required
            className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Title
          </label>
          <input
            type="text"
            name="title"
            required
            className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Institution
        </label>
        <input
          type="text"
          name="institution"
          required
          className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Asset Size Tier
          </label>
          <select
            name="asset_tier"
            required
            className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
          >
            <option value="">Select tier</option>
            <option value="under_300m">Under $300M</option>
            <option value="300m_1b">$300M - $1B</option>
            <option value="1b_10b">$1B - $10B</option>
            <option value="over_10b">Over $10B</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Email
          </label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Primary Interest
        </label>
        <select
          name="interest"
          required
          className="w-full rounded border border-slate-700 bg-slate-800/50 px-3.5 py-2.5 text-sm text-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none"
        >
          <option value="">Select interest</option>
          <option value="peer_benchmark">Peer Benchmark</option>
          <option value="full_index">Full Index Access</option>
          <option value="comparison">Institutional Comparison</option>
          <option value="api">API Access</option>
        </select>
      </div>
      {status === "error" && (
        <p className="text-sm text-red-400">{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded bg-amber-400 py-3 text-[13px] font-semibold text-[#0f172a] hover:bg-amber-300 transition-colors mt-2 disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting..." : "Submit Request"}
      </button>
    </form>
  );
}
