import { redirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function RedirectFeesPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  redirect(buildAdminRedirectPath("/admin/fees/catalog", await searchParams));
}
