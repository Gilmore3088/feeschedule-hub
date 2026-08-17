export function DataSourcesSection({ stateLabel }: { stateLabel: string }) {
  return (
    <section className="mt-10" id="methodology">
      <div className="rounded-xl border border-[#E8DFD1]/80 bg-[#FAF7F2]/60 px-6 py-5">
        <h2
          className="text-sm font-bold text-[#5A5347]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Data Sources & Methodology
        </h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6255] mb-2">
              Primary Sources
            </p>
            <ul className="space-y-1.5 text-[13px] text-[#6B6255]">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                Published fee schedules & disclosures
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                FDIC Call Reports (service charge income)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                NCUA 5300 reports (credit union data)
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#D4C9BA] shrink-0" />
                Federal Reserve Beige Book (economic context)
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B6255] mb-2">
              Coverage
            </p>
            <ul className="space-y-1.5 text-[13px] text-[#6B6255]">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#C44B2E]/60 shrink-0" />
                Banks and credit unions
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#C44B2E]/60 shrink-0" />
                All asset size tiers
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#C44B2E]/60 shrink-0" />
                All 12 Federal Reserve districts
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#C44B2E]/60 shrink-0" />
                {stateLabel}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
