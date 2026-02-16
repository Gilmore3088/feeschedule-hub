import Link from "next/link";

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="flex items-center gap-2 text-sm text-gray-500 mb-1">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-300">/</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-900">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
