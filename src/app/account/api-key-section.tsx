"use client";

import { generateApiKey, revokeApiKey } from "./actions";
import { useState } from "react";

interface ApiKeySectionProps {
  existingKeyPrefix: string | null;
  callCount: number;
  monthlyLimit: number;
}

export function ApiKeySection({ existingKeyPrefix, callCount, monthlyLimit }: ApiKeySectionProps) {
  const [keyPrefix, setKeyPrefix] = useState(existingKeyPrefix);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setPending(true);
    const result = await generateApiKey();
    setPending(false);
    if (result.success && result.key) {
      setNewKey(result.key);
      setKeyPrefix(result.key.slice(0, 16) + "...");
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke your API key? Any integrations using it will stop working.")) return;
    setPending(true);
    const result = await revokeApiKey();
    setPending(false);
    if (result.success) {
      setKeyPrefix(null);
      setNewKey(null);
    }
  }

  async function handleCopy() {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="bg-[#FFFDF9] rounded-xl border border-[#E8DFD1] p-5">
      <div className="text-[10px] font-semibold text-[#A69D90] uppercase tracking-wider mb-3">
        API Access
      </div>

      {newKey && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-xs font-semibold text-amber-800 mb-1">
            Copy your API key now -- it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-2 py-1.5 font-mono break-all text-[#1A1815]">
              {newKey}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 rounded-md bg-[#1A1815] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A2825] transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {keyPrefix ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <code className="text-sm font-mono text-[#1A1815]">{keyPrefix}</code>
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 uppercase">
                Active
              </span>
            </div>
            <button
              onClick={handleRevoke}
              disabled={pending}
              className="text-xs text-[#C44B2E] hover:underline disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#7A7062]">
            <span>Usage: {callCount.toLocaleString()} / {monthlyLimit.toLocaleString()} calls this month</span>
          </div>
          <div className="w-full bg-[#E8DFD1] rounded-full h-1.5">
            <div
              className="bg-[#C44B2E] h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min((callCount / monthlyLimit) * 100, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-[#7A7062] mb-3">
            Generate an API key to access fee data programmatically.
          </p>
          <button
            onClick={handleGenerate}
            disabled={pending}
            className="rounded-md bg-[#1A1815] px-4 py-2 text-xs font-medium text-white hover:bg-[#2A2825] disabled:opacity-50 transition-colors"
          >
            {pending ? "Generating..." : "Generate API Key"}
          </button>
        </div>
      )}
    </div>
  );
}
