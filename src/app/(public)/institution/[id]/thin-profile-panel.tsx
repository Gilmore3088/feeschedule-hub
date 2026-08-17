import Link from "next/link";
import { ClipboardCheck, FileText } from "lucide-react";
import type { FeePublicationStatus } from "@/lib/institution-quality";
import { getPublicStatusLabel } from "./enum-labels";
import { NotifyVerifiedForm } from "./notify-verified-form";
import { MIN_VERIFIED_FEES_FOR_OFFER } from "./profile-copy";

/**
 * Replaces the report offer band on profiles with fewer than
 * MIN_VERIFIED_FEES_FOR_OFFER verified fees: status, a source-intake path,
 * and a "tell me when verified" capture instead of a benchmark pitch.
 */
export function ThinProfilePanel({
  institutionId,
  institutionName,
  status,
  verifiedCount,
  correctSourceHref,
  claimHref,
}: {
  institutionId: number;
  institutionName: string;
  status: FeePublicationStatus;
  verifiedCount: number;
  correctSourceHref: string;
  claimHref: string;
}) {
  const statusLine =
    verifiedCount > 0
      ? `${verifiedCount} verified ${verifiedCount === 1 ? "fee" : "fees"} so far — benchmarks and the report offer open at ${MIN_VERIFIED_FEES_FOR_OFFER}.`
      : "No verified fees yet, so there is nothing to benchmark on this page.";

  return (
    <section className="border border-[#E0D7C9] bg-white px-4 py-4 sm:px-5">
      <div className="grid gap-5 md:grid-cols-2 md:items-start">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6B6255]">
            Status: {getPublicStatusLabel(status)}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#5A5347]">{statusLine}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={correctSourceHref}
              className="inline-flex items-center gap-2 rounded-md bg-[#C44B2E] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#A93D25]"
            >
              <FileText className="h-4 w-4" />
              Send us the fee schedule
            </Link>
            <Link
              href={claimHref}
              className="inline-flex items-center gap-2 rounded-md border border-[#D5CBBF] bg-white px-3 py-2 text-sm font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#A93D25]"
            >
              <ClipboardCheck className="h-4 w-4" />
              Work here? Claim or validate
            </Link>
          </div>
        </div>
        <div className="min-w-0 border-t border-[#F0EBE3] pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <NotifyVerifiedForm institutionId={institutionId} institutionName={institutionName} />
        </div>
      </div>
    </section>
  );
}
