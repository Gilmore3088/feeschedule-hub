import Link from "next/link";
import { getHamiltonContextSourceLabel } from "@/lib/hamilton/context-source";
import { hrefWithInstitutionContext } from "@/lib/hamilton/context-link";
import { resolveHamiltonInstitutionContext } from "@/lib/hamilton/workspace-context";

type ReferenceSurface = "data" | "categories" | "districts" | "market" | "news" | "peers";

const SURFACE_COPY: Record<ReferenceSurface, { label: string; note: string }> = {
  data: {
    label: "Institution database",
    note: "Use this reference layer to find institutions, then move the selected institution into Hamilton for evidence-aware analysis.",
  },
  categories: {
    label: "Fee taxonomy",
    note: "Use category coverage as source context; Hamilton owns peer interpretation, scenario work, and board-ready outputs.",
  },
  districts: {
    label: "District reference",
    note: "Use district context as market backdrop; Hamilton ties the regional signal back to a selected institution.",
  },
  market: {
    label: "Market intelligence",
    note: "Use benchmark and research signals here, then run the actual consulting workflow in Hamilton.",
  },
  news: {
    label: "Regulatory wire",
    note: "Use regulatory updates as monitor context; Hamilton translates signals into institution-specific action paths.",
  },
  peers: {
    label: "Peer reference",
    note: "Use this builder to inspect legacy peer filters; Hamilton Reports owns saved peer sets, evidence caveats, and board-ready briefs.",
  },
};

interface ProReferenceWorkflowBannerProps {
  userId: number;
  surface: ReferenceSurface;
}

export async function ProReferenceWorkflowBanner({
  userId,
  surface,
}: ProReferenceWorkflowBannerProps) {
  const { institution, source } = await resolveHamiltonInstitutionContext({
    userId,
    persistUrlSelection: false,
  }).catch(() => ({ institution: null, source: "none" as const }));

  const selectedInstitutionId = institution ? String(institution.id) : null;
  const sourceLabel = getHamiltonContextSourceLabel(source, false);
  const copy = SURFACE_COPY[surface];

  const actions = [
    { label: "Analyze", href: hrefWithInstitutionContext("/pro/analyze", selectedInstitutionId) },
    {
      label: "Build Brief",
      href: hrefWithInstitutionContext(
        "/pro/reports?intent=competitive-brief",
        selectedInstitutionId,
      ),
    },
    { label: "Scenario", href: hrefWithInstitutionContext("/pro/simulate", selectedInstitutionId) },
    { label: "Watch", href: hrefWithInstitutionContext("/pro/monitor", selectedInstitutionId) },
  ];

  return (
    <section className="mt-6 rounded-lg border border-terra/15 bg-[#FFFDF9] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-terra/70">
              Hamilton reference layer
            </span>
            <span className="rounded-full border border-warm-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-warm-600">
              {copy.label}
            </span>
            {sourceLabel && (
              <span className="rounded-full border border-warm-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-warm-600">
                {sourceLabel}
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-warm-600">
            {institution ? (
              <>
                Selected institution:{" "}
                <strong className="font-semibold text-warm-900">{institution.name}</strong>
                {" · "}
                {institution.feePublicationLabel}
                {" · "}
                {institution.publishedFeeCount.toLocaleString()} verified /{" "}
                {institution.provisionalFeeCount.toLocaleString()} provisional rows.
              </>
            ) : (
              "No selected institution is active. Set one in Hamilton Settings to make these reference views institution-aware."
            )}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-warm-500">{copy.note}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions.map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                index === 1
                  ? "rounded-md bg-terra px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-terra-dark"
                  : "rounded-md border border-warm-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-warm-700 transition-colors hover:border-terra/30 hover:text-terra"
              }
            >
              {action.label}
            </Link>
          ))}
          <Link
            href="/pro/settings"
            className="rounded-md border border-warm-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-warm-700 transition-colors hover:border-terra/30 hover:text-terra"
          >
            Select Institution
          </Link>
        </div>
      </div>
    </section>
  );
}
