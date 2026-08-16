import { withApiRoutePolicy } from "@/lib/api-hardening/route-wrapper";
import { getCurrentUser, hasPermission } from "@/lib/auth";

async function handleGET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "trigger_jobs")) {
    return new Response("forbidden", { status: 403 });
  }
  return Response.json(
    { error: "Direct Darwin streams are retired; queue a repair from /admin/darwin" },
    { status: 410 },
  );
}

export const GET = withApiRoutePolicy("api.admin.darwin.stream", "GET", handleGET);
