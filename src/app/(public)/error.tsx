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
      <div className="mx-auto max-w-lg px-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-2">
          Something went wrong
        </h1>
        <p className="text-gray-500 mb-8">
          We hit an unexpected error loading this page. Please try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
