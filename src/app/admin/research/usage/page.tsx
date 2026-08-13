import { permanentRedirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function RedirectResearchUsagePage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  permanentRedirect(buildAdminRedirectPath("/admin/hamilton/research/usage", await searchParams));
}
