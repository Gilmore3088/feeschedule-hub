"use client";

import { useState, useTransition } from "react";
import { createPeerSet, removePeerSet } from "./actions";

interface SavedPeerSet {
  id: number;
  name: string;
  tiers: string | null;
  districts: string | null;
  charter_type: string | null;
  created_at: string;
}

export function PeerSetManager({
  initialPeerSets,
}: {
  initialPeerSets: SavedPeerSet[];
}) {
  const [peerSets, setPeerSets] = useState(initialPeerSets);
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: number) {
    startTransition(async () => {
      const result = await removePeerSet(id);
      if (result.success) {
        setPeerSets((prev) => prev.filter((ps) => ps.id !== id));
      }
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await createPeerSet(formData);
      if (result.success) {
        // Refresh by adding to local state
        const newSet: SavedPeerSet = {
          id: result.id ?? Date.now(),
          name: formData.get("name") as string,
          charter_type: (formData.get("charter_type") as string) || null,
          tiers: formData.getAll("asset_tiers").filter(Boolean).join(",") || null,
          districts: formData.getAll("fed_districts").filter(Boolean).join(",") || null,
          created_at: new Date().toISOString(),
        };
        setPeerSets((prev) => [...prev, newSet]);
        form.reset();
        setShowForm(false);
      }
    });
  }

  const TIERS = [
    { value: "a", label: "Under $100M" },
    { value: "b", label: "$100M-$500M" },
    { value: "c", label: "$500M-$1B" },
    { value: "d", label: "$1B-$10B" },
    { value: "e", label: "$10B-$50B" },
    { value: "f", label: "Over $50B" },
  ];

  return (
    <div>
      {/* Existing peer sets */}
      {peerSets.length === 0 && !showForm && (
        <p className="text-sm text-[var(--hamilton-on-surface-variant)] italic">
          No peer sets configured. Create one to use in Simulate and Reports.
        </p>
      )}

      <div className="space-y-2 mb-4">
        {peerSets.map((ps) => (
          <div
            key={ps.id}
            className="flex items-center justify-between p-3 rounded-md"
            style={{ backgroundColor: "var(--hamilton-surface-container-low)" }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: "var(--hamilton-on-surface)" }}>
                {ps.name}
              </span>
              {ps.charter_type && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ backgroundColor: "var(--hamilton-surface-container-high)", color: "var(--hamilton-on-surface-variant)" }}>
                  {ps.charter_type === "credit_union" ? "CU" : "Bank"}
                </span>
              )}
              {ps.tiers && (
                <span className="text-[10px] text-[var(--hamilton-on-surface-variant)]">
                  Tiers: {ps.tiers}
                </span>
              )}
              {ps.districts && (
                <span className="text-[10px] text-[var(--hamilton-on-surface-variant)]">
                  Districts: {ps.districts}
                </span>
              )}
            </div>
            <button
              onClick={() => handleDelete(ps.id)}
              disabled={isPending}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {/* Add Peer Set */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="text-sm font-medium px-4 py-2 rounded"
          style={{
            background: "linear-gradient(135deg, var(--hamilton-primary), var(--hamilton-primary-container))",
            color: "white",
          }}
        >
          Add Peer Set
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 rounded-md" style={{ backgroundColor: "var(--hamilton-surface-container-low)" }}>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1"
              style={{ color: "var(--hamilton-on-surface-variant)" }}>
              Peer Set Name
            </label>
            <input
              name="name"
              required
              className="w-full bg-transparent border-b px-1 py-1 text-sm focus:outline-none"
              style={{ borderColor: "var(--hamilton-outline-variant)", color: "var(--hamilton-on-surface)" }}
              placeholder="e.g., Mid-Atlantic Community Banks"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2"
              style={{ color: "var(--hamilton-on-surface-variant)" }}>
              Charter Type
            </label>
            <div className="flex gap-4">
              {[
                { value: "", label: "Any" },
                { value: "bank", label: "Bank" },
                { value: "credit_union", label: "Credit Union" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="charter_type" value={opt.value} defaultChecked={opt.value === ""} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2"
              style={{ color: "var(--hamilton-on-surface-variant)" }}>
              Asset Tiers
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TIERS.map((t) => (
                <label key={t.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" name="asset_tiers" value={t.value} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-2"
              style={{ color: "var(--hamilton-on-surface-variant)" }}>
              Fed Districts
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((d) => (
                <label key={d} className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" name="fed_districts" value={d} />
                  {d}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, var(--hamilton-primary), var(--hamilton-primary-container))",
                color: "white",
              }}
            >
              {isPending ? "Saving..." : "Save Peer Set"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm px-4 py-2 rounded"
              style={{ color: "var(--hamilton-on-surface-variant)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
