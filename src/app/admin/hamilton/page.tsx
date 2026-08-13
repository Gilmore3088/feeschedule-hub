import { permanentRedirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function HamiltonIndexPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  permanentRedirect(buildAdminRedirectPath("/admin/hamilton/chat", await searchParams));
}
