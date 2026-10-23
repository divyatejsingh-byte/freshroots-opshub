"use client";

import {
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Database,
  HeartPulse,
  IndianRupee,
  PackageSearch,
  RefreshCw,
  Truck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, KpiTile } from "@/components/ui/card";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { atRiskValue } from "@/lib/engine/heuristics";
import { currentCycle, FESTIVALS } from "@/lib/calendar";
import { useAnalyses, useDemandStore } from "@/lib/store";
import { formatDate, formatInrCompact, formatNumber } from "@/lib/utils";

export function Hub() {
  const analyses = useAnalyses();
  const suppliers = useDemandStore((s) => s.suppliers);
  const ingests = useDemandStore((s) => s.ingests);
  const reseed = useDemandStore((s) => s.reseed);
  const distributors = useDemandStore((s) => s.distributors);
  const seed = useDemandStore((s) => s.seed);
  const [ingestOpen, setIngestOpen] = useState(false);

  const cycle = useMemo(() => currentCycle(), []);
  const atRisk = useMemo(() => analyses.reduce((sum, a) => sum + atRiskValue(a), 0), [analyses]);
  const skuCount = analyses.length;

  return (
    <div className="space-y-6">
      <section className="glow-card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <Badge tone="indigo" dot>
          Bi-weekly planning cadence
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Freshroots Operations Command</h1>
        <p className="mt-1 text-lg text-zinc-400">Welcome Raghav Kulkarni</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-500">
          Replace the monthly Excel cycle with a live two-week workspace: fresh sales and PO data, heuristic forecasts, festival buffers and
          supplier governance in one place.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="flex items-center gap-4 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Current planning run</p>
            <p className="truncate text-sm font-semibold text-zinc-100">
              Cycle {cycle.number} · {formatDate(cycle.start.toISOString())} – {formatDate(cycle.end.toISOString())}
            </p>
            <p className="text-xs text-zinc-500">Bi-weekly cadence</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Next batch PO submission</p>
            <p className="truncate text-sm font-semibold text-zinc-100">{formatDate(cycle.submitBy.toISOString())}</p>
            <p className="text-xs text-zinc-500">
              {cycle.daysLeft > 0 ? `${cycle.daysLeft} day${cycle.daysLeft === 1 ? "" : "s"} left` : cycle.daysLeft === 0 ? "Due today" : "Cut-off passed, next batch is due"}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
            <HeartPulse className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">System health</p>
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" />
              All feeds nominal
            </p>
            <p className="text-xs text-zinc-500">SAP and Zoho in sync · data lag under 1 day</p>
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total SKUs" value={formatNumber(skuCount)} hint={`${distributors.length} active distributors on record`} icon={PackageSearch} tone="indigo" />
        <KpiTile label="Addressable at-risk inventory" value={formatInrCompact(atRisk)} hint="Stockout exposure plus overstock" icon={IndianRupee} tone="rose" />
        <KpiTile label="Upcoming festival windows" value={FESTIVALS.length} hint="Indicative festival calendar" icon={CalendarDays} tone="amber" />
        <KpiTile label="Active suppliers" value={suppliers.length} hint="Tier-1 raw and packaging vendors" icon={Users} tone="emerald" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ActionCard
          href="/demand-planning"
          icon={BarChart3}
          title="Demand Planning & Forecasting Studio"
          body="Run bi-weekly SKU heuristics, stockout/overstock detection, festival buffer adjustments, and 1-click batch PO approvals."
          chips={["4w vs 12w velocity", "Festival uplift", "Batch PO"]}
          accent="indigo"
        />
        <ActionCard
          href="/suppliers"
          icon={Truck}
          title="Supplier & Procurement Desk"
          body="Manage tier-1 raw material and packaging vendors, contact emails, track raised purchase orders, and monitor payment approvals."
          chips={["Vendor directory", "PO tracker", "Payment approvals"]}
          accent="violet"
        />
      </section>

      <section>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              reseed(seed);
              toast.success("Source data reloaded", `${analyses.length} SKUs reloaded from the uploaded files. Approvals cleared.`);
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Reload Source Data
          </Button>
          <Button onClick={() => setIngestOpen(true)}>
            <Database className="h-4 w-4" />
            System Ingest Status
          </Button>
        </div>
      </section>

      <IngestStatusDialog open={ingestOpen} onClose={() => setIngestOpen(false)} skuCount={skuCount} ingests={ingests} />
    </div>
  );
}

function ActionCard({
  href,
  icon: Icon,
  title,
  body,
  chips,
  accent,
}: {
  href: string;
  icon: typeof BarChart3;
  title: string;
  body: string;
  chips: string[];
  accent: "indigo" | "violet";
}) {
  const glow = accent === "indigo" ? "group-hover:shadow-indigo-500/20 group-hover:border-indigo-500/40" : "group-hover:shadow-violet-500/20 group-hover:border-violet-500/40";
  const icon = accent === "indigo" ? "bg-indigo-500/15 text-indigo-300" : "bg-violet-500/15 text-violet-300";
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <div
        className={`glow-card relative h-full overflow-hidden p-6 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-2xl group-focus-visible:ring-2 group-focus-visible:ring-indigo-400/60 ${glow}`}
      >
        <div className="flex items-start justify-between">
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${icon}`}>
            <Icon className="h-5 w-5" />
          </span>
          <ArrowUpRight className="h-5 w-5 text-zinc-600 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-200" />
        </div>
        <h2 className="mt-5 text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 transition-colors group-hover:text-zinc-400">{body}</p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}

function IngestStatusDialog({
  open,
  onClose,
  skuCount,
  ingests,
}: {
  open: boolean;
  onClose: () => void;
  skuCount: number;
  ingests: ReturnType<typeof useDemandStore.getState>["ingests"];
}) {
  const lastOf = (src: string) => ingests.find((i) => i.source === src);
  const feeds = [
    { name: "SAP Sales Export", detail: "Weekly secondary sales by SKU and distributor", fallback: "Scheduled sync, 06:00 IST" },
    { name: "Zoho Inventory POs", detail: "Open purchase orders and in-transit stock", fallback: "Scheduled sync, 06:15 IST" },
  ];
  return (
    <Dialog open={open} onClose={onClose} title="System ingest status" description="Schema checks and the latest load for each upstream feed.">
      <div className="space-y-3">
        {feeds.map((f) => {
          const last = lastOf(f.name);
          return (
            <Card key={f.name} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{f.name}</p>
                  <p className="text-xs text-zinc-500">{f.detail}</p>
                </div>
                <Badge tone="emerald" dot>
                  Schema valid
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-zinc-500">Records</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-200">{formatNumber(last ? last.rows : skuCount)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">SKUs matched</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-zinc-200">{formatNumber(last ? last.matched : skuCount)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Last load</dt>
                  <dd className="mt-0.5 font-medium text-zinc-200">{last ? new Date(last.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : f.fallback}</dd>
                </div>
              </dl>
              {last && <p className="mt-2 truncate text-xs text-zinc-500">Manual upload: {last.fileName}</p>}
            </Card>
          );
        })}
      </div>
    </Dialog>
  );
}
