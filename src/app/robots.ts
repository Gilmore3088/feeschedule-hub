import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/fees/", "/districts/", "/research/"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: "https://bankfeeindex.com/sitemap.xml",
  };
}
