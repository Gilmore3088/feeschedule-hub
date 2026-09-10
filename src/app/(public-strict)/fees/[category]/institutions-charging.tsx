import Link from "next/link";
import { dedupePerInstitution, MIN_N_PUBLISH } from "@/lib/benchmarks/sample-policy";
import { formatFeeAmount, formatNumber } from "@/lib/format";

/**
 * One priced fee row for an institution in a fee category, as read from
 * getFeeCategoryDetail(category).fees. A subset of FeeInstance so callers
 * that already have the full row (e.g. fees/[category]/page.tsx) can pass
 * it straight through.
 */
export interface CategoryFeeRow {
  institution_id: number;
  institution_name: string;
  amount: number;
  state_code: string | null;
  charter_type: string;
}

interface InstitutionsChargingProps {
  rows: CategoryFeeRow[];
  category: string;
  name: string;
}

const EYEBROW = "text-[10px] font-bold uppercase tracking-[0.15em]";
const SERIF = { fontFamily: "var(--font-newsreader), Georgia, serif" };
/** How many rows each of the lowest/highest lists shows, so the two lists
 * can't repeat an institution's name against each other (see brief ruling). */
const MAX_LISTED = 5;

function PriceList({
  title,
  rows,
  accentClass,
  amountClass,
}: {
  title: string;
  rows: CategoryFeeRow[];
  accentClass: string;
  amountClass: string;
}) {
  return (
    <div className={`rounded-xl border px-5 py-4 ${accentClass}`}>
      <p className={`${EYEBROW} text-[#6B6255]`}>{title}</p>
      <div className="mt-3 space-y-1.5">
        {rows.map((row, i) => (
          <div key={row.institution_id} className="flex items-center justify-between text-[12px]">
            <span className="text-[#5A5347] truncate mr-2">
              <span className="text-[#6B6255] tabular-nums mr-1">{i + 1}.</span>
              <Link
                href={`/institution/${row.institution_id}`}
                className="hover:text-[#A93D25] hover:underline"
              >
                {row.institution_name}
              </Link>
            </span>
            <span className={`tabular-nums font-semibold shrink-0 ${amountClass}`}>
              {formatFeeAmount(row.amount) ?? "-"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Institutions charging a given fee, lowest and highest, each linked to its
 * profile — the main reason a category page should send traffic to
 * /institution/{id} rather than dead-ending on aggregate stats. Hidden
 * entirely below MIN_N_PUBLISH, same threshold every other benchmark on the
 * site uses to decide there isn't enough data to publish a ranked list.
 */
export function InstitutionsCharging({ rows, category, name }: InstitutionsChargingProps) {
  const deduped = dedupePerInstitution(rows, "min");
  if (deduped.length < MIN_N_PUBLISH) return null;

  const sorted = [...deduped].sort((a, b) => a.amount - b.amount);
  const lowest = sorted.slice(0, MAX_LISTED);
  const highest = sorted.slice(-MAX_LISTED).reverse();

  return (
    <section className="mt-10">
      <h2 className="text-[16px] font-medium text-[#1A1815]" style={SERIF}>
        Institutions Charging {name}
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <PriceList
          title={`Lowest ${name} Fees`}
          rows={lowest}
          accentClass="border-emerald-200/60 bg-emerald-50/20"
          amountClass="text-emerald-700"
        />
        <PriceList
          title={`Highest ${name} Fees`}
          rows={highest}
          accentClass="border-red-200/60 bg-red-50/20"
          amountClass="text-red-600"
        />
      </div>
      <Link
        href={`/institutions?fee=${category}`}
        className="mt-3 inline-block text-[13px] font-medium text-[#A93D25] hover:underline"
      >
        See all {formatNumber(deduped.length)} institutions in the directory &rarr;
      </Link>
    </section>
  );
}
