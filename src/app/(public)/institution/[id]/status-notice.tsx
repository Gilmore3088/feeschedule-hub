import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Clock3, Database, FileText, type LucideIcon } from "lucide-react";
import type { FeePublicationStatus } from "@/lib/institution-quality";
import type { RatingResult } from "@/lib/institution-rating";
import { formatFeeAmount } from "@/lib/format";
import { getPublicStatusLabel } from "./enum-labels";
import { STATUS_COPY } from "./profile-copy";

const STATUS_TONE: Record<FeePublicationStatus, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  provisional: "border-amber-200 bg-amber-50 text-amber-900",
  under_review: "border-amber-200 bg-amber-50 text-amber-900",
  unavailable: "border-[#E0D7C9] bg-white text-[#5A5347]",
};

const STATUS_ICON: Record<FeePublicationStatus, LucideIcon> = {
  verified: AlertTriangle,
  provisional: AlertTriangle,
  under_review: Clock3,
  unavailable: Database,
};

/** Notice shown for anything other than a fully verified profile. */
export function StatusNotice({
  status,
  needsSource,
  correctSourceHref,
  claimHref,
}: {
  status: FeePublicationStatus;
  needsSource: boolean;
  correctSourceHref: string;
  claimHref: string;
}) {
  if (status === "verified") return null;
  const Icon = STATUS_ICON[status];

  return (
    <section className={`fi-reveal fi-reveal-delay-2 mb-6 border px-4 py-4 sm:px-5 ${STATUS_TONE[status]}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{getPublicStatusLabel(status)}</p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed">{STATUS_COPY[status]}</p>
          </div>
        </div>
        {needsSource && (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Link
              href={correctSourceHref}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C44B2E] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#A93D25]"
            >
              <FileText className="h-3.5 w-3.5" />
              Send us the fee schedule
            </Link>
            <Link
              href={claimHref}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-xs font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#C44B2E]"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Claim or validate
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/** Benchmark narrative; the caller only renders this once enough verified fees exist. */
export function FeeProfileSummary({
  rating,
  interpretation,
  overdraftAmount,
}: {
  rating: RatingResult;
  interpretation: string;
  overdraftAmount: number | null;
}) {
  return (
    <section className="border border-[#E0D7C9] bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">
            Verified Fee Profile
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[#1A1815]">{rating.label}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5A5347]">{interpretation}</p>
        </div>
        {overdraftAmount !== null && (
          <div className="rounded-lg border border-[#E0D7C9] bg-[#FAF7F2] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">Overdraft</p>
            <p
              className="mt-1 text-3xl text-[#1A1815]"
              style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
            >
              {formatFeeAmount(overdraftAmount)}
            </p>
          </div>
        )}
      </div>
      {rating.bullets.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {rating.bullets.map((bullet) => (
            <div
              key={bullet}
              className="rounded-md border border-[#E0D7C9] bg-[#FDFBF8] px-3 py-2 text-sm text-[#5A5347]"
            >
              {bullet}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
