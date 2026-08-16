"use client";

interface ApiKeySectionProps {
  existingKeyPrefix?: string | null;
  callCount?: number;
  monthlyLimit?: number;
}

export function ApiKeySection(_props: ApiKeySectionProps) {
  void _props;

  return (
    <div className="bg-[#FFFDF9] rounded-xl border border-[#E8DFD1] p-5">
      <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-3">
        API and Exports
      </div>
      <p className="text-sm text-[#7A7062]">
        REST endpoints and verified-only CSV exports are available now. Managed account keys require manual workspace setup and are not exposed as self-serve account controls.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href="/api-docs"
          className="rounded-md border border-[#D8CDBD] px-3 py-1.5 text-xs font-medium text-[#1A1815] no-underline hover:border-[#C44B2E]/40"
        >
          API Docs
        </a>
        <a
          href="/api/v1/fees?format=csv"
          className="rounded-md bg-[#1A1815] px-3 py-1.5 text-xs font-medium text-white no-underline hover:bg-[#2A2825]"
        >
          Export CSV
        </a>
      </div>
    </div>
  );
}
