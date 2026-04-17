import { Breadcrumbs } from "@/components/breadcrumbs";
import { AgentTabs } from "./agent-tabs";

export const dynamic = "force-dynamic";

/**
 * /admin/agents — fused agent console (D-13).
 *
 * Layout: breadcrumbs + sticky tab bar (Overview / Lineage / Messages / Replay)
 * that navigate between sibling routes. The tab bar is a client component in
 * `./agent-tabs` which uses Radix Tabs (`@radix-ui/react-tabs`) semantics for
 * aria-selected/role=tab while Next Link handles route navigation. Each tab's
 * own page.tsx remains a server component responsible for data fetching.
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
      <header>
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Agents
        </h1>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
          Debug console — why did the agent do that, and where did this number come from?
        </p>
      </header>
      <AgentTabs />
      <div>{children}</div>
    </div>
  );
}
