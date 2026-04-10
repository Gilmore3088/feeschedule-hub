"use client";

import { useState, Suspense } from "react";
import { SortableTable, type Column } from "@/components/sortable-table";
import type { LeadRow } from "@/lib/admin-queries";

const ROLE_LABELS: Record<string, string> = {
  bank_cu: "Bank / CU",
  consultant: "Consultant",
  fintech: "Fintech",
  compliance: "Compliance",
  researcher: "Researcher",
  other: "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  contact_enterprise: "Enterprise licensing",
  contact_report: "Custom report",
  contact_partnership: "Data partnership",
  contact_general: "General inquiry",
  coming_soon: "Coming soon signup",
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    contacted: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    converted: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    updated: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[status] || "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
    >
      {status}
    </span>
  );
}

type LeadRowExtended = LeadRow & Record<string, unknown>;

function LeadDetail({ lead }: { lead: LeadRow }) {
  return (
    <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-white/[0.04] bg-gray-50/40 dark:bg-white/[0.01]">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
            Role
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {ROLE_LABELS[lead.role || ""] || lead.role || "\u2014"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
            Source
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {SOURCE_LABELS[lead.source || ""] || lead.source || "\u2014"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
            Email
          </p>
          <a
            href={`mailto:${lead.email}`}
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            {lead.email}
          </a>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Message
        </p>
        <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-4 py-3">
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
            {lead.use_case || "No message provided."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (leads.length === 0) {
    return (
      <div className="admin-card px-4 py-8 text-center text-gray-400">
        No leads yet
      </div>
    );
  }

  const columns: Column<LeadRowExtended>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      format: (v) => <span className="font-medium text-gray-900 dark:text-gray-200">{v as string}</span>,
    },
    {
      key: "email",
      label: "Email",
      sortable: true,
      format: (v) => <span className="text-gray-600 dark:text-gray-400">{v as string}</span>,
    },
    {
      key: "company",
      label: "Company",
      sortable: true,
      format: (v) => <span className="text-gray-600 dark:text-gray-400">{(v as string) || "\u2014"}</span>,
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      format: (v) => (
        <span className="text-gray-500 text-xs">
          {SOURCE_LABELS[(v as string) || ""] || (v as string) || "\u2014"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      format: (v) => <StatusBadge status={v as string} />,
    },
    {
      key: "created_at",
      label: "Date",
      sortable: true,
      format: (v) => <span className="text-gray-400 text-xs tabular-nums">{v as string}</span>,
    },
  ];

  return (
    <div>
      <Suspense fallback={null}>
        <SortableTable
          columns={columns}
          rows={leads as LeadRowExtended[]}
          rowKey={(r) => String(r.id)}
          defaultSort="name"
          defaultDir="asc"
          pageSize={50}
          onRowClick={(row) => {
            const id = row.id as number;
            setExpandedId((prev) => (prev === id ? null : id));
          }}
        />
      </Suspense>
      {expandedId !== null && (
        <LeadDetail lead={leads.find((l) => l.id === expandedId)!} />
      )}
    </div>
  );
}
