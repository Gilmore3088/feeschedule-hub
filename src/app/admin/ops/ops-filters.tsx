"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const CHARTER_OPTIONS = [
  { value: "", label: "All Charters" },
  { value: "bank", label: "Banks" },
  { value: "credit_union", label: "Credit Unions" },
];

const TIER_OPTIONS = [
  { value: "", label: "All Tiers" },
  { value: "super_regional", label: "Super Regional ($250B+)" },
  { value: "large_regional", label: "Large Regional ($50B-$250B)" },
  { value: "regional", label: "Regional ($10B-$50B)" },
  { value: "community_large", label: "Community ($1B-$10B)" },
  { value: "community_mid", label: "Community ($300M-$1B)" },
  { value: "community_small", label: "Community (<$300M)" },
];

const DISTRICT_OPTIONS = [
  { value: "", label: "All Districts" },
  { value: "1", label: "1 - Boston" },
  { value: "2", label: "2 - New York" },
  { value: "3", label: "3 - Philadelphia" },
  { value: "4", label: "4 - Cleveland" },
  { value: "5", label: "5 - Richmond" },
  { value: "6", label: "6 - Atlanta" },
  { value: "7", label: "7 - Chicago" },
  { value: "8", label: "8 - St. Louis" },
  { value: "9", label: "9 - Minneapolis" },
  { value: "10", label: "10 - Kansas City" },
  { value: "11", label: "11 - Dallas" },
  { value: "12", label: "12 - San Francisco" },
];

const FAILURE_REASON_OPTIONS = [
  { value: "", label: "All Reasons" },
  { value: "unclassified", label: "Unclassified" },
  { value: "wrong_url", label: "Wrong URL" },
  { value: "account_agreement", label: "Account Agreement (not fee schedule)" },
  { value: "login_required", label: "Login Required" },
  { value: "pdf_scanned", label: "Scanned PDF (no text)" },
  { value: "pdf_complex", label: "Complex PDF Layout" },
  { value: "html_dynamic", label: "Dynamic/JS Content" },
  { value: "multiple_links", label: "Multiple Links (needs selection)" },
  { value: "no_fees_found", label: "Parser Found No Fees" },
  { value: "site_down", label: "Site Down / 404" },
];

const SELECT_CLASS =
  "h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300";

export function OpsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset page when filters change
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <select
        value={searchParams.get("charter") ?? ""}
        onChange={(e) => setParam("charter", e.target.value)}
        className={SELECT_CLASS}
      >
        {CHARTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("tier") ?? ""}
        onChange={(e) => setParam("tier", e.target.value)}
        className={SELECT_CLASS}
      >
        {TIER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("district") ?? ""}
        onChange={(e) => setParam("district", e.target.value)}
        className={SELECT_CLASS}
      >
        {DISTRICT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("reason") ?? ""}
        onChange={(e) => setParam("reason", e.target.value)}
        className={SELECT_CLASS}
      >
        {FAILURE_REASON_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
