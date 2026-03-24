export const dynamic = "force-dynamic";
import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getLeads } from "@/lib/admin-queries";
import type { LeadRow } from "@/lib/admin-queries";

const ROLE_LABELS: Record<string, string> = {
  bank_cu: "Bank / CU",
  consultant: "Consultant",
  fintech: "Fintech",
  compliance: "Compliance",
  researcher: "Researcher",
  other: "Other",
};

export default async function LeadsPage() {
  await requireAuth("view");

  let leads: LeadRow[] = [];
  try {
    leads = await getLeads();
  } catch {
    leads = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Leads" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Leads
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {leads.length} lead{leads.length !== 1 ? "s" : ""} collected
        </p>
      </div>

      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06]">
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Use Case
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-gray-100 dark:border-white/[0.04] hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-200">
                    {lead.name}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                    <a
                      href={`mailto:${lead.email}`}
                      className="hover:text-blue-600 transition-colors"
                    >
                      {lead.email}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                    {lead.company || "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {ROLE_LABELS[lead.role || ""] || lead.role || "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[200px] truncate">
                    {lead.use_case || "\u2014"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs tabular-nums">
                    {lead.created_at}
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No leads yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
