import Link from "next/link";
import { BarChart2, ClipboardCheck, FileText, MessageSquareText } from "lucide-react";
import type { PublicInstitutionProfileLinks } from "@/lib/institution-profile-links";
import { METHODOLOGY_COPY } from "./profile-copy";

export interface KeyFact {
  label: string;
  value: string;
}

function Fact({ label, value }: KeyFact) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#F0EBE3] pb-3 last:border-0 last:pb-0">
      <span className="text-[#7A7062]">{label}</span>
      <span className="max-w-[55%] break-words text-right font-semibold text-[#1A1815]">{value}</span>
    </div>
  );
}

const PRO_LINK_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-md border border-[#5A5347] px-3 py-2 text-sm font-semibold text-white transition-colors hover:border-[#D4A574]";

export function ProfileSidebar({
  facts,
  links,
  isAuthenticated,
  showAddSource,
}: {
  facts: KeyFact[];
  links: PublicInstitutionProfileLinks;
  isAuthenticated: boolean;
  showAddSource: boolean;
}) {
  return (
    <aside className="min-w-0 space-y-6 lg:sticky lg:top-6">
      <section className="border border-[#E0D7C9] bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">Key Facts</p>
        <div className="mt-4 space-y-3 text-sm">
          {facts.map((fact) => (
            <Fact key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </div>
      </section>

      <section className="border border-[#1A1815] bg-[#1A1815] p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#D4A574]">
          Fee Insight Pro
        </p>
        <h2 className="mt-2 text-lg font-semibold">Benchmark this institution in Hamilton</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#E8DFD1]">
          Hamilton is the Fee Insight Pro workspace: benchmark, scenario, report and monitor this
          institution&apos;s fee position against a verified peer set.
        </p>
        <div className="mt-4 grid gap-2">
          <Link
            href={links.briefHref}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C44B2E] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#A93D25]"
          >
            <BarChart2 className="h-4 w-4" />
            Generate competitive brief
          </Link>
          <Link href={links.analyzeHref} className={PRO_LINK_SECONDARY}>
            <MessageSquareText className="h-4 w-4" />
            Ask about this institution
          </Link>
          <Link href={links.scenarioHref} className={PRO_LINK_SECONDARY}>
            <FileText className="h-4 w-4" />
            Run scenario
          </Link>
          {showAddSource && (
            <Link href={links.correctSourceHref} className={PRO_LINK_SECONDARY}>
              <ClipboardCheck className="h-4 w-4" />
              Add a fee source
            </Link>
          )}
        </div>
        {!isAuthenticated && (
          <p className="mt-3 text-xs leading-relaxed text-[#E8DFD1]">
            Pro actions open pricing first; you return to this profile after signing up.
          </p>
        )}
      </section>

      <section className="border border-[#E0D7C9] bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">Methodology</p>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#5A5347]">
          {METHODOLOGY_COPY.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    </aside>
  );
}
