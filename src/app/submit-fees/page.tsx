import { CheckCircle2, Clock3, FileText, type LucideIcon } from "lucide-react";
import { SubmitForm } from "./submit-form";

export const metadata = {
  title: "Submit Fee Source | Bank Fee Index",
  description: "Submit an official fee schedule source for a bank or credit union profile.",
};

interface PageProps {
  searchParams: Promise<{
    institutionId?: string;
    institutionName?: string;
    sourceUrl?: string;
    submitterRole?: string;
    notes?: string;
    source?: string;
  }>;
}

export default async function SubmitFeesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const parsedInstitutionId = params.institutionId ? Number(params.institutionId) : null;
  const institutionId =
    parsedInstitutionId && Number.isInteger(parsedInstitutionId) && parsedInstitutionId > 0
      ? parsedInstitutionId
      : null;
  const institutionName = params.institutionName ?? "";
  const isClaimFlow = params.source === "claim";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF7F2] text-[#1A1815]">
      <div className="mx-auto w-full max-w-5xl min-w-0 px-4 py-8 sm:px-6 lg:py-10">
        <header className="fi-reveal mb-7 border-b border-[#D8CBB8] pb-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
                Source Intake
              </p>
              <h1
                className="mt-2 max-w-3xl break-words text-4xl font-normal leading-[1.02] text-[#1A1815] sm:text-5xl"
                style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
              >
                {isClaimFlow ? "Claim or validate this profile." : "Submit an official fee schedule."}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#5A5347]">
                {isClaimFlow
                  ? "Submit an official source URL and your role so the trust queue can review the profile with institution context."
                  : "A public fee schedule URL is enough to open validation. Optional fee rows help reviewers check extraction quality faster."}
              </p>
            </div>

            {institutionName && (
              <div className="border-y border-[#E8DFD1] bg-[#FFFDF9] px-3 py-3 lg:border-l lg:border-y-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#A69D90]">
                  Profile Context
                </p>
                <p className="mt-1 break-words text-sm font-semibold text-[#1A1815]">
                  {institutionName}
                </p>
                {institutionId && (
                  <p className="mt-1 text-xs text-[#7A7062]">
                    Institution ID {institutionId}
                  </p>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="fi-reveal fi-reveal-delay-1 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <SubmitForm
            initialInstitutionId={institutionId}
            initialInstitutionName={institutionName}
            initialSourceUrl={params.sourceUrl ?? ""}
            initialSubmitterRole={params.submitterRole}
            initialNotes={params.notes}
          />

          <aside className="min-w-0 border-l border-[#D8CBB8] pl-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A69D90]">
              Review Path
            </p>
            <div className="mt-4 space-y-4">
              <ReviewStep
                icon={FileText}
                title="Source queued"
                detail="The URL is stored with pending review status."
              />
              <ReviewStep
                icon={Clock3}
                title="Evidence checked"
                detail="Rows are reviewed before any benchmark score changes."
              />
              <ReviewStep
                icon={CheckCircle2}
                title="Benchmark eligible"
                detail="Approved rows can enter verified public scoring."
              />
            </div>
          </aside>
        </div>

        <div className="mt-10 max-w-2xl border-t border-[#E8DFD1] pt-5 text-xs leading-relaxed text-[#7A7062]">
          <p>
            By submitting, you confirm the fee data is publicly available from the
            institution&apos;s website or official documents. Submissions are rate limited.
          </p>
        </div>
      </div>
    </main>
  );
}

function ReviewStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#C44B2E]" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#1A1815]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#7A7062]">{detail}</p>
      </div>
    </div>
  );
}
