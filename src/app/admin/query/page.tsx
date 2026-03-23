export const dynamic = "force-dynamic";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { QueryClient } from "./query-client";

export default async function QueryPage() {
  await requireAuth("view");

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/admin" }, { label: "Query" }]} />
      <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-1">
        Database Query
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        Run read-only SQL queries against the database
      </p>
      <QueryClient />
    </>
  );
}
