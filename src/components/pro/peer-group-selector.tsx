'use client';

import { useState, useEffect, useRef } from 'react';
import { DISTRICT_NAMES, TIER_LABELS, TIER_ORDER } from '@/lib/fed-districts';
import { BriefStatusPoller } from './brief-status-poller';

interface PeerPreview {
  institution_count: number;
  observation_count: number;
  category_count: number;
  thin: boolean;
}

export function PeerGroupSelector() {
  const [charter, setCharter] = useState<string>('');
  const [tiers, setTiers] = useState<string[]>([]);
  const [districts, setDistricts] = useState<number[]>([]);
  const [preview, setPreview] = useState<PeerPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced fetch to confirm endpoint on filter change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams();
        if (charter) params.set('charter', charter);
        if (tiers.length > 0) params.set('tier', tiers.join(','));
        if (districts.length > 0) params.set('district', districts.join(','));

        const res = await fetch(`/api/reports/peer-brief/confirm?${params.toString()}`);
        if (res.ok) {
          const data = await res.json() as PeerPreview;
          setPreview(data);
        }
      } catch {
        // Preview failures are non-critical; leave stale preview visible
      } finally {
        setPreviewLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [charter, tiers, districts]);

  function toggleTier(tierKey: string) {
    setTiers((prev) =>
      prev.includes(tierKey) ? prev.filter((t) => t !== tierKey) : [...prev, tierKey]
    );
  }

  function toggleDistrict(d: number) {
    setDistricts((prev) =>
      prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d]
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_type: 'peer_brief',
          params: {
            charter_type: charter || undefined,
            asset_tiers: tiers.length > 0 ? tiers : undefined,
            fed_districts: districts.length > 0 ? districts : undefined,
          },
        }),
      });

      if (res.status === 202) {
        const data = await res.json() as { jobId: string };
        setJobId(data.jobId);
      } else {
        const data = await res.json() as { error?: string };
        setGenerateError(data.error ?? 'Generation failed. Please try again.');
      }
    } catch {
      setGenerateError('Network error. Please check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  }

  // Active chip style classes (reused from peers/page.tsx)
  const activeChip =
    'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full border transition-colors bg-[#C44B2E] text-white border-[#C44B2E]';
  const inactiveChip =
    'inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full border transition-colors bg-white text-[#5A5347] border-[#E8DFD1] hover:border-[#C44B2E]/40 hover:text-[#C44B2E] cursor-pointer';

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="rounded-xl border border-[#E8DFD1] bg-[#FFFDF9] p-5 space-y-5">
        {/* Charter */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
            Charter Type
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { value: '', label: 'All' },
              { value: 'bank', label: 'Bank' },
              { value: 'credit_union', label: 'Credit Union' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCharter(opt.value)}
                className={charter === opt.value ? activeChip : inactiveChip}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Asset Tier */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
            Asset Tier
          </p>
          <div className="flex flex-wrap gap-2">
            {TIER_ORDER.map((tierKey) => (
              <button
                key={tierKey}
                type="button"
                onClick={() => toggleTier(tierKey)}
                className={tiers.includes(tierKey) ? activeChip : inactiveChip}
              >
                {TIER_LABELS[tierKey]}
              </button>
            ))}
          </div>
        </div>

        {/* Fed District */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788] mb-2">
            Fed District
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDistrict(d)}
                className={districts.includes(d) ? activeChip : inactiveChip}
              >
                {d} - {DISTRICT_NAMES[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Peer Group Preview Card */}
      <div className="rounded-xl border border-[#E8DFD1] bg-[#FFFDF9] p-5 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A09788]">
          Peer Group Preview
        </p>

        {previewLoading && !preview && (
          <p className="text-sm text-[#A09788]">Loading peer group data...</p>
        )}

        {preview && (
          <>
            <div className="flex items-baseline gap-6">
              <div>
                <span
                  className={`text-2xl font-bold tabular-nums ${
                    preview.institution_count >= 5
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {preview.institution_count.toLocaleString()}
                </span>
                <span className="ml-1.5 text-xs text-[#A09788]">institutions</span>
              </div>
              <div>
                <span className="text-lg font-semibold tabular-nums text-[#1A1815]">
                  {preview.observation_count.toLocaleString()}
                </span>
                <span className="ml-1.5 text-xs text-[#A09788]">observations</span>
              </div>
              <div>
                <span className="text-lg font-semibold tabular-nums text-[#1A1815]">
                  {preview.category_count.toLocaleString()}
                </span>
                <span className="ml-1.5 text-xs text-[#A09788]">fee categories</span>
              </div>
            </div>

            {/* Thin group warning */}
            {preview.thin && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                Peer group has fewer than 5 institutions — results may have limited
                statistical confidence. Generation is still allowed.
              </div>
            )}

            {/* Large group info */}
            {preview.institution_count > 200 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                Peer group exceeds 200 institutions — medians will be statistically robust.
              </div>
            )}
          </>
        )}

        {/* Generate error */}
        {generateError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {generateError}
          </div>
        )}

        {/* Generate button */}
        {!jobId && (
          <div className="pt-1">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors bg-[#C44B2E] hover:bg-[#A83D25] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating...' : 'Generate Brief'}
            </button>
          </div>
        )}
      </div>

      {/* Live status poller — mounts after generate returns a jobId */}
      {jobId && <BriefStatusPoller jobId={jobId} />}
    </div>
  );
}
