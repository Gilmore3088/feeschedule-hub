import Link from "next/link";

const SERIF_STACK = "var(--font-newsreader), Georgia, serif";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF7F2] px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6255]">
        404
      </p>
      <h1
        className="mt-2 text-3xl font-medium tracking-tight text-[#1A1815]"
        style={{ fontFamily: SERIF_STACK }}
      >
        Page Not Found
      </h1>
      <p className="mt-3 max-w-md text-center text-[15px] text-[#5A5347]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/fees"
          className="rounded bg-[#C44B2E] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#A93D25]"
        >
          Browse Fee Index
        </Link>
        <Link
          href="/"
          className="rounded border border-[#E0D7C9] bg-[#FDFBF8] px-5 py-2.5 text-[13px] font-medium text-[#5A5347] transition-colors hover:border-[#C4B89F] hover:text-[#1A1815]"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
