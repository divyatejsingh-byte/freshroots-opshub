"use client";

import { CalendarHeart, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { activeFestivalName, upcomingFestivals } from "@/lib/calendar";
import { FESTIVAL_SEGMENTS } from "@/lib/engine/heuristics";
import { useDemandStore } from "@/lib/store";
import type { Analysis } from "@/lib/types";
import { formatDate, isoDate } from "@/lib/utils";

const SEGMENT_LABEL: Record<string, string> = { Beverage: "Beverages", Snack: "Snacks", Staple: "Staples", "Dairy Alt": "Dairy alternatives", Condiment: "Condiments" };

export function FestivalCard({ analyses }: { analyses: Analysis[] }) {
  const festival = useDemandStore((s) => s.festival);
  const setActive = useDemandStore((s) => s.setFestivalActive);
  const setUplift = useDemandStore((s) => s.setUplift);
  const upcoming = useMemo(() => upcomingFestivals().slice(0, 4), []);
  const name = useMemo(() => activeFestivalName(), []);
  const affected = analyses.filter((a) => a.festivalUplift > 0).length;
  const lifted = analyses.filter((a) => a.festivalUplift > 0 && a.recommendedQty > 0).length;

  return (
    <Card className="overflow-hidden">
      {!festival.confirmed ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-rose-500/30 bg-rose-500/[0.07] px-4 py-3">
          <CalendarHeart className="h-4 w-4 shrink-0 text-rose-300" />
          <p className="min-w-0 flex-1 text-sm text-rose-200">
            <span className="font-medium">The calendar has no row for this month, so nothing is assumed.</span> Uplift is off. Turn the switch on or off to confirm your decision.
          </p>
        </div>
      ) : festival.active ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
          <p className="min-w-0 flex-1 text-sm text-amber-100/90">
            <span className="font-medium text-amber-200">{name} buffer applied.</span> Forecast demand is lifted for {affected} SKUs; {lifted} of them now
            carry a higher recommended order.
          </p>
          <Badge tone="amber" dot>
            Awaiting your review
          </Badge>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3">
          <CalendarHeart className="h-4 w-4 shrink-0 text-zinc-500" />
          <p className="text-sm text-zinc-400">Festival uplift is off. Orders follow baseline velocity until you enable the {name} buffer.</p>
        </div>
      )}

      <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-100">Festival calendar</h3>
            <span className="text-[11px] text-zinc-500">Dates indicative</span>
          </div>
          <ul className="mt-3 space-y-2">
            {upcoming.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-zinc-200">
                    {f.name} <span className="font-normal text-zinc-500">· {formatDate(f.date)}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    Order by {formatDate(isoDate(f.orderBy))} ({f.leadWeeks} wk lead) · {f.segments.join(", ")}
                  </p>
                </div>
                {f.windowOpen ? (
                  <Badge tone="amber" dot>
                    Window open
                  </Badge>
                ) : (
                  <Badge>in {f.daysAway}d</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Category uplift</h3>
              <p className="text-xs text-zinc-500">Auto-applied in October, November and March</p>
            </div>
            <Switch
              label="Apply festival uplift"
              checked={festival.active}
              onChange={(v) => {
                setActive(v);
                toast.info(v ? `${name} uplift applied` : "Festival uplift removed", v ? "Recommended quantities recalculated." : "Recommendations back on baseline velocity.");
              }}
            />
          </div>
          <div className="mt-4 space-y-4">
            {FESTIVAL_SEGMENTS.map((seg) => {
              const pct = festival.uplift[seg] ?? 0;
              return (
                <div key={seg} className={festival.active ? "" : "opacity-50"}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-300">{SEGMENT_LABEL[seg]}</span>
                    <span className="tabular-nums text-amber-300">+{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={1}
                    value={pct}
                    disabled={!festival.active}
                    onChange={(e) => setUplift(seg, Number(e.target.value))}
                    aria-label={`${SEGMENT_LABEL[seg]} uplift percent`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
