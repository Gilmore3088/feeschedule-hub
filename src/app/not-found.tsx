import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-md text-center text-[15px] text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/fees"
          className="rounded bg-[#0f172a] px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          Browse Fee Index
        </Link>
        <Link
          href="/"
          className="rounded border border-slate-300 px-5 py-2.5 text-[13px] font-medium text-slate-700 hover:border-slate-400 transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
