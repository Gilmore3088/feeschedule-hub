'use client';

import Link from 'next/link';

interface ReportRow {
  id: string;
  report_type: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ReportHistoryListProps {
  reports: ReportRow[];
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  peer_brief: 'Peer Brief',
  competitive_snapshot: 'Competitive Snapshot',
  state_index: 'District Outlook',
  national_index: 'National Index',
  monthly_pulse: 'Monthly Pulse',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
        Complete
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
      In Progress
    </span>
  );
}

function ActionCell({ report }: { report: ReportRow }) {
  if (report.status === 'complete') {
    return (
      <a
        href={`/api/reports/${report.id}/download`}
        className="inline-flex items-center gap-1 text-sm font-medium text-[#C44B2E] hover:text-[#B03E24] transition-colors"
      >
        <DownloadIcon />
        Download
      </a>
    );
  }
  if (report.status === 'failed') {
    return (
      <Link
        href="/pro/reports/new"
        className="text-sm text-[#7A7265] hover:text-[#1A1815] transition-colors"
      >
        Retry
      </Link>
    );
  }
  return (
    <span className="text-sm text-[#A09788]">Generating...</span>
  );
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function ReportHistoryList({ reports }: ReportHistoryListProps) {
  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] px-8 py-16 text-center">
        <p className="text-sm font-medium text-[#1A1815]">No reports yet</p>
        <p className="mt-1 text-sm text-[#7A7265]">
          Generate your first report to see it here.
        </p>
        <Link
          href="/pro/reports/new"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#C44B2E] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#B03E24] transition-colors"
        >
          Generate Report
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E8DFD1] bg-[#FFFDF9] overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#E8DFD1] bg-[#FAF7F2]">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#A09788]">
              Report Type
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#A09788]">
              Date
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#A09788]">
              Status
            </th>
            <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#A09788]">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E8DFD1]">
          {reports.map((report) => (
            <tr
              key={report.id}
              className="hover:bg-[#FAF7F2] transition-colors"
            >
              <td className="px-4 py-3 text-sm font-medium text-[#1A1815]">
                {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
              </td>
              <td className="px-4 py-3 text-sm text-[#7A7265]">
                {formatDate(report.created_at)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={report.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <ActionCell report={report} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
