import { getDb } from "@/lib/crawler-db/connection";
import { timeAgo } from "@/lib/format";

interface DataSource {
  name: string;
  table: string;
  dateColumn: string;
  cadence: string;
  cadenceDays: number;
}

const DATA_SOURCES: DataSource[] = [
  { name: "FRED Economic Indicators", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7 },
  { name: "BLS CPI", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7 },
  { name: "NY Fed Rates", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Daily", cadenceDays: 1 },
  { name: "OFR Stress Index", table: "fed_economic_indicators", dateColumn: "fetched_at", cadence: "Daily", cadenceDays: 1 },
  { name: "CFPB Complaints", table: "institution_complaints", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7 },
  { name: "FDIC Financials", table: "institution_financials", dateColumn: "fetched_at", cadence: "Quarterly", cadenceDays: 90 },
  { name: "Fed Beige Book", table: "fed_beige_book", dateColumn: "fetched_at", cadence: "8x/year", cadenceDays: 45 },
  { name: "Fed Speeches", table: "fed_content", dateColumn: "fetched_at", cadence: "Weekly", cadenceDays: 7 },
  { name: "SOD Branch Deposits", table: "branch_deposits", dateColumn: "fetched_at", cadence: "Annual", cadenceDays: 365 },
  { name: "Census Demographics", table: "demographics", dateColumn: "fetched_at", cadence: "Annual", cadenceDays: 365 },
  { name: "Census Tracts", table: "census_tracts", dateColumn: "fetched_at", cadence: "Annual", cadenceDays: 365 },
];

function getRefreshTimestamps(): { name: string; lastRefresh: string | null; cadence: string; overdue: boolean; rowCount: number }[] {
  const db = getDb();
  return DATA_SOURCES.map((src) => {
    try {
      const row = db.prepare(`SELECT MAX(${src.dateColumn}) as last_refresh, COUNT(*) as cnt FROM ${src.table}`).get() as { last_refresh: string | null; cnt: number };
      const lastRefresh = row.last_refresh;
      let overdue = false;
      if (lastRefresh) {
        const daysSince = (Date.now() - new Date(lastRefresh).getTime()) / (1000 * 60 * 60 * 24);
        overdue = daysSince > src.cadenceDays * 1.5;
      }
      return { name: src.name, lastRefresh, cadence: src.cadence, overdue, rowCount: row.cnt };
    } catch {
      return { name: src.name, lastRefresh: null, cadence: src.cadence, overdue: true, rowCount: 0 };
    }
  });
}


export function DataSourcesStatus() {
  const sources = getRefreshTimestamps();

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/[0.08] overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200 dark:border-white/[0.06]">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Data Sources
        </h3>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.04]">
            <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Source</th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rows</th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Last Refresh</th>
            <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cadence</th>
            <th className="px-4 py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((src) => (
            <tr key={src.name} className="border-b border-gray-50 dark:border-white/[0.03] last:border-0">
              <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{src.name}</td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-500">{src.rowCount.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                {src.lastRefresh ? timeAgo(src.lastRefresh) : "Never"}
              </td>
              <td className="px-4 py-2 text-right text-gray-400">{src.cadence}</td>
              <td className="px-4 py-2 text-center">
                {src.rowCount === 0 ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="No data" />
                ) : src.overdue ? (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Overdue" />
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" title="Current" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
