"use client";

import Link from "next/link";

export default function PublicError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="py-24">
      <div className="mx-auto max-w-lg px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="h-px w-8 bg-[#C44B2E]/40" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
            Error
          </span>
          <span className="h-px w-8 bg-[#C44B2E]/40" />
        </div>
        <h1
          className="text-[1.75rem] tracking-[-0.02em] text-[#1A1815] mb-3"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Something went wrong
        </h1>
        <p className="text-[14px] text-[#7A7062] mb-8">
          We hit an unexpected error loading this page. Please try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-full bg-[#C44B2E] px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-[#C44B2E]/15 hover:shadow-md hover:shadow-[#C44B2E]/25 transition-all"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-[#E8DFD1] bg-white/80 px-5 py-2.5 text-[13px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-all no-underline"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
