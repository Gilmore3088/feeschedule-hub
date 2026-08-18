import Link from "next/link";
import { getCharterLabel } from "../institution/[id]/enum-labels";
import { formatFeeAmount } from "@/lib/format";
import { TH_CLASS } from "./institution-results";

/**
 * One institution's priced row in a single fee category — backs
 * /institutions?fee={category}. A sibling of InstitutionSearchResult but
 * scoped to one category's amount instead of aggregate fee/status counts,
 * so it gets its own row shape rather than forcing that type to fit.
 */
export interface FeeDirectoryRow {
  institution_id: number;
  institution_name: string;
  amount: number;
  state_code: string | null;
  charter_type: string;
}

/** Mobile cards for the /institutions?fee={category} listing. Mirrors
 * InstitutionMobileCards' shell (same row-link classes) with a State/Type
 * line and a single amount instead of a status chip. */
export function FeeResultsCards({ rows }: { rows: FeeDirectoryRow[] }) {
  return (
    <div className="grid gap-2 sm:hidden">
      {rows.map((row) => (
        <Link
          key={row.institution_id}
          href={`/institution/${row.institution_id}`}
          className="fi-row-interaction block border border-[#E0D7C9] bg-[#FDFBF8] px-3 py-3"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold leading-snug text-[#1A1815]">
                {row.institution_name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B6255]">
                <span>{getCharterLabel(row.charter_type)}</span>
                {row.state_code && <span>{row.state_code}</span>}
              </div>
            </div>
            <span className="shrink-0 tabular-nums text-sm font-medium text-[#1A1815]">
              {formatFeeAmount(row.amount) ?? "-"}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Desktop table for the /institutions?fee={category} listing. Mirrors
 * InstitutionResultsTable's shell (same TH_CLASS, wrapper, and row classes)
 * with a State/Type column pair and a single amount column instead of
 * Location/Fees/Status. */
export function FeeResultsTable({ rows, feeName }: { rows: FeeDirectoryRow[]; feeName: string }) {
  return (
    <div className="hidden overflow-hidden border border-[#E0D7C9] bg-[#FDFBF8] sm:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#E0D7C9] bg-[#FAF7F2]">
              <th className={TH_CLASS}>Institution</th>
              <th className={TH_CLASS}>State</th>
              <th className={`hidden md:table-cell ${TH_CLASS}`}>Type</th>
              <th className={`text-right ${TH_CLASS}`}>{feeName}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.institution_id} className="fi-row-interaction border-b border-[#E0D7C9] last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/institution/${row.institution_id}`}
                    className="font-medium text-[#1A1815] transition-colors hover:text-[#C44B2E]"
                  >
                    {row.institution_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[#6B6255]">{row.state_code ?? "-"}</td>
                <td className="hidden px-4 py-3 text-[#6B6255] md:table-cell">
                  {getCharterLabel(row.charter_type)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1A1815]">
                  {formatFeeAmount(row.amount) ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
