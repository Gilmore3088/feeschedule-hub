import { redirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function RedirectPipelinePage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  redirect(buildAdminRedirectPath("/admin", await searchParams));
}
