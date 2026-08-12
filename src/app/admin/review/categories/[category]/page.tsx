import { redirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function LegacyCategoryReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  await params;
  const query = { ...(await searchParams) };
  delete query.queue;
  delete query.status;
  delete query.category;
  redirect(buildLegacyAdminPath("/admin/knox", query, { queue: "decisions" }));
}
