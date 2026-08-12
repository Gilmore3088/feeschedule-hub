import { permanentRedirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function LegacyResearchArticlesPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  permanentRedirect(buildLegacyAdminPath("/admin/hamilton/research/articles", await searchParams));
}
