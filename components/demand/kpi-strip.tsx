"use client";

import { AlertOctagon, Boxes, PartyPopper, PiggyBank, TrendingDown } from "lucide-react";
import { KpiTile } from "@/components/ui/card";
import { activeFestivalName } from "@/lib/calendar";
import { FESTIVAL_SEGMENTS } from "@/lib/engine/heuristics";
import type { Savings } from "@/lib/store";
import type { Analysis, FestivalConfig } from "@/lib/types";
import { formatInrCompact, formatNumber } from "@/lib/utils";

export function KpiStrip({ analyses, festival, savings }: { analyses: Analysis[]; festival: FestivalConfig; savings: Savings }) {
  const critical = analyses.filter((a) => a.status === "critical").length;
  const overstock = analyses.filter((a) => a.status === "overstock").length;

  const pcts = FESTIVAL_SEGMENTS.map((s) => festival.uplift[s] ?? 0);
  const uniform = pcts.every((p) => p === pcts[0]);
  const upliftLabel = uniform ? `+${pcts[0]}%` : `+${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}% avg`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <KpiTile label="Total SKUs active" value={formatNumber(analyses.length)} hint="SAP + Zoho reconciled" icon={Boxes} tone="indigo" />
      <KpiTile label="Critical stockout risk" value={critical} hint="<6 wks standard · <3 wks perishable" icon={AlertOctagon} tone="rose" />
      <KpiTile label="Overstock risk" value={overstock} hint=">14 wks standard · >4 wks perishable" icon={TrendingDown} tone="rose" />
      <KpiTile
        label="Festival uplift"
        value={festival.active ? activeFestivalName() : "Inactive"}
        hint={festival.active ? `${upliftLabel} applied by category` : "No uplift applied to forecasts"}
        icon={PartyPopper}
        tone={festival.active ? "amber" : "neutral"}
      />
      <KpiTile
        label="Projected quarterly savings"
        value={formatInrCompact(savings.realised)}
        hint={`of ${formatInrCompact(savings.potential)} identified · grows as you approve`}
        icon={PiggyBank}
        tone="emerald"
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
}
