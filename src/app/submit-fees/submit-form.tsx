"use client";

import { useCallback, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { submitFees, searchInstitutions } from "./actions";

const FEE_CATEGORIES = [
  { value: "monthly_maintenance", label: "Monthly Maintenance" },
  { value: "overdraft", label: "Overdraft" },
  { value: "nsf", label: "NSF / Returned Item" },
  { value: "atm_non_network", label: "ATM (Non-Network)" },
  { value: "wire_domestic_outgoing", label: "Wire Transfer (Outgoing)" },
] as const;

const DEFAULT_FEE_NAMES = new Set<string>(FEE_CATEGORIES.map((category) => category.label));

const FREQUENCIES = [
  { value: "monthly", label: "Monthly" },
  { value: "per_occurrence", label: "Per occurrence" },
  { value: "annual", label: "Annual" },
  { value: "one_time", label: "One time" },
] as const;

const SUBMITTER_ROLES = [
  { value: "consumer", label: "Consumer" },
  { value: "institution_employee", label: "Institution employee" },
  { value: "consultant", label: "Consultant or advisor" },
  { value: "other", label: "Other" },
] as const;

interface FeeRow {
  fee_category: string;
  fee_name: string;
  amount: string;
  frequency: string;
}

interface SubmitFormProps {
  initialInstitutionId?: number | null;
  initialInstitutionName?: string;
  initialSourceUrl?: string;
  initialSubmitterRole?: string;
  initialNotes?: string;
}

const EMPTY_FEE: FeeRow = {
  fee_category: "",
  fee_name: "",
  amount: "",
  frequency: "per_occurrence",
};

function defaultFeeRows(): FeeRow[] {
  return FEE_CATEGORIES.map((category) => ({
    fee_category: category.value,
    fee_name: category.label,
    amount: "",
    frequency: category.value === "monthly_maintenance" ? "monthly" : "per_occurrence",
  }));
}

export function SubmitForm({
  initialInstitutionId = null,
  initialInstitutionName = "",
  initialSourceUrl = "",
  initialSubmitterRole = "consumer",
  initialNotes = "",
}: SubmitFormProps) {
  const [institutionId, setInstitutionId] = useState<number | null>(initialInstitutionId);
  const [institutionName, setInstitutionName] = useState(initialInstitutionName);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [submitterRole, setSubmitterRole] = useState(
    SUBMITTER_ROLES.some((role) => role.value === initialSubmitterRole)
      ? initialSubmitterRole
      : "consumer",
  );
  const [notes, setNotes] = useState(initialNotes);
  const [fees, setFees] = useState<FeeRow[]>(defaultFeeRows);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [suggestions, setSuggestions] = useState<
    { id: number; name: string; state: string | null }[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearch = useCallback(async (query: string) => {
    setInstitutionName(query);
    setInstitutionId(null);
    if (query.length >= 2) {
      const results = await searchInstitutions(query);
      setSuggestions(results);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  function selectInstitution(selection: { id: number; name: string }) {
    setInstitutionId(selection.id);
    setInstitutionName(selection.name);
    setShowSuggestions(false);
  }

  function updateFee(index: number, field: keyof FeeRow, value: string) {
    setFees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addFeeRow() {
    setFees((prev) => [...prev, EMPTY_FEE]);
  }

  function removeFeeRow(index: number) {
    setFees((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const validFees = fees
      .filter((fee) => {
        const feeName = fee.fee_name.trim();
        return fee.amount.trim() || (feeName && !DEFAULT_FEE_NAMES.has(feeName));
      })
      .map((fee) => ({
        fee_name: fee.fee_name.trim(),
        fee_category: fee.fee_category,
        amount: fee.amount.trim() ? parseFloat(fee.amount) || null : null,
        frequency: fee.frequency,
      }));

    const res = await submitFees({
      institution_id: institutionId,
      institution_name: institutionName,
      source_url: sourceUrl,
      submitter_role: submitterRole,
      notes,
      fees: validFees,
    });

    setResult(res);
    setSubmitting(false);

    if (res.success) {
      setFees(defaultFeeRows());
      setSourceUrl("");
      setNotes("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-0 overflow-hidden border border-[#E8DFD1] bg-white p-5">
      <div className="space-y-5">
        <div className="relative">
          <label htmlFor="institution-name" className="block text-xs font-bold uppercase tracking-[0.12em] text-[#7A7062]">
            Institution
          </label>
          <input
            id="institution-name"
            type="text"
            required
            value={institutionName}
            onChange={(e) => handleSearch(e.target.value)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search for a bank or credit union"
            className="mt-1 w-full min-w-0 rounded-md border border-[#D5CBBF] px-3 py-2 text-sm outline-none transition-colors focus:border-[#C44B2E]"
          />
          {institutionId && (
            <p className="mt-1 text-xs text-[#7A7062]">
              Matched institution ID {institutionId}
            </p>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-[#E8DFD1] bg-white shadow-lg">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onMouseDown={() => selectInstitution(suggestion)}
                  className="w-full border-b border-[#F0E8DD] px-3 py-2 text-left text-sm last:border-0 hover:bg-[#FAF7F2]"
                >
                  <span className="font-medium text-[#1A1815]">{suggestion.name}</span>
                  {suggestion.state && (
                    <span className="ml-1 text-[#7A7062]">({suggestion.state})</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="source-url" className="block text-xs font-bold uppercase tracking-[0.12em] text-[#7A7062]">
            Official Source URL
          </label>
          <div className="mt-1 flex min-w-0 gap-2">
            <FileText className="mt-2.5 h-4 w-4 shrink-0 text-[#C44B2E]" />
            <input
              id="source-url"
              type="url"
              required
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://bank.example/fee-schedule.pdf"
              className="min-w-0 flex-1 rounded-md border border-[#D5CBBF] px-3 py-2 text-sm outline-none transition-colors focus:border-[#C44B2E]"
            />
          </div>
          <p className="mt-1 text-xs text-[#7A7062]">
            Use a fee schedule page, PDF, disclosure, or account agreement from the institution.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="submitter-role" className="block text-xs font-bold uppercase tracking-[0.12em] text-[#7A7062]">
              Submitter Role
            </label>
            <select
              id="submitter-role"
              value={submitterRole}
              onChange={(e) => setSubmitterRole(e.target.value)}
              className="mt-1 w-full min-w-0 rounded-md border border-[#D5CBBF] px-3 py-2 text-sm outline-none transition-colors focus:border-[#C44B2E]"
            >
              {SUBMITTER_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-xs font-bold uppercase tracking-[0.12em] text-[#7A7062]">
              Notes
            </label>
            <input
              id="notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for reviewers"
              className="mt-1 w-full min-w-0 rounded-md border border-[#D5CBBF] px-3 py-2 text-sm outline-none transition-colors focus:border-[#C44B2E]"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A7062]">
                Optional Fee Rows
              </p>
              <p className="mt-1 text-xs text-[#7A7062]">
                Leave amounts blank to submit the source only.
              </p>
            </div>
            <button
              type="button"
              onClick={addFeeRow}
            className="inline-flex items-center gap-1 rounded-md border border-[#D5CBBF] px-2 py-1 text-xs font-semibold text-[#1A1815] transition-colors hover:border-[#C44B2E] hover:text-[#C44B2E]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add row
            </button>
          </div>

          <div className="mt-3 min-w-0 space-y-2 overflow-hidden">
            {fees.map((fee, i) => (
              <div
                key={i}
                className="fi-row-interaction grid min-w-0 gap-2 border border-[#E8DFD1] bg-[#FFFDF9] p-3 sm:grid-cols-[minmax(0,1fr)_110px_150px_32px]"
              >
                <input
                  type="text"
                  value={fee.fee_name}
                  onChange={(e) => updateFee(i, "fee_name", e.target.value)}
                  aria-label="Fee name"
                  className="min-w-0 rounded border border-[#D5CBBF] px-2 py-1.5 text-sm outline-none focus:border-[#C44B2E]"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fee.amount}
                  onChange={(e) => updateFee(i, "amount", e.target.value)}
                  placeholder="Amount"
                  aria-label="Amount"
                  className="min-w-0 rounded border border-[#D5CBBF] px-2 py-1.5 text-sm tabular-nums outline-none focus:border-[#C44B2E] sm:text-right"
                />
                <select
                  value={fee.frequency}
                  onChange={(e) => updateFee(i, "frequency", e.target.value)}
                  aria-label="Frequency"
                  className="min-w-0 rounded border border-[#D5CBBF] px-2 py-1.5 text-sm outline-none focus:border-[#C44B2E]"
                >
                  {FREQUENCIES.map((frequency) => (
                    <option key={frequency.value} value={frequency.value}>
                      {frequency.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeFeeRow(i)}
                  aria-label="Remove fee row"
                  className="inline-flex h-8 w-8 items-center justify-center rounded border border-[#D5CBBF] text-[#7A7062] hover:border-[#C44B2E] hover:text-[#C44B2E]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[#E8DFD1] pt-5 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md bg-[#1A1815] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2C2822] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit source"}
          </button>
          {result && (
            <span className={`text-sm ${result.success ? "text-emerald-700" : "text-red-700"}`}>
              {result.message}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
