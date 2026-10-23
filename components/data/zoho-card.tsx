"use client";

import { AlertTriangle, CheckCircle2, CloudDownload, PlugZap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { fixKey } from "@/lib/data/quality";
import { useDemandStore, type FixInput } from "@/lib/store";
import type { FixField } from "@/lib/types";
import type { ZohoSnapshot, ZohoStatus } from "@/lib/zoho/types";

interface Report {
  snapshot: ZohoSnapshot;
  imported: Record<string, number>;
  keptManual: string[];
}

const FIELDS: { field: FixField; key: "stock" | "unitCost" | "unitPrice" | "openPO"; label: string }[] = [
  { field: "stock", key: "stock", label: "stock on hand" },
  { field: "unitCost", key: "unitCost", label: "unit cost" },
  { field: "unitPrice", key: "unitPrice", label: "unit price" },
  { field: "openPO", key: "openPO", label: "open POs" },
];

export function ZohoCard() {
  const fixes = useDemandStore((s) => s.fixes);
  const applyFixes = useDemandStore((s) => s.applyFixes);
  const [status, setStatus] = useState<ZohoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus((await (await fetch("/api/zoho/status", { cache: "no-store" })).json()) as ZohoStatus);
    } catch {
      setStatus({ configured: true, connected: false, error: "Could not reach the server" });
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const sync = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/zoho/sync", { method: "POST" });
      const json = (await res.json()) as ZohoSnapshot & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Sync failed (${res.status})`);

      // Zoho is the system of record, but a value a person typed is never overwritten behind their back
      const inputs: FixInput[] = [];
      const imported: Record<string, number> = {};
      const keptManual: string[] = [];
      for (const row of json.matched) {
        for (const f of FIELDS) {
          const value = row[f.key];
          if (value === null) continue;
          if (fixes[fixKey(row.skuId, f.field)]?.source === "planner") {
            keptManual.push(`${row.skuId} ${f.label}`);
            continue;
          }
          inputs.push({ skuId: row.skuId, field: f.field, value });
          imported[f.label] = (imported[f.label] ?? 0) + 1;
        }
      }
      if (inputs.length) applyFixes(inputs, `Synced from Zoho Inventory (org ${json.orgId}) on ${new Date(json.fetchedAt).toLocaleString("en-IN")}`, "zoho");
      setReport({ snapshot: json, imported, keptManual });
      toast.success("Zoho sync complete", `${inputs.length} values imported for ${json.matched.length} SKUs.`);
    } catch (err) {
      toast.warning("Zoho sync failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const ready = status?.configured && status.connected;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <PlugZap className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">Zoho Inventory</p>
          <p className="text-xs text-zinc-500">System of record for stock, cost, price and open POs. Values synced from Zoho fill the gaps; anything you typed is kept.</p>
        </div>
        {!status ? (
          <Badge>Checking…</Badge>
        ) : !status.configured ? (
          <Badge tone="amber" dot>
            Not connected
          </Badge>
        ) : status.connected ? (
          <Badge tone="emerald" dot>
            Connected · {status.orgName}
          </Badge>
        ) : (
          <Badge tone="rose" dot>
            Connection problem
          </Badge>
        )}
        <Button variant="primary" disabled={!ready || busy} onClick={sync}>
          <CloudDownload className="h-4 w-4" />
          {busy ? "Syncing…" : "Sync from Zoho"}
        </Button>
      </div>

      {status && !status.configured && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-400">
          <p className="font-medium text-zinc-200">To connect, add these environment variables (in <code>.env.local</code> locally, and in Vercel):</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300">{status.missing?.join(", ")}</p>
          <p className="mt-1">Plus <code>ZOHO_DC</code> (your data centre suffix: in, com, eu, com.au, jp, ca or sa). Setup steps are in the README.</p>
        </div>
      )}
      {status?.configured && !status.connected && (
        <p className="mt-3 flex items-start gap-2 text-xs text-rose-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {status.error}
        </p>
      )}

      {report && (
        <div className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-300">
          <p className="flex items-center gap-1.5 font-medium text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {report.snapshot.matched.length} of {report.snapshot.matched.length + report.snapshot.missingInZoho.length} SKUs matched in Zoho by SKU code · {report.snapshot.zohoItemsTotal} items in Zoho ·{" "}
            {report.snapshot.purchaseOrdersCounted} open purchase orders read
          </p>
          {Object.keys(report.imported).length > 0 && (
            <p>
              Imported: {Object.entries(report.imported).map(([k, n]) => `${k} (${n})`).join(", ")}.
            </p>
          )}
          {report.keptManual.length > 0 && <p className="text-amber-300">Kept your manual values, not overwritten: {report.keptManual.join("; ")}.</p>}
          {report.snapshot.missingInZoho.length > 0 && (
            <p className="text-amber-300">
              Not found in Zoho (no item with this exact SKU code, nothing guessed): {report.snapshot.missingInZoho.join(", ")}. Add the SKU code to the item in Zoho, or fill the gaps by hand.
            </p>
          )}
          {report.snapshot.warnings.map((w) => (
            <p key={w} className="text-amber-300">
              {w}
            </p>
          ))}
          <p className="text-zinc-500">Supplier and anything Zoho left blank stay as gaps for you to resolve below.</p>
        </div>
      )}
    </Card>
  );
}
