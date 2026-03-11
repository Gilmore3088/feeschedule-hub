"use client";

import { useState, useCallback } from "react";
import { submitFees, searchInstitutions } from "./actions";

const FEE_CATEGORIES = [
  { value: "monthly_maintenance", label: "Monthly Maintenance" },
  { value: "overdraft", label: "Overdraft" },
  { value: "nsf", label: "NSF / Returned Item" },
  { value: "atm_non_network", label: "ATM (Non-Network)" },
  { value: "wire_domestic_outgoing", label: "Wire Transfer (Outgoing)" },
] as const;

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "per_occurrence", label: "Per Occurrence" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One Time" },
] as const;

interface FeeRow {
  fee_category: string;
  fee_name: string;
  amount: string;
  frequency: string;
}

const EMPTY_FEE: FeeRow = {
  fee_category: "",
  fee_name: "",
  amount: "",
  frequency: "per_occurrence",
};

export function SubmitForm() {
  const [institutionName, setInstitutionName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fees, setFees] = useState<FeeRow[]>(
    FEE_CATEGORIES.map((c) => ({
      fee_category: c.value,
      fee_name: c.label,
      amount: "",
      frequency: c.value === "monthly_maintenance" ? "monthly" : "per_occurrence",
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: number; name: string; state: string | null }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    setInstitutionName(query);
    if (query.length >= 2) {
      const results = await searchInstitutions(query);
      setSuggestions(results);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  const selectInstitution = (name: string) => {
    setInstitutionName(name);
    setShowSuggestions(false);
  };

  const updateFee = (index: number, field: keyof FeeRow, value: string) => {
    setFees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const validFees = fees
      .filter((f) => f.fee_name.trim() && f.amount.trim())
      .map((f) => ({
        fee_name: f.fee_name,
        fee_category: f.fee_category,
        amount: parseFloat(f.amount) || null,
        frequency: f.frequency,
      }));

    const res = await submitFees({
      institution_name: institutionName,
      source_url: sourceUrl,
      fees: validFees,
    });

    setResult(res);
    setSubmitting(false);

    if (res.success) {
      setFees(
        FEE_CATEGORIES.map((c) => ({
          fee_category: c.value,
          fee_name: c.label,
          amount: "",
          frequency: c.value === "monthly_maintenance" ? "monthly" : "per_occurrence",
        }))
      );
      setSourceUrl("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Institution Name */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Institution Name
        </label>
        <input
          type="text"
          required
          value={institutionName}
          onChange={(e) => handleSearch(e.target.value)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Search for a bank or credit union..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={() => selectInstitution(s.name)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
              >
                {s.name}
                {s.state && <span className="text-gray-400 ml-1">({s.state})</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Source URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Source URL
        </label>
        <input
          type="url"
          required
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://bank.com/fee-schedule.pdf"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
        />
        <p className="text-xs text-gray-400 mt-1">
          Link to the fee schedule page or PDF where you found these fees
        </p>
      </div>

      {/* Fee Table */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Fees
        </label>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">Fee</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-right w-28">Amount ($)</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left w-36">Frequency</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={fee.fee_name}
                      onChange={(e) => updateFee(i, "fee_name", e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={fee.amount}
                      onChange={(e) => updateFee(i, "amount", e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2 py-1 text-sm text-right border border-gray-200 rounded tabular-nums focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={fee.frequency}
                      onChange={(e) => updateFee(i, "frequency", e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
                    >
                      {FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Fill in the fees you can find. Leave amount blank for fees that don&apos;t apply.
        </p>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Fees"}
        </button>
        {result && (
          <span
            className={`text-sm ${result.success ? "text-emerald-600" : "text-red-600"}`}
          >
            {result.message}
          </span>
        )}
      </div>
    </form>
  );
}
