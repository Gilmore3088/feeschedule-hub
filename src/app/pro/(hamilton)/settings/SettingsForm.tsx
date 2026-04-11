"use client";

import { useActionState } from "react";
import { updateInstitutionProfile, type ProfileFormState } from "./actions";
import { DISTRICT_NAMES } from "@/lib/fed-districts";

const ASSET_TIER_OPTIONS = [
  { value: "a", label: "Under $100M" },
  { value: "b", label: "$100M – $500M" },
  { value: "c", label: "$500M – $1B" },
  { value: "d", label: "$1B – $10B" },
  { value: "e", label: "$10B – $50B" },
  { value: "f", label: "Over $50B" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

interface SettingsFormProps {
  initialValues: {
    institution_name: string | null;
    institution_type: string | null;
    asset_tier: string | null;
    state_code: string | null;
    fed_district: number | null;
  };
}

const initialState: ProfileFormState = { success: false };

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateInstitutionProfile, initialState);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Institution Name */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="institution_name"
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            Institution Name
          </label>
          <input
            id="institution_name"
            name="institution_name"
            type="text"
            required
            maxLength={200}
            defaultValue={initialValues.institution_name ?? ""}
            placeholder="e.g. First National Bank"
            className="rounded-md px-3 py-2 text-sm border outline-none transition-colors"
            style={{
              backgroundColor: "white",
              borderColor: "var(--hamilton-border)",
              color: "var(--hamilton-text-primary)",
            }}
          />
        </div>

        {/* CERT Number (placeholder) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cert_number"
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            CERT Number
          </label>
          <input
            id="cert_number"
            name="cert_number"
            type="text"
            disabled
            placeholder="Coming soon"
            className="rounded-md px-3 py-2 text-sm border cursor-not-allowed opacity-50"
            style={{
              backgroundColor: "var(--hamilton-surface-elevated)",
              borderColor: "var(--hamilton-border)",
              color: "var(--hamilton-text-secondary)",
            }}
          />
        </div>

        {/* Asset Size */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="asset_tier"
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            Asset Size
          </label>
          <select
            id="asset_tier"
            name="asset_tier"
            defaultValue={initialValues.asset_tier ?? ""}
            className="rounded-md px-3 py-2 text-sm border outline-none transition-colors"
            style={{
              backgroundColor: "white",
              borderColor: "var(--hamilton-border)",
              color: "var(--hamilton-text-primary)",
            }}
          >
            <option value="">Select asset size</option>
            {ASSET_TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Fed District */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="fed_district"
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            Fed District
          </label>
          <select
            id="fed_district"
            name="fed_district"
            defaultValue={initialValues.fed_district ?? ""}
            className="rounded-md px-3 py-2 text-sm border outline-none transition-colors"
            style={{
              backgroundColor: "white",
              borderColor: "var(--hamilton-border)",
              color: "var(--hamilton-text-primary)",
            }}
          >
            <option value="">Select district</option>
            {Object.entries(DISTRICT_NAMES).map(([num, name]) => (
              <option key={num} value={num}>
                {num} – {name}
              </option>
            ))}
          </select>
        </div>

        {/* Market Region (state) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="state_code"
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            Market Region
          </label>
          <select
            id="state_code"
            name="state_code"
            defaultValue={initialValues.state_code ?? ""}
            className="rounded-md px-3 py-2 text-sm border outline-none transition-colors"
            style={{
              backgroundColor: "white",
              borderColor: "var(--hamilton-border)",
              color: "var(--hamilton-text-primary)",
            }}
          >
            <option value="">Select state</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Institution Type */}
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--hamilton-text-secondary)" }}
          >
            Institution Type
          </span>
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--hamilton-text-primary)" }}>
              <input
                type="radio"
                name="institution_type"
                value="bank"
                defaultChecked={initialValues.institution_type === "bank"}
                className="accent-[--hamilton-accent]"
              />
              Commercial Bank
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--hamilton-text-primary)" }}>
              <input
                type="radio"
                name="institution_type"
                value="credit_union"
                defaultChecked={initialValues.institution_type === "credit_union"}
                className="accent-[--hamilton-accent]"
              />
              Credit Union
            </label>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {state.success && (
        <p className="mt-4 text-sm font-medium" style={{ color: "oklch(0.55 0.15 145)" }}>
          Profile saved successfully.
        </p>
      )}
      {!state.success && state.error && (
        <p className="mt-4 text-sm font-medium" style={{ color: "oklch(0.55 0.22 25)" }}>
          {state.error}
        </p>
      )}

      {/* Submit */}
      <div className="mt-6">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 rounded-md text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--hamilton-gradient-cta)" }}
        >
          {isPending ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
