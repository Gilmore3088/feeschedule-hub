import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Pagination } from "./pagination";
import { PageSizeSelector } from "./page-size-selector";

export interface ServerColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface ServerSortableTableProps<T> {
  columns: ServerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  basePath: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  perPage: number;
  totalItems: number;
  params?: Record<string, string>;
  caption?: string;
}

export function ServerSortableTable<T>({
  columns,
  rows,
  rowKey,
  basePath,
  sort,
  dir,
  page,
  perPage,
  totalItems,
  params = {},
  caption,
}: ServerSortableTableProps<T>) {
  const totalPages = Math.ceil(totalItems / perPage);

  function sortHref(columnKey: string): string {
    const p = new URLSearchParams(params);
    p.set("sort", columnKey);
    p.set("dir", columnKey === sort ? (dir === "asc" ? "desc" : "asc") : "asc");
    p.delete("page");
    if (perPage !== 50) p.set("per", String(perPage));
    return `${basePath}?${p.toString()}`;
  }

  function SortIcon({ columnKey }: { columnKey: string }) {
    if (columnKey !== sort) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
    return dir === "asc"
      ? <ArrowUp className="w-3 h-3 text-gray-600" />
      : <ArrowDown className="w-3 h-3 text-gray-600" />;
  }

  const paginationParams: Record<string, string> = { ...params };
  if (sort) paginationParams.sort = sort;
  if (dir && dir !== "desc") paginationParams.dir = dir;
  if (perPage !== 50) paginationParams.per = String(perPage);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                  } ${col.className ?? ""}`}
                >
                  {col.sortable ? (
                    <Link href={sortHref(col.key)} className="inline-flex items-center gap-1 hover:text-gray-600 transition-colors">
                      {col.label}
                      <SortIcon columnKey={col.key} />
                    </Link>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 ${
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                    } ${col.className ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4 pb-3">
          <PageSizeSelector basePath={basePath} currentSize={perPage} params={params} />
          <Pagination
            basePath={basePath}
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={perPage}
            params={paginationParams}
          />
        </div>
      )}
      {totalPages <= 1 && rows.length > 0 && (
        <div className="flex justify-end mt-4 px-4 pb-3">
          <PageSizeSelector basePath={basePath} currentSize={perPage} params={params} />
        </div>
      )}
    </div>
  );
}
