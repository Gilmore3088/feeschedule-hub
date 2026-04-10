export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canAccessPremium } from '@/lib/access';
import { PeerGroupSelector } from '@/components/pro/peer-group-selector';

export const metadata: Metadata = {
  title: 'New Competitive Brief | Bank Fee Index',
};

export default async function NewBriefPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?from=/pro/reports/new');
  }
  if (!canAccessPremium(user)) {
    redirect('/subscribe');
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Page header */}
      <div className="bg-[#FFFDF9] border-b border-[#E8DFD1]">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-6 bg-[#C44B2E]" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#C44B2E]">
              Competitive Brief
            </span>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight text-[#1A1815]"
            style={{ fontFamily: 'var(--font-newsreader), Georgia, serif' }}
          >
            Configure Peer Group
          </h1>
          <p className="mt-2 text-sm text-[#7A7265] max-w-2xl">
            Define your peer segment. Hamilton will analyze your institution vs.
            this benchmark.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <PeerGroupSelector />
      </div>
    </div>
  );
}
