import { SITE_NAME } from "@/lib/constants";

interface CompareRow {
  option: string;
  coverage: string;
  refresh: string;
  sourceTraceable: string;
  peerGroupControl: string;
  cost: string;
  highlight?: boolean;
}

const COLUMNS = ["Coverage", "Refresh", "Source-traceable", "Peer-group control", "Cost"] as const;

function buildRows(institutionsLabel: string): CompareRow[] {
  return [
    {
      option: "Annual fee survey",
      coverage: "Sample-based; whoever responded",
      refresh: "Annual",
      sourceTraceable: "No",
      peerGroupControl: "No — fixed segments",
      cost: "Thousands per year",
    },
    {
      option: "DIY web scrape",
      coverage: "Whatever your team builds",
      refresh: "Whenever you rerun it",
      sourceTraceable: "Partial",
      peerGroupControl: "Manual",
      cost: "Your team's time",
    },
    {
      option: SITE_NAME,
      coverage: `${institutionsLabel} institutions with verified fees`,
      refresh: "Continuous",
      sourceTraceable: "Every figure linked to its disclosure",
      peerGroupControl: "Yes — charter, asset tier, district",
      cost: "From $300",
      highlight: true,
    },
  ];
}

export function CompareTableSection({ institutionsLabel }: { institutionsLabel: string }) {
  const rows = buildRows(institutionsLabel);
  return (
    <section className="bg-white border-b border-warm-200">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#7A7062]">
          How this compares
        </p>
        <h2
          className="mt-3 text-warm-900 text-[28px]"
          style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
        >
          Three ways to find out what competitors charge
        </h2>
        <div className="mt-8 overflow-x-auto rounded-lg border border-warm-300">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="bg-warm-150 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-warm-600">
                <th className="px-4 py-3 font-bold">Option</th>
                {COLUMNS.map((column) => (
                  <th key={column} className="px-4 py-3 font-bold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.option}
                  className={`border-t border-warm-200 ${row.highlight ? "bg-terra-soft/60" : "bg-white"}`}
                >
                  <td className="px-4 py-3 font-semibold text-warm-900">{row.option}</td>
                  <td className="px-4 py-3 text-warm-700">{row.coverage}</td>
                  <td className="px-4 py-3 text-warm-700">{row.refresh}</td>
                  <td className="px-4 py-3 text-warm-700">{row.sourceTraceable}</td>
                  <td className="px-4 py-3 text-warm-700">{row.peerGroupControl}</td>
                  <td className="px-4 py-3 text-warm-700">{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
