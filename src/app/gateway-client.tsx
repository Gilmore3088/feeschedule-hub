"use client";

import { useState } from "react";
import Link from "next/link";

type ActiveSide = "consumer" | "pro" | null;

export default function GatewayClient() {
  const [active, setActive] = useState<ActiveSide>(null);

  return (
    <div className="relative min-h-screen bg-[#08090E] overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        <div
          className="absolute top-1/2 left-[25%] -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full transition-opacity duration-1000"
          style={{
            background:
              "radial-gradient(circle, rgba(196,75,46,0.07) 0%, transparent 65%)",
            opacity: active === "pro" ? 0.2 : 1,
          }}
        />
        <div
          className="absolute top-1/2 right-[25%] translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full transition-opacity duration-1000"
          style={{
            background:
              "radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 65%)",
            opacity: active === "consumer" ? 0.2 : 1,
          }}
        />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 lg:px-10 py-6">
        <div className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 text-white/50"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="4" y="13" width="4" height="8" rx="1" />
            <rect x="10" y="8" width="4" height="13" rx="1" />
            <rect x="16" y="3" width="4" height="18" rx="1" />
          </svg>
          <span className="text-[15px] font-medium tracking-tight text-white/70">
            Bank Fee Index
          </span>
        </div>
        <Link
          href="/login"
          className="text-[12px] text-white/30 hover:text-white/60 transition-colors"
        >
          Sign In
        </Link>
      </header>

      {/* Center tagline */}
      <div className="relative z-10 text-center px-6 pt-2 pb-6 lg:pt-6 lg:pb-10">
        <h1 className="text-[12px] font-medium uppercase tracking-[0.25em] text-white/20">
          Choose your experience
        </h1>
      </div>

      {/* Split panels */}
      <div
        className="relative z-10 flex flex-col lg:flex-row items-stretch px-4 pb-4 lg:px-6 lg:pb-6 gap-3 lg:gap-4"
        style={{ minHeight: "calc(100vh - 180px)" }}
      >
        {/* ── Consumer Panel ── */}
        <Link
          href="/consumer"
          className={`gateway-panel group relative flex-1 rounded-2xl overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] no-underline ${
            active === "consumer"
              ? "lg:flex-[1.2]"
              : active === "pro"
                ? "lg:flex-[0.8]"
                : ""
          }`}
          onMouseEnter={() => setActive("consumer")}
          onMouseLeave={() => setActive(null)}
        >
          <div className="absolute inset-0 bg-[#FAF7F2]" />
          <div
            className="absolute inset-0 opacity-30 mix-blend-multiply"
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.035\'/%3E%3C/svg%3E")',
            }}
          />

          <div className="relative h-full flex flex-col justify-end p-8 lg:p-12 xl:p-16">
            <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60 mb-5">
              For Consumers
            </span>
            <h2
              className="text-[1.75rem] sm:text-[2.25rem] lg:text-[2.75rem] xl:text-[3.25rem] leading-[1.08] tracking-[-0.025em] text-[#1A1815]"
              style={{
                fontFamily: "var(--font-newsreader), Georgia, serif",
              }}
            >
              What is your bank
              <br />
              <em
                className="not-italic"
                style={{ fontStyle: "italic", fontWeight: 300 }}
              >
                really
              </em>{" "}
              charging you?
            </h2>
            <p className="mt-4 max-w-md text-[14px] lg:text-[15px] leading-relaxed text-[#7A7062]">
              Compare fees across thousands of U.S. banks and credit unions.
              Know if you&apos;re overpaying.
            </p>

            {/* Stats strip */}
            <div className="mt-6 flex items-center gap-5 text-[12px] lg:text-[13px]">
              <div>
                <span className="font-bold text-[#1A1815] tabular-nums">
                  10,000+
                </span>
                <span className="ml-1.5 text-[#A09788]">institutions</span>
              </div>
              <span className="h-4 w-px bg-[#D4C9BA]" />
              <div>
                <span className="font-bold text-[#1A1815] tabular-nums">
                  49
                </span>
                <span className="ml-1.5 text-[#A09788]">fee categories</span>
              </div>
              <span className="h-4 w-px bg-[#D4C9BA]" />
              <div>
                <span className="font-bold text-[#1A1815] tabular-nums">
                  Free
                </span>
                <span className="ml-1.5 text-[#A09788]">to use</span>
              </div>
            </div>

            <ul className="mt-6 space-y-2.5 text-[13px] text-[#5A5347]">
              {[
                "See how your bank stacks up nationally",
                "Plain-language guides to overdraft, NSF, and ATM fees",
                "Search any bank or credit union by name",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-[#C44B2E]/60 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 inline-flex items-center gap-2.5 self-start rounded-full bg-[#C44B2E] px-7 py-3.5 text-[13px] font-semibold text-white shadow-lg shadow-[#C44B2E]/20 group-hover:shadow-xl group-hover:shadow-[#C44B2E]/30 transition-all duration-500">
              Explore Fees
              <svg
                className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C44B2E]/30 to-transparent group-hover:via-[#C44B2E]/60 transition-all duration-700" />
        </Link>

        {/* ── Professional Panel ── */}
        <Link
          href="/pro"
          className={`gateway-panel group relative flex-1 rounded-2xl overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] no-underline ${
            active === "pro"
              ? "lg:flex-[1.2]"
              : active === "consumer"
                ? "lg:flex-[0.8]"
                : ""
          }`}
          onMouseEnter={() => setActive("pro")}
          onMouseLeave={() => setActive(null)}
        >
          <div className="absolute inset-0 bg-[#0C0F1A]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(59,130,246,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.4) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
            }}
          />

          <div className="relative h-full flex flex-col justify-end p-8 lg:p-12 xl:p-16">
            <span className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400/50 mb-5">
              For Professionals
            </span>
            <h2
              className="text-[1.75rem] sm:text-[2.25rem] lg:text-[2.75rem] xl:text-[3.25rem] leading-[1.08] tracking-[-0.03em] text-white"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
              }}
            >
              National Fee
              <br />
              Insights.
            </h2>
            <p className="mt-4 max-w-md text-[14px] lg:text-[15px] leading-relaxed text-slate-400">
              Institutional-grade indexing, peer benchmarks, and original
              research for banking professionals.
            </p>

            {/* Stats strip */}
            <div className="mt-6 flex items-center gap-5 text-[12px] lg:text-[13px]">
              <div>
                <span className="font-bold text-white tabular-nums">49</span>
                <span className="ml-1 text-slate-500">categories</span>
              </div>
              <span className="h-3 w-px bg-white/[0.08]" />
              <div>
                <span className="font-bold text-white tabular-nums">12</span>
                <span className="ml-1 text-slate-500">Fed districts</span>
              </div>
              <span className="h-3 w-px bg-white/[0.08]" />
              <div>
                <span className="font-bold text-white tabular-nums">50</span>
                <span className="ml-1 text-slate-500">state reports</span>
              </div>
            </div>

            <ul className="mt-6 space-y-2.5 text-[13px] text-slate-500">
              {[
                "National & peer fee indexes with P25/P75 ranges",
                "Fed district analysis & original research",
                "API access & data subscriptions",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="h-1 w-1 rounded-full bg-blue-500/50 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 inline-flex items-center gap-2.5 self-start rounded-full border border-blue-500/30 bg-blue-500/8 px-7 py-3.5 text-[13px] font-semibold text-blue-300 group-hover:bg-blue-500/15 group-hover:border-blue-400/50 transition-all duration-500">
              Enter Platform
              <svg
                className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/20 to-transparent group-hover:via-blue-500/50 transition-all duration-700" />
        </Link>
      </div>

      {/* Bottom attribution */}
      <div className="relative z-10 text-center px-6 py-5">
        <p className="text-[13px] text-white/15">
          Independent fee benchmarking for 10,000+ U.S. financial institutions
        </p>
      </div>
    </div>
  );
}
