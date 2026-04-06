/**
 * GET /api/reports/peer-brief/confirm
 * Phase 15-01: Lightweight peer group preview for the brief configuration UI.
 *
 * Returns institution_count, observation_count, category_count, and a thin flag
 * for the selected filter combination — without triggering report generation.
 *
 * Threat refs: T-15-01, T-15-02, T-15-03
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canAccessPremium } from '@/lib/access';
import { getPeerIndex } from '@/lib/crawler-db/fee-index';

export const dynamic = 'force-dynamic';

// T-15-03: allowlist of valid charter values
const VALID_CHARTERS = new Set(['bank', 'credit_union', '']);

export async function GET(request: Request) {
  // T-15-01: auth required before any DB query
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // T-15-02: premium access required
  if (!canAccessPremium(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const charter = searchParams.get('charter') ?? '';
  const tierParam = searchParams.get('tier') ?? '';
  const districtParam = searchParams.get('district') ?? '';

  // T-15-03: validate charter against allowlist
  if (!VALID_CHARTERS.has(charter)) {
    return NextResponse.json({ error: 'Invalid charter value' }, { status: 400 });
  }

  const asset_tiers = tierParam
    ? tierParam.split(',').filter(Boolean)
    : undefined;

  // T-15-03: filter districts to valid range 1-12
  const fed_districts =
    districtParam
      ? districtParam
          .split(',')
          .map(Number)
          .filter((d) => Number.isInteger(d) && d >= 1 && d <= 12)
      : undefined;

  try {
    const peerIndex = await getPeerIndex({
      charter_type: charter || undefined,
      asset_tiers: asset_tiers && asset_tiers.length > 0 ? asset_tiers : undefined,
      fed_districts: fed_districts && fed_districts.length > 0 ? fed_districts : undefined,
    });

    const institution_count = peerIndex.length > 0
      ? Math.max(...peerIndex.map((e) => e.institution_count), 0)
      : 0;

    const observation_count = peerIndex.reduce(
      (sum, e) => sum + e.observation_count,
      0
    );

    return NextResponse.json({
      institution_count,
      observation_count,
      category_count: peerIndex.length,
      thin: institution_count < 5,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database error';
    console.error('[peer-brief/confirm] DB error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
