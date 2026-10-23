"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardEdit, Undo2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, KpiTile } from "@/components/ui/card";
import { Input } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { fixKey, KNOWN_CATEGORIES, summarizeGaps } from "@/lib/data/quality";
import { useDemandStore, useGlobalGaps, type FixInput } from "@/lib/store";
import type { DataGap, FixField, Sku } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type Kind = "number" | "supplier" | "perishable" | "category" | "distributor";

const COLUMNS: { field: FixField; label: string; kind: Kind }[] = [
  { field: "openPO", label: "Open POs (units)", kind: "number" },
  { field: "unitCost", label: "Unit cost ₹", kind: "number" },
  { field: "unitPrice", label: "Unit price ₹", kind: "number" },
  { field: "supplierId", label: "Supplier", kind: "supplier" },
  { field: "stock", label: "Stock on hand", kind: "number" },
  { field: "caseSize", label: "Reorder qty", kind: "number" },
  { field: "perishable", label: "Perishability", kind: "perishable" },
  { field: "category", label: "Category", kind: "category" },
  { field: "distributorId", label: "Distributor", kind: "distributor" },
];

const NUMERIC: FixField[] = ["openPO", "unitCost", "unitPrice", "stock", "caseSize", "avg4w", "avg12w"];

function resolvedValue(sku: Sku, field: FixField): string {
  switch (field) {
    case "openPO": return String(sku.openPO);
    case "unitCost": return String(sku.unitCost);
    case "unitPrice": return String(sku.unitPrice);
    case "stock": return String(sku.stock);
    case "caseSize": return String(sku.caseSize);
    case "perishable": return sku.perishable ? "high" : "low";
    case "category": return sku.category;
    case "supplierId": return sku.supplierId;
    case "distributorId": return sku.distributorId;
    default: return "";
  }
}

export function DataGaps() {
  const skus = useDemandStore((s) => s.skus);
  const suppliers = useDemandStore((s) => s.suppliers);
  const distributors = useDemandStore((s) => s.distributors);
  const fixes = useDemandStore((s) => s.fixes);
  const meta = useDemandStore((s) => s.meta);
  const applyFixes = useDemandStore((s) => s.applyFixes);
  const removeFix = useDemandStore((s) => s.removeFix);
  const globals = useGlobalGaps();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [focusSku, setFocusSku] = useState<string | null>(null);

  const summary = useMemo(() => summarizeGaps(skus), [skus]);
  const rows = useMemo(() => (showAll ? skus : skus.filter((s) => s.gaps.length > 0)), [skus, showAll]);

  // Arriving from the Studio with ?sku=ID opens and scrolls to that SKU
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sku");
    if (!id) return;
    setShowAll(true);
    setFocusSku(id);
    setOpen(id);
    setTimeout(() => document.getElementById(`sku-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  }, []);

  const stage = (skuId: string, field: FixField, value: string) => setDrafts((d) => ({ ...d, [fixKey(skuId, field)]: value }));
  const unstage = (skuId: string, field: FixField) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[fixKey(skuId, field)];
      return next;
    });

  const staged = Object.entries(drafts).filter(([, v]) => v !== "");

  const save = () => {
    if (note.trim().length < 3) return toast.warning("Add a reason first", "Every change needs a short note saying where the value came from.");
    const inputs: FixInput[] = [];
    for (const [key, raw] of staged) {
      const [skuId, field] = key.split("|") as [string, FixField];
      let value: number | string | boolean;
      if (field.startsWith("sales:")) {
        if (raw === "exclude") value = "exclude";
        else {
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return toast.warning("Check the numbers", `${skuId} ${field}: enter 0 or more.`);
          value = n;
        }
      } else if (field === "perishable") value = raw === "high";
      else if (NUMERIC.includes(field)) {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || (field === "caseSize" && n === 0)) return toast.warning("Check the numbers", `${skuId} ${field}: enter a valid amount.`);
        value = n;
      } else value = raw;
      inputs.push({ skuId, field, value });
    }
    applyFixes(inputs, note.trim());
    setDrafts({});
    setNote("");
    toast.success(`${inputs.length} value${inputs.length === 1 ? "" : "s"} saved`, "The reason is recorded with each change.");
  };

  const stageAllOpenPoZero = () => {
    const targets = skus.filter((s) => s.gaps.some((g) => g.field === "openPO"));
    setDrafts((d) => ({ ...d, ...Object.fromEntries(targets.map((s) => [fixKey(s.id, "openPO"), "0"])) }));
    toast.info(`${targets.length} SKUs staged as "no open POs"`, "Add the reason and save to confirm. You are stating this is true.");
  };

  const gapOf = (sku: Sku, field: FixField): DataGap | undefined => sku.gaps.find((g) => g.field === field);
  const hasOpenPoGaps = skus.some((s) => s.gaps.some((g) => g.field === "openPO"));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Data Gaps</h1>
        <p className="text-sm text-zinc-500">
          Nothing is assumed. Where a value is missing the SKU stays on hold until you supply or confirm it. Every change is saved with your reason.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="SKUs on hold" value={`${summary.blockedSkus} / ${skus.length}`} hint="Cannot be approved yet" icon={AlertTriangle} tone={summary.blockedSkus ? "amber" : "emerald"} />
        <KpiTile label="Missing items" value={summary.totalGaps} hint="Across all SKUs" icon={ClipboardEdit} tone={summary.totalGaps ? "rose" : "emerald"} />
        <KpiTile label="Saved fixes" value={Object.keys(fixes).length} hint="With reasons on record" icon={CheckCircle2} tone="indigo" />
        <KpiTile label="Source data" value={meta.source === "supabase" ? "Supabase" : "CSV files"} hint={`Stock as of ${meta.stockAsOf || "unknown"} · sales to ${meta.salesToWeek || "unknown"}`} icon={ClipboardEdit} tone="neutral" />
      </div>

      {globals.length > 0 && (
        <div className="space-y-2">
          {globals.map((g) => (
            <div key={g.id} className={cn("flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm", g.severity === "blocking" ? "border-rose-500/30 bg-rose-500/[0.07] text-rose-200" : "border-amber-500/30 bg-amber-500/[0.07] text-amber-200")}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{g.label}</p>
                <p className="text-xs opacity-80">{g.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {summary.byLabel.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.byLabel.map((g) => (
            <Badge key={g.label} tone="amber">
              {g.label}: {g.count}
            </Badge>
          ))}
        </div>
      )}

      <Card className="sticky top-14 z-20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-[260px] flex-1" placeholder="Reason / source for these changes (required), e.g. Confirmed with Pune warehouse, 23 Oct" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="primary" disabled={!staged.length} onClick={save}>
            Save {staged.length || ""} change{staged.length === 1 ? "" : "s"}
          </Button>
          <Button variant="ghost" disabled={!staged.length} onClick={() => setDrafts({})}>
            Discard
          </Button>
          {hasOpenPoGaps && (
            <Button onClick={stageAllOpenPoZero} title="Stages 0 open POs for every SKU still unconfirmed. Only use this if it is true.">
              Stage "no open POs" for all
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" className="accent-indigo-500" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show SKUs without gaps
          </label>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            No data gaps. Every SKU has complete data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] border-collapse">
              <thead className="border-b border-zinc-800 bg-zinc-900/50">
                <tr>
                  <th className="th w-8" />
                  <th className="th">SKU</th>
                  {COLUMNS.map((c) => (
                    <th key={c.field} className="th">
                      {c.label}
                    </th>
                  ))}
                  <th className="th">Sales weeks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {rows.map((sku) => {
                  const salesGaps = sku.gaps.filter((g) => g.field.startsWith("sales:"));
                  const expanded = open === sku.id;
                  return (
                    <Fragment key={sku.id}>
                      <tr id={`sku-${sku.id}`} className={cn("align-top", focusSku === sku.id && "bg-indigo-500/[0.07]")}>
                        <td className="td">
                          {salesGaps.length > 0 && (
                            <button aria-label="Show missing sales weeks" onClick={() => setOpen(expanded ? null : sku.id)} className="text-zinc-500 hover:text-zinc-200">
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                        <td className="td max-w-[220px]">
                          <p className="truncate font-medium text-zinc-100" title={sku.name}>
                            {sku.name}
                          </p>
                          <p className="font-mono text-[11px] text-zinc-600">{sku.id}</p>
                        </td>
                        {COLUMNS.map((c) => {
                          const g = gapOf(sku, c.field);
                          const key = fixKey(sku.id, c.field);
                          const fix = fixes[key];
                          const draft = drafts[key];
                          const value = draft ?? (g && g.severity !== "warning" ? "" : resolvedValue(sku, c.field));
                          return (
                            <td key={c.field} className="td">
                              <div className="flex items-center gap-1">
                                <Cell
                                  kind={c.kind}
                                  value={value}
                                  missing={!!g && g.severity !== "warning" && draft === undefined}
                                  warn={g?.severity === "warning" && draft === undefined}
                                  staged={draft !== undefined}
                                  suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                                  distributors={distributors.map((d) => ({ id: d.id, name: d.name }))}
                                  onChange={(v) => (v === "" ? unstage(sku.id, c.field) : stage(sku.id, c.field, v))}
                                  label={`${c.label} for ${sku.name}`}
                                />
                                {g?.severity === "warning" && draft === undefined && (
                                  <Button size="sm" variant="ghost" title={g.detail} onClick={() => stage(sku.id, c.field, resolvedValue(sku, c.field))}>
                                    Confirm
                                  </Button>
                                )}
                                {fix && (
                                  <button title={`${fix.source === "import" ? "Imported" : "Entered"} ${formatDate(fix.at)}: ${fix.note}. Click to undo.`} onClick={() => removeFix(sku.id, c.field)} className="text-zinc-500 hover:text-amber-300">
                                    <Undo2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              {g && <p className={cn("mt-0.5 max-w-[150px] text-[10px]", g.severity === "warning" ? "text-amber-400" : "text-rose-400")}>{g.label}</p>}
                            </td>
                          );
                        })}
                        <td className="td">
                          {salesGaps.length ? (
                            <Badge tone="rose">{salesGaps.length} missing</Badge>
                          ) : (
                            <Badge tone="emerald">Complete</Badge>
                          )}
                        </td>
                      </tr>
                      {expanded && salesGaps.length > 0 && (
                        <tr className="bg-zinc-900/40">
                          <td />
                          <td colSpan={COLUMNS.length + 2} className="px-3 py-3">
                            <p className="mb-2 text-xs text-zinc-400">
                              Sales are missing for these weeks. Enter the units, confirm the week really had zero sales, or exclude it so the averages use only the weeks you have.
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {salesGaps.map((g) => {
                                const key = fixKey(sku.id, g.field);
                                const d = drafts[key];
                                return (
                                  <div key={g.field} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-2 py-1.5">
                                    <span className="w-20 shrink-0 font-mono text-xs text-zinc-300">{g.field.slice(6)}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      className="h-7 w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-right text-sm tabular-nums text-zinc-100 focus:border-indigo-500/60 focus:outline-none"
                                      placeholder="units"
                                      aria-label={`Units sold in ${g.field.slice(6)} for ${sku.name}`}
                                      value={d && d !== "exclude" ? d : ""}
                                      onChange={(e) => (e.target.value === "" ? unstage(sku.id, g.field) : stage(sku.id, g.field, e.target.value))}
                                    />
                                    <Button size="sm" variant={d === "0" ? "primary" : "ghost"} onClick={() => stage(sku.id, g.field, "0")}>
                                      Zero
                                    </Button>
                                    <Button size="sm" variant={d === "exclude" ? "primary" : "ghost"} onClick={() => stage(sku.id, g.field, "exclude")}>
                                      Exclude
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {Object.keys(fixes).length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-medium text-zinc-100">Change log</h2>
          <ul className="divide-y divide-zinc-800/70 text-sm">
            {Object.values(fixes)
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 30)
              .map((f) => (
                <li key={fixKey(f.skuId, f.field)} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-xs text-zinc-500">{f.skuId}</span>
                  <span className="text-zinc-300">{f.field.startsWith("sales:") ? `Sales ${f.field.slice(6)}` : f.field}</span>
                  <span className="font-medium text-zinc-100">{String(f.value)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">“{f.note}”</span>
                  <Badge tone={f.source === "import" ? "violet" : "indigo"}>{f.source}</Badge>
                  <span className="text-xs text-zinc-600">{formatDate(f.at)}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Cell({
  kind,
  value,
  missing,
  warn,
  staged,
  suppliers,
  distributors,
  onChange,
  label,
}: {
  kind: Kind;
  value: string;
  missing: boolean;
  warn: boolean;
  staged: boolean;
  suppliers: { id: string; name: string }[];
  distributors: { id: string; name: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  const tone = staged
    ? "border-indigo-400/60 bg-indigo-500/10"
    : missing
      ? "border-rose-500/50 bg-rose-500/[0.06]"
      : warn
        ? "border-amber-500/50 bg-amber-500/[0.06]"
        : "border-zinc-800 bg-zinc-900";
  const cls = cn("h-8 w-full min-w-[96px] rounded-md border px-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20", tone);

  if (kind === "number")
    return <input type="number" min={0} className={cn(cls, "text-right tabular-nums")} aria-label={label} placeholder="missing" value={value} onChange={(e) => onChange(e.target.value)} />;

  const options: { v: string; t: string }[] =
    kind === "supplier"
      ? suppliers.map((s) => ({ v: s.id, t: s.name }))
      : kind === "distributor"
        ? distributors.map((d) => ({ v: d.id, t: d.name }))
        : kind === "category"
          ? KNOWN_CATEGORIES.map((c) => ({ v: c, t: c }))
          : [{ v: "low", t: "Low" }, { v: "high", t: "High" }];
  return (
    <select className={cls} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{missing ? "Choose…" : "—"}</option>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </select>
  );
}

