"use client";

import { Suspense } from "react";
import { SortableTable, type Column } from "@/components/sortable-table";

interface AgentRow extends Record<string, unknown> {
  agent_id: string;
  agent_name: string;
  queries: number;
  cost_cents: number;
}

interface UserRow extends Record<string, unknown> {
  user_id: number | string | null;
  username: string;
  queries: number;
  cost_cents: number;
}

interface DayRow extends Record<string, unknown> {
  date: string;
  queries: number;
  cost_cents: number;
}

const agentColumns: Column<AgentRow>[] = [
  {
    key: "agent_name",
    label: "Agent",
    sortable: true,
    format: (v) => <span className="font-medium text-gray-700 dark:text-gray-300">{v as string}</span>,
  },
  {
    key: "queries",
    label: "Queries",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">{v as number}</span>,
  },
  {
    key: "cost_cents",
    label: "Est. Cost",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">${((v as number) / 100).toFixed(2)}</span>,
  },
];

const userColumns: Column<UserRow>[] = [
  {
    key: "username",
    label: "User",
    sortable: true,
    format: (v) => <span className="font-medium text-gray-700 dark:text-gray-300">{v as string}</span>,
  },
  {
    key: "queries",
    label: "Queries",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">{v as number}</span>,
  },
  {
    key: "cost_cents",
    label: "Est. Cost",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">${((v as number) / 100).toFixed(2)}</span>,
  },
];

const dayColumns: Column<DayRow>[] = [
  {
    key: "date",
    label: "Date",
    sortable: true,
    format: (v) => (
      <span className="text-gray-700 dark:text-gray-300">
        {new Date((v as string) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    ),
  },
  {
    key: "queries",
    label: "Queries",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">{v as number}</span>,
  },
  {
    key: "cost_cents",
    label: "Est. Cost",
    align: "right",
    sortable: true,
    format: (v) => <span className="tabular-nums text-gray-600 dark:text-gray-400">${((v as number) / 100).toFixed(2)}</span>,
  },
  {
    key: "avg_cost",
    label: "Avg/Query",
    align: "right",
    sortable: false,
    format: (_, row) => {
      const q = row.queries as number;
      const c = row.cost_cents as number;
      return (
        <span className="tabular-nums text-gray-600 dark:text-gray-400">
          ${q > 0 ? (c / q / 100).toFixed(3) : "0.000"}
        </span>
      );
    },
  },
];

export function AgentUsageTable({
  agents,
}: {
  agents: { agent_id: string; queries: number; cost_cents: number }[];
}) {
  if (agents.length === 0) {
    return <p className="text-[12px] text-gray-400 px-4 py-3">No usage data yet</p>;
  }

  const rows: AgentRow[] = agents.map((a) => ({
    ...a,
    agent_name: a.agent_id === "hamilton" ? "Hamilton" : a.agent_id,
  }));

  return (
    <Suspense fallback={null}>
      <SortableTable
        columns={agentColumns}
        rows={rows}
        rowKey={(r) => r.agent_id as string}
        defaultSort="agent_name"
        defaultDir="asc"
        pageSize={20}
      />
    </Suspense>
  );
}

export function UserUsageTable({
  users,
}: {
  users: { user_id: number | string | null; username: string; queries: number; cost_cents: number }[];
}) {
  if (users.length === 0) {
    return <p className="text-[12px] text-gray-400 px-4 py-3">No usage data yet</p>;
  }

  return (
    <Suspense fallback={null}>
      <SortableTable
        columns={userColumns}
        rows={users as UserRow[]}
        rowKey={(r) => (r.user_id as string) ?? "public"}
        defaultSort="username"
        defaultDir="asc"
        pageSize={20}
      />
    </Suspense>
  );
}

export function DailyUsageTable({
  days,
}: {
  days: { date: string; queries: number; cost_cents: number }[];
}) {
  if (days.length === 0) {
    return <p className="text-[12px] text-gray-400 px-4 py-3">No usage data yet</p>;
  }

  return (
    <Suspense fallback={null}>
      <SortableTable
        columns={dayColumns}
        rows={days as DayRow[]}
        rowKey={(r) => r.date as string}
        defaultSort="date"
        defaultDir="desc"
      />
    </Suspense>
  );
}
