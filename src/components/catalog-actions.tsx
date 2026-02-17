"use client";

import { useTransition } from "react";
import { Download, Printer } from "lucide-react";
import { exportCatalogCsv } from "@/app/admin/fees/catalog/actions";

export function CatalogActions() {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const csv = await exportCatalogCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fee-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <button
        onClick={handleExport}
        disabled={isPending}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        {isPending ? "Exporting..." : "Export CSV"}
      </button>
      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <Printer className="h-3.5 w-3.5" />
        Print
      </button>
    </div>
  );
}
