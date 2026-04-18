import { Breadcrumbs } from "@/components/breadcrumbs";
import { AgentTabs } from "./agent-tabs";

export const dynamic = "force-dynamic";

/**
 * /admin/agents — fused agent console (D-13).
 *
 * Layout: breadcrumbs + sticky nav bar (Overview / Lineage / Messages / Replay)
 * linking sibling routes. The nav is a client component in `./agent-tabs`
 * implemented as a semantic <nav> with <Link> children + aria-current="page"
 * (these are 4 routes, not single-page tab panels). Each route's own page.tsx
 * remains a server component responsible for data fetching.
 */
export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs
        items={[{ label: "Admin", href: "/admin" }, { label: "Agents" }]}
      />
      <header className="admin-card p-4">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Agents
        </h1>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
          Debug console for the v10.0 agent team (Hamilton, Knox, Darwin, Atlas + 51 state agents).
          Answers four questions: <strong className="text-gray-700 dark:text-gray-300">how healthy are the agents</strong> (Overview),
          <strong className="text-gray-700 dark:text-gray-300"> where did this number come from</strong> (Lineage),
          <strong className="text-gray-700 dark:text-gray-300"> what are the agents arguing about</strong> (Messages), and
          <strong className="text-gray-700 dark:text-gray-300"> exactly what did the agent do at 14:32</strong> (Replay).
          All four tabs are read-only — no re-execute buttons anywhere.
        </p>
      </header>
      <AgentTabs />
      <div>{children}</div>
    </div>
  );
}
