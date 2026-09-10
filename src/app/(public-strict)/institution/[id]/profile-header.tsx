import { Building2, ExternalLink, FileText, Landmark, MapPin } from "lucide-react";
import type { InstitutionBadge } from "@/lib/institution-badge";

const BADGE_TONE: Record<InstitutionBadge["tier"], string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-900",
  under_review: "border-amber-200 bg-amber-50 text-amber-900",
  none: "border-[#E0D7C9] bg-white text-[#6B6255]",
};

export function StatusBadge({ badge }: { badge: InstitutionBadge }) {
  return (
    <span
      title={badge.detail}
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${BADGE_TONE[badge.tier]}`}
    >
      {badge.label}
    </span>
  );
}

export interface ProfileHeaderProps {
  name: string;
  badge: InstitutionBadge;
  segmentLabel: string | null;
  locationLabel: string | null;
  charterLabel: string;
  districtName: string | null;
  websiteUrl: string | null;
  feeScheduleUrl: string | null;
  freshnessLine: string | null;
}

const LINK_CLASS =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-[#D5CBBF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#A93D25]";

export function ProfileHeader({
  name,
  badge,
  segmentLabel,
  locationLabel,
  charterLabel,
  districtName,
  websiteUrl,
  feeScheduleUrl,
  freshnessLine,
}: ProfileHeaderProps) {
  return (
    <header className="fi-reveal mb-5">
      <div className="grid gap-5 border-b border-[#D8CBB8] pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge badge={badge} />
            {segmentLabel && (
              <span className="rounded-md border border-[#E0D7C9] bg-white px-2 py-1 text-[11px] font-medium text-[#6B6255]">
                {segmentLabel}
              </span>
            )}
          </div>
          <h1
            className="max-w-4xl break-words text-4xl font-normal leading-[1.02] tracking-tight text-[#1A1815] sm:text-5xl"
            style={{ fontFamily: "var(--font-newsreader), Georgia, serif" }}
          >
            {name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#6B6255]">
            {locationLabel && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {locationLabel}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              {charterLabel}
            </span>
            {districtName && (
              <span className="inline-flex items-center gap-1.5">
                <Landmark className="h-4 w-4" />
                {districtName} district
              </span>
            )}
          </div>
          {freshnessLine && (
            <p className="mt-2 text-sm text-[#6B6255]">{freshnessLine}</p>
          )}
        </div>

        {(websiteUrl || feeScheduleUrl) && (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                Website
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {feeScheduleUrl && (
              <a href={feeScheduleUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                Published fee schedule
                <FileText className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
