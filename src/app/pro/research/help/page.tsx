export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPremium } from "@/lib/access";
import { getHamilton } from "@/lib/research/agents";
import { getPublicStats, getDataFreshness } from "@/lib/crawler-db";
import { TAXONOMY_COUNT } from "@/lib/fee-taxonomy";

export const metadata: Metadata = {
  title: "What Hamilton can do | Bank Fee Index",
};

const CAPABILITIES = [
  "Benchmark fees for any institution against peers by charter, asset tier, or Fed district.",
  "Summarize regulatory developments from CFPB, Federal Reserve, and OCC guidance.",
  "Surface fee trends year-over-year and flag categories moving fastest.",
  "Identify outlier institutions priced above or below peer medians.",
  "Generate executive-grade reports with charts, tables, and citations.",
  "Combine fee data with Call Reports, FRED indicators, and Beige Book narratives.",
];

export default async function HamiltonHelpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/pro/research/help");
  if (!canAccessPremium(user)) redirect("/subscribe");

  const agent = await getHamilton("pro");
  const stats = await getPublicStats();
  const freshness = await getDataFreshness();

  const lastUpdated = freshness.last_crawl_at
    ? new Date(freshness.last_crawl_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const examples =
    agent.exampleQuestions && agent.exampleQuestions.length > 0
      ? agent.exampleQuestions
      : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/pro/research"
          className="text-[12px] font-medium text-warm-500 hover:text-warm-700 transition-colors"
        >
          ← Back to research
        </Link>
      </div>

      <header className="mb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terra mb-3">
          Capability guide
        </p>
        <h1
          className="text-[40px] leading-[1.1] font-medium text-warm-900 mb-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          What {agent.name} can do
        </h1>
        <p className="text-[15px] leading-relaxed text-warm-600 max-w-2xl">
          {agent.name} is the Bank Fee Index research analyst. It synthesizes
          institution-level fee data, federal economic indicators, and regulatory
          intelligence into McKinsey-grade analysis on demand.
        </p>
      </header>

      <section className="mb-10">
        <h2
          className="text-[20px] font-medium text-warm-900 mb-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          What {agent.name} does
        </h2>
        <div className="rounded-2xl border border-warm-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] divide-y divide-warm-200/60">
          {CAPABILITIES.map((c, i) => (
            <div key={i} className="flex gap-4 px-5 py-4">
              <span
                className="shrink-0 text-[12px] font-bold text-terra tabular-nums pt-0.5"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[14px] leading-relaxed text-warm-800">{c}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2
          className="text-[20px] font-medium text-warm-900 mb-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Data scope
        </h2>
        <div className="rounded-2xl border border-warm-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
          <Stat label="Institutions" value={stats.total_institutions.toLocaleString()} />
          <Stat label="Fee observations" value={stats.total_observations.toLocaleString()} />
          <Stat label="Fee categories" value={String(TAXONOMY_COUNT)} />
          <Stat label="Last updated" value={lastUpdated} mono={false} />
        </div>
        <p className="text-[12px] leading-relaxed text-warm-500 mt-3 px-1">
          Augmented with FDIC Call Reports, FRED economic indicators, Fed Beige Book
          narratives, CFPB complaints, and admin-curated industry research.
        </p>
      </section>

      <section className="mb-10">
        <h2
          className="text-[20px] font-medium text-warm-900 mb-4"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Suggested questions
        </h2>
        <div className="flex flex-col gap-2">
          {examples.map((q) => (
            <Link
              key={q}
              href={`/pro/research?q=${encodeURIComponent(q)}`}
              className="rounded-xl border border-warm-200 bg-white/70 px-4 py-3 text-[13px] text-warm-700 hover:border-terra/30 hover:text-warm-900 transition-all"
            >
              {q}
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-12 pt-6 border-t border-warm-200">
        <Link
          href="/pro/research"
          className="inline-flex items-center gap-2 rounded-xl bg-terra px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-terra-dark transition-colors"
        >
          Start a query
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-500 mb-1.5">
        {label}
      </p>
      <p
        className={`text-[22px] font-light text-warm-900 ${mono ? "tabular-nums" : ""}`}
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        {value}
      </p>
    </div>
  );
}
