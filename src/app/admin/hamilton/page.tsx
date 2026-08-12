import { permanentRedirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function HamiltonIndexPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  permanentRedirect(buildLegacyAdminPath("/admin/hamilton/chat", await searchParams));
}
