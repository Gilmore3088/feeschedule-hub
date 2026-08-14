import { redirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function RedirectDataQualityPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  redirect(buildAdminRedirectPath("/admin/quality", await searchParams));
}
