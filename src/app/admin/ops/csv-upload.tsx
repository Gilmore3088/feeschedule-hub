"use client";

import { useState, useTransition } from "react";
import { bulkUpdateUrls } from "./actions";

const CSV_TEMPLATE = "cert_number,institution_name,new_fee_url,document_type\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "url_update_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface ParsedRow {
  certNumber: string;
  institutionName: string;
  url: string;
  documentType: string;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  return lines.slice(1).map((line) => {
    const parts = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    return {
      certNumber: parts[0] ?? "",
      institutionName: parts[1] ?? "",
      url: parts[2] ?? "",
      documentType: parts[3] ?? "html",
    };
  }).filter((r) => r.certNumber && r.url);
}

export function CsvUpload() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{
    updated: number;
    errors: { certNumber: string; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setError("No valid rows found in CSV");
        return;
      }
      if (parsed.length > 500) {
        setError("Maximum 500 rows per batch");
        return;
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    if (rows.length === 0) return;

    startTransition(async () => {
      try {
        const res = await bulkUpdateUrls(
          rows.map((r) => ({
            certNumber: r.certNumber,
            url: r.url,
            documentType: r.documentType,
          }))
        );
        setResult(res);
        setRows([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bulk update failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="h-8 rounded-md border border-gray-200 dark:border-gray-700 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
        >
          Download CSV Template
        </button>

        <label className="h-8 rounded-md border border-gray-200 dark:border-gray-700 px-3 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer inline-flex items-center">
          Upload CSV
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {rows.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            Preview: {rows.length} URL update(s)
          </p>
          <div className="max-h-48 overflow-y-auto border rounded-md border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50/80 dark:bg-white/[0.03]">
                  <th className="px-3 py-1.5 text-left text-gray-400 font-semibold">Cert #</th>
                  <th className="px-3 py-1.5 text-left text-gray-400 font-semibold">Institution</th>
                  <th className="px-3 py-1.5 text-left text-gray-400 font-semibold">URL</th>
                  <th className="px-3 py-1.5 text-left text-gray-400 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-1 text-gray-600 dark:text-gray-400">{r.certNumber}</td>
                    <td className="px-3 py-1 text-gray-600 dark:text-gray-400 truncate max-w-[150px]">{r.institutionName}</td>
                    <td className="px-3 py-1 text-blue-600 dark:text-blue-400 truncate max-w-[200px]">{r.url}</td>
                    <td className="px-3 py-1 text-gray-500 uppercase">{r.documentType}</td>
                  </tr>
                ))}
                {rows.length > 20 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-1 text-gray-400 text-center">
                      ...and {rows.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="mt-3 h-8 rounded-md bg-gray-900 dark:bg-white/10 px-4 text-xs font-medium text-white hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Applying..." : `Apply ${rows.length} URL Update(s)`}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-md px-3 py-2 text-sm bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
          Updated {result.updated} institution(s).
          {result.errors.length > 0 && (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer">{result.errors.length} error(s)</summary>
              <ul className="mt-1 space-y-0.5">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400">
                    {err.certNumber}: {err.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
