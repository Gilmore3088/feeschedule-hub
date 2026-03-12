import { requireAuth } from "@/lib/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getInstitutionsWithFees } from "@/lib/crawler-db";
import { InstitutionTable } from "../institution-table";

export default async function InstitutionsPage() {
  await requireAuth();

  const institutions = getInstitutionsWithFees();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Institutions" },
        ]}
      />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          Institutions
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {institutions.length.toLocaleString()} institutions with extracted fee
          schedules
        </p>
      </div>

      <InstitutionTable institutions={institutions} />
    </div>
  );
}
