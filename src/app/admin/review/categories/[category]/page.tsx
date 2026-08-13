import { redirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function RedirectCategoryReviewDetailPage({
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
  redirect(buildAdminRedirectPath("/admin/knox", query, { queue: "decisions" }));
}
