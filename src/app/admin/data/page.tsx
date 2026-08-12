import Link from "next/link";
import {
  BarChart3,
  Building2,
  Database,
  Landmark,
  ListTree,
  Map,
  Search,
} from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { requireAuth } from "@/lib/auth";
import { DataOperations } from "./data-operations";

export const dynamic = "force-dynamic";

const DESTINATIONS = [
  { href: "/admin/institutions", label: "Institutions", detail: "Search institutions and open the canonical institution record.", icon: Building2 },
  { href: "/admin/index", label: "National index", detail: "Published national fee benchmarks by category.", icon: Landmark },
  { href: "/admin/market", label: "Market", detail: "Filter fee benchmarks by institution and market attributes.", icon: BarChart3 },
  { href: "/admin/peers", label: "Peer analysis", detail: "Compare institutions and saved peer groups.", icon: Search },
  { href: "/admin/fees/catalog", label: "Fee categories", detail: "Browse the canonical taxonomy and category distributions.", icon: ListTree },
  { href: "/admin/districts", label: "Federal Reserve districts", detail: "Review district-level fee and economic context.", icon: Map },
  { href: "/admin/query", label: "Data explorer", detail: "Run controlled administrative data queries.", icon: Database },
] as const;

export default async function DataPage() {
  await requireAuth("view");
  return (
    <div className="space-y-8">
      <header>
        <Breadcrumbs items={[{ label: "Atlas", href: "/admin" }, { label: "Data" }]} />
        <p className="admin-eyebrow mt-3">Workspace · Publish + explore</p>
        <h1 className="admin-display-title mt-1">Data</h1>
        <p className="admin-lede mt-2">Start institution enhancement, then inspect institutional, benchmark, taxonomy, and market views.</p>
      </header>

      <DataOperations />

      <div className="divide-y divide-black/[0.06] border-y border-black/[0.06] dark:divide-white/[0.06] dark:border-white/[0.06]">
        {DESTINATIONS.map((destination) => {
          const Icon = destination.icon;
          return (
            <Link key={destination.href} href={destination.href} className="group grid gap-3 py-5 transition-colors hover:bg-black/[0.015] sm:grid-cols-[2fr_3fr] sm:items-center dark:hover:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-gray-400 transition-colors group-hover:text-[var(--brand-primary)]" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{destination.label}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{destination.detail}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
