export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Research | Bank Fee Index",
};

interface PageProps {
  searchParams: Promise<{
    prompt?: string;
    instId?: string;
  }>;
}

function buildHamiltonUrl(pathname: "/pro/analyze" | "/pro/reports", params: {
  instId?: string;
  intent?: string;
}) {
  const query = new URLSearchParams();
  if (params.instId) query.set("instId", params.instId);
  if (params.intent) query.set("intent", params.intent);
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default async function ProResearchPage({ searchParams }: PageProps) {
  const params = await searchParams;

  if (params.prompt === "competitive-brief") {
    redirect(
      buildHamiltonUrl("/pro/reports", {
        instId: params.instId,
        intent: "competitive-brief",
      }),
    );
  }

  redirect(
    buildHamiltonUrl("/pro/analyze", {
      instId: params.instId,
      intent: params.prompt === "institution" ? "institution" : undefined,
    }),
  );
}
