import Link from "next/link";

const PAGE_SIZES = [25, 50, 100] as const;

interface PageSizeSelectorProps {
  basePath: string;
  currentSize: number;
  params?: Record<string, string>;
}

export function PageSizeSelector({ basePath, currentSize, params = {} }: PageSizeSelectorProps) {
  return (
    <div className="flex items-center gap-1 text-xs text-gray-500">
      <span>Show</span>
      {PAGE_SIZES.map((size) => {
        const p = new URLSearchParams(params);
        p.set("per", String(size));
        p.delete("page");
        const qs = p.toString();
        const href = qs ? `${basePath}?${qs}` : basePath;
        return (
          <Link
            key={size}
            href={href}
            className={`px-2 py-1 rounded transition-colors ${
              currentSize === size
                ? "bg-gray-900 text-white dark:bg-white/15 dark:text-gray-100"
                : "hover:bg-gray-100 dark:hover:bg-white/[0.05]"
            }`}
          >
            {size}
          </Link>
        );
      })}
    </div>
  );
}
