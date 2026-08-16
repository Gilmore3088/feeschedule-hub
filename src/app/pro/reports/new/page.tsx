export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'New Competitive Brief | Bank Fee Index',
};

export default async function NewBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ instId?: string; peerSetId?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ intent: 'peer-brief' });
  if (params.instId) query.set('instId', params.instId);
  if (params.peerSetId) query.set('peerSetId', params.peerSetId);
  redirect(`/pro/reports?${query.toString()}`);
}
