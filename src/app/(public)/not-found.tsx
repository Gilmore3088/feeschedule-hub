import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <div className="flex items-center justify-center gap-2 mb-6">
        <span className="h-px w-8 bg-[#C44B2E]/40" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C44B2E]/60">
          Page Not Found
        </span>
        <span className="h-px w-8 bg-[#C44B2E]/40" />
      </div>

      <h1
        className="text-[2.5rem] leading-[1.1] tracking-[-0.03em] text-[#1A1815]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
      >
        404
      </h1>

      <p className="mt-4 text-[15px] leading-relaxed text-[#7A7062]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/fees"
          className="rounded-full bg-[#C44B2E] px-5 py-2.5 text-[13px] font-medium text-white shadow-sm shadow-[#C44B2E]/15 hover:shadow-md hover:shadow-[#C44B2E]/25 transition-all no-underline"
        >
          Browse Fee Index
        </Link>
        <Link
          href="/institutions"
          className="rounded-full border border-[#E8DFD1] bg-white/80 px-5 py-2.5 text-[13px] font-medium text-[#5A5347] hover:border-[#C44B2E]/30 hover:text-[#C44B2E] transition-all no-underline"
        >
          Find Your Bank
        </Link>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]">
        {[
          { label: "Research", href: "/research" },
          { label: "Consumer Guides", href: "/guides" },
          { label: "API Docs", href: "/api-docs" },
          { label: "Home", href: "/" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-[#A09788] hover:text-[#C44B2E] transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
