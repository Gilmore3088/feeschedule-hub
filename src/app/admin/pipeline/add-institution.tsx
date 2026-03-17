"use client";

import { useState, useTransition } from "react";
import { addInstitution } from "./actions";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export function AddInstitutionForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [charter, setCharter] = useState<"bank" | "credit_union">("bank");
  const [website, setWebsite] = useState("");
  const [feeUrl, setFeeUrl] = useState("");

  function handleSubmit() {
    if (!name.trim() || !state) return;
    startTransition(async () => {
      const result = await addInstitution(name, state, charter, website || undefined, feeUrl || undefined);
      if (result.success) {
        setMessage({ type: "success", text: `Added "${name}" (ID #${result.id})` });
        setName("");
        setWebsite("");
        setFeeUrl("");
        setTimeout(() => setOpen(false), 2000);
      } else {
        setMessage({ type: "error", text: result.error || "Failed" });
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-gray-300 dark:border-white/[0.15] px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:border-white/[0.25] dark:hover:text-gray-300 transition-colors"
      >
        + Add Institution
      </button>
    );
  }

  return (
    <div className="admin-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Add Institution</h3>
        <button onClick={() => setOpen(false)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Close</button>
      </div>

      {message && (
        <div className={`mb-3 text-[11px] ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="col-span-2">
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Institution Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First National Bank"
            className="w-full rounded-md border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-2.5 py-1.5 text-[12px] dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">State</label>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full rounded-md border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-2.5 py-1.5 text-[12px] dark:text-gray-100"
          >
            <option value="">Select...</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Charter Type</label>
          <select
            value={charter}
            onChange={(e) => setCharter(e.target.value as "bank" | "credit_union")}
            className="w-full rounded-md border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-2.5 py-1.5 text-[12px] dark:text-gray-100"
          >
            <option value="bank">Bank</option>
            <option value="credit_union">Credit Union</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Website URL (optional)</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://www.example.com"
            className="w-full rounded-md border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-2.5 py-1.5 text-[12px] dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 mb-1">Fee Schedule URL (optional)</label>
          <input
            type="url"
            value={feeUrl}
            onChange={(e) => setFeeUrl(e.target.value)}
            placeholder="https://www.example.com/fees.pdf"
            className="w-full rounded-md border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[oklch(0.18_0_0)] px-2.5 py-1.5 text-[12px] dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={pending || !name.trim() || !state}
        className="rounded-md bg-gray-900 dark:bg-white/[0.1] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-gray-800 dark:hover:bg-white/[0.15] disabled:opacity-40 transition-colors"
      >
        {pending ? "Adding..." : "Add Institution"}
      </button>
    </div>
  );
}
