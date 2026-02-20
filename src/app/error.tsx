"use client";

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center px-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            An unexpected error occurred. Please try again.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={reset}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
