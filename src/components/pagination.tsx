import Link from "next/link";

interface PaginationProps {
  basePath: string;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  /** Extra query params to preserve (e.g., { status: "staged", q: "wire" }) */
  params?: Record<string, string>;
}

export function Pagination({
  basePath,
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  params = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  function buildHref(page: number): string {
    const p = new URLSearchParams(params);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  // Show up to 5 page numbers centered around current page
  const pages: number[] = [];
  const start_page = Math.max(1, currentPage - 2);
  const end_page = Math.min(totalPages, start_page + 4);
  for (let i = start_page; i <= end_page; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between border-t pt-4 mt-4">
      <p className="text-xs text-gray-500 tabular-nums">
        Showing {start}-{end} of {totalItems.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={buildHref(currentPage - 1)}
            className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Prev
          </Link>
        ) : (
          <span className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-300">
            Prev
          </span>
        )}

        {start_page > 1 && (
          <>
            <Link
              href={buildHref(1)}
              className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors tabular-nums"
            >
              1
            </Link>
            {start_page > 2 && (
              <span className="px-1 text-xs text-gray-400">...</span>
            )}
          </>
        )}

        {pages.map((p) => (
          <Link
            key={p}
            href={buildHref(p)}
            className={`rounded px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors ${
              p === currentPage
                ? "bg-gray-900 text-white dark:bg-white/15 dark:text-gray-100"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {p}
          </Link>
        ))}

        {end_page < totalPages && (
          <>
            {end_page < totalPages - 1 && (
              <span className="px-1 text-xs text-gray-400">...</span>
            )}
            <Link
              href={buildHref(totalPages)}
              className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors tabular-nums"
            >
              {totalPages}
            </Link>
          </>
        )}

        {currentPage < totalPages ? (
          <Link
            href={buildHref(currentPage + 1)}
            className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Next
          </Link>
        ) : (
          <span className="rounded px-2.5 py-1.5 text-xs font-medium text-gray-300">
            Next
          </span>
        )}
      </div>
    </div>
  );
}
