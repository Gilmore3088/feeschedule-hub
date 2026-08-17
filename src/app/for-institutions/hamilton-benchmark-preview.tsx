import { CheckCircle2 } from "lucide-react";

/**
 * Code-rendered mock of Hamilton Benchmark mode. Static, illustrative rows —
 * no real institution, no image. Shows the shape of an answer: peer table,
 * verified badges, and the citation line every answer carries.
 */
const PEER_ROWS = [
  { institution: "Your institution", overdraft: "$32.00", monthly: "$5.00", wire: "$25.00", you: true },
  { institution: "Peer A — $410M community bank", overdraft: "$30.00", monthly: "$6.95", wire: "$25.00" },
  { institution: "Peer B — $380M community bank", overdraft: "$35.00", monthly: "$0.00", wire: "$30.00" },
  { institution: "Peer C — $520M community bank", overdraft: "$29.00", monthly: "$7.00", wire: "$20.00" },
  { institution: "Peer median", overdraft: "$30.00", monthly: "$6.95", wire: "$25.00", median: true },
] as const;

const COLUMNS = ["Overdraft, per item", "Monthly maintenance", "Domestic wire, out"] as const;

const CELL = "px-3 py-2 text-right tabular-nums";

export function HamiltonBenchmarkPreview({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`overflow-hidden rounded-lg border border-warm-300 bg-white ${className}`}
      aria-label="Illustration of Hamilton Benchmark mode"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 bg-warm-50 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-warm-600">
          Hamilton · Benchmark mode
        </span>
        <span className="text-[11px] text-warm-600">Illustrative peer set, community banks, District 6</span>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="border-b border-warm-200 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-warm-600">
              <th className="px-4 py-2 font-bold">Institution</th>
              {COLUMNS.map((column) => (
                <th key={column} className={`${CELL} font-bold`}>
                  {column}
                </th>
              ))}
              <th className="px-3 py-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {PEER_ROWS.map((row) => {
              const isYou = "you" in row && row.you;
              const isMedian = "median" in row && row.median;
              const rowClass = isYou
                ? "bg-terra-soft/60 font-semibold text-warm-900"
                : isMedian
                  ? "border-t-2 border-warm-300 bg-warm-50 font-semibold text-warm-800"
                  : "text-warm-700";
              return (
                <tr key={row.institution} className={`border-b border-warm-200 last:border-b-0 ${rowClass}`}>
                  <td className="px-4 py-2">{row.institution}</td>
                  <td className={CELL}>{row.overdraft}</td>
                  <td className={CELL}>{row.monthly}</td>
                  <td className={CELL}>{row.wire}</td>
                  <td className="px-3 py-2">{isMedian ? "" : <VerifiedBadge />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-warm-200 px-4 py-3">
        <p className="text-[13px] leading-relaxed text-warm-800">
          Your overdraft fee is $2.00 above the peer median and in the top third of this set;
          monthly maintenance sits below the median.
        </p>
        <p className="mt-1.5 font-mono text-[11px] text-warm-600">
          Source: Peer A Fee Schedule (PDF), p.2 · Peer B Deposit Account Disclosure (PDF), p.4 ·
          Peer C Fee Schedule (HTML)
        </p>
      </div>
    </figure>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warm-300 bg-warm-50 px-2 py-0.5 text-[11px] font-semibold text-warm-700">
      <CheckCircle2 className="h-3 w-3 text-terra" aria-hidden="true" />
      Verified
    </span>
  );
}
