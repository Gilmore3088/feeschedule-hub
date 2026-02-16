"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDbError = error.message?.includes("unable to open database") ||
                    error.message?.includes("no such table") ||
                    error.message?.includes("SQLITE");

  return (
    <div className="text-center py-16">
      <h2 className="text-lg font-semibold text-gray-900">
        {isDbError ? "Database Not Available" : "Something went wrong"}
      </h2>
      <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
        {isDbError
          ? "The crawler database could not be loaded. Make sure the data pipeline has been run."
          : error.message}
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 rounded-md bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
      >
        Try again
      </button>
    </div>
  );
}
