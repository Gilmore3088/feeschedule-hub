import { SITE_URL } from "@/lib/constants";

interface BreadcrumbItem {
  name: string;
  href: string;
}

function absoluteHref(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${SITE_URL}${href.startsWith("/") ? href : `/${href}`}`;
}

export function BreadcrumbJsonLd({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteHref(item.href),
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
      }}
    />
  );
}
