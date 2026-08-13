import { redirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function RedirectCategoryReviewPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const params = { ...(await searchParams) };
  delete params.queue;
  delete params.status;
  redirect(buildAdminRedirectPath("/admin/knox", params, { queue: "decisions" }));
}
