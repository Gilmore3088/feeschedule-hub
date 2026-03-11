import { requireAuth } from "@/lib/auth";
import { getInstitutionById, getFeesByInstitution, type ExtractedFee } from "@/lib/crawler-db";
import { formatAssets } from "@/lib/format";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { notFound } from "next/navigation";
import { FeeEntryForm } from "./fee-entry-form";
import { PdfUpload } from "./pdf-upload";

export default async function ManualEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth("manual_entry");
  const { id } = await params;
  const targetId = Number(id);

  const institution = getInstitutionById(targetId);
  if (!institution) notFound();

  // Get existing fee categories to warn on duplicates
  const existingFees = getFeesByInstitution(targetId);
  // fee_category exists on the DB row but isn't on the base ExtractedFee type
  const existingCategories = [
    ...new Set(
      existingFees
        .map((f) => {
          const row = f as ExtractedFee & { fee_category?: string | null };
          return row.fee_category ?? null;
        })
        .filter((c): c is string => c !== null)
    ),
  ];

  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/admin" },
            { label: "Coverage Ops", href: "/admin/ops" },
            { label: "Manual Entry" },
          ]}
        />
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Manual Fee Entry
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {institution.institution_name}
          {institution.state_code ? ` (${institution.state_code})` : ""}
          {institution.asset_size ? ` - ${formatAssets(institution.asset_size)}` : ""}
        </p>
      </div>

      {existingFees.length > 0 && (
        <div className="admin-card px-4 py-3 mb-6">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This institution already has{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {existingFees.length} extracted fees
            </span>{" "}
            across {existingCategories.length} categories.
            Duplicate categories will be flagged below.
          </p>
        </div>
      )}

      <div className="admin-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Add Fees
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Fees will be saved as &quot;manual&quot; source with &quot;staged&quot; review status
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-[1fr_1fr_100px_140px_1fr_32px] gap-2 mb-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Category</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Fee Name</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Frequency</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Conditions</span>
            <span />
          </div>
          <FeeEntryForm
            targetId={targetId}
            institutionName={institution.institution_name}
            existingCategories={existingCategories}
          />
        </div>
      </div>

      {/* PDF Upload */}
      <div className="admin-card overflow-hidden mt-6">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/80 dark:bg-white/[0.03]">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            Upload Fee Schedule PDF
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Upload a PDF and we&apos;ll extract fees automatically. Results will appear in the review queue.
          </p>
        </div>
        <div className="p-4">
          <PdfUpload targetId={targetId} />
        </div>
      </div>
    </>
  );
}
