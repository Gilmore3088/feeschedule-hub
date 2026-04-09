export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canAccessPremium } from '@/lib/access';
import { checkReportDailyLimit } from '@/lib/report-limits';
import { ReportGenerationForm } from '@/components/pro/report-generation-form';

export const metadata: Metadata = {
  title: 'Generate Report | Bank Fee Index',
};

export default async function NewReportPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?from=/pro/reports/new');
  }
  if (!canAccessPremium(user)) {
    redirect('/subscribe');
  }

  const { allowed, used, limit } = await checkReportDailyLimit(user.id, user.role);

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
          <h1
            className="text-3xl font-bold tracking-tight text-[#1A1815]"
            style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
          >
            Generate Report
          </h1>
          <p className="mt-2 text-sm text-[#7A7265] max-w-2xl">
            Select a report type and configure your scope. Hamilton will assemble a 3-5 page analysis.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <ReportGenerationForm
          limitReached={!allowed}
          limitInfo={{ used, limit }}
        />
      </div>
    </div>
  );
}
