export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canAccessPremium } from '@/lib/access';
import { getSql } from '@/lib/crawler-db/connection';
import { ReportHistoryList } from '@/components/pro/report-history-list';

export const metadata: Metadata = {
  title: 'Report History | Bank Fee Index',
};

interface ReportRow {
  id: string;
  report_type: string;
  status: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export default async function ReportHistoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?from=/pro/reports');
  }
  if (!canAccessPremium(user)) {
    redirect('/subscribe');
  }

  const sql = getSql();
  const rows = await sql<ReportRow[]>`
    SELECT id, report_type, status, error, created_at, completed_at
    FROM report_jobs
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Page header */}
      <div className="bg-[#FFFDF9] border-b border-[#E8DFD1]">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-6 bg-[#C44B2E]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C44B2E]">
              Reports
            </span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1
                className="text-3xl font-bold tracking-tight text-[#1A1815]"
                style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
              >
                Report History
              </h1>
              <p className="mt-2 text-sm text-[#7A7265] max-w-2xl">
                Your previously generated reports. Completed reports can be re-downloaded anytime.
              </p>
            </div>
            <Link
              href="/pro/reports/new"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-[#C44B2E] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#B03E24] transition-colors"
            >
              Generate New Report
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <ReportHistoryList reports={rows} />
      </div>
    </div>
  );
}
