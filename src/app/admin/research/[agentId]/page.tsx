import { permanentRedirect } from "next/navigation";
import { buildLegacyAdminPath, type AdminSearchParams } from "@/lib/admin-legacy-redirect";

export default async function ResearchAgentRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const { agentId } = await params;
  permanentRedirect(
    buildLegacyAdminPath(
      `/admin/hamilton/research/${encodeURIComponent(agentId)}`,
      await searchParams,
    ),
  );
}
