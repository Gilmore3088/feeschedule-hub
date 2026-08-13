import { permanentRedirect } from "next/navigation";
import { buildAdminRedirectPath, type AdminSearchParams } from "@/lib/admin-redirect-path";

export default async function ResearchAgentRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<AdminSearchParams>;
}) {
  const { agentId } = await params;
  permanentRedirect(
    buildAdminRedirectPath(
      `/admin/hamilton/research/${encodeURIComponent(agentId)}`,
      await searchParams,
    ),
  );
}
