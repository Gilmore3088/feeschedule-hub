export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function LegacyReviewPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const params = { ...(await searchParams) };
  delete params.queue;
  delete params.status;
  redirect(buildLegacyAdminPath("/admin/knox", params, { queue: "decisions" }));
}
