import { Feed } from "feed";
import { getPublishedArticles } from "@/lib/crawler-db";

export const revalidate = 3600;

export async function GET() {
  const articles = getPublishedArticles(20, 0);

  const feed = new Feed({
    title: "Bank Fee Index Research",
    description:
      "Data-driven analysis of U.S. banking fees — national benchmarks, district comparisons, and charter analysis.",
    id: "https://bankfeeindex.com/research",
    link: "https://bankfeeindex.com/research",
    language: "en",
    copyright: `${new Date().getFullYear()} Bank Fee Index`,
    feedLinks: {
      atom: "https://bankfeeindex.com/research/feed.xml",
    },
  });

  for (const article of articles) {
    feed.addItem({
      title: article.title,
      id: `https://bankfeeindex.com/research/${article.slug}`,
      link: `https://bankfeeindex.com/research/${article.slug}`,
      description: article.summary ?? "",
      date: new Date(article.published_at ?? article.generated_at),
    });
  }

  return new Response(feed.atom1(), {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
    },
  });
}
