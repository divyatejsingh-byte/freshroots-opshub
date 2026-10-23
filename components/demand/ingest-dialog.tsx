"use client";

import { CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlay";
import { toast } from "@/components/ui/toast";
import { checkSchema } from "@/lib/csv";
import { useDemandStore } from "@/lib/store";
import { cn, downloadFile, toCsv } from "@/lib/utils";

type Source = "SAP Sales Export" | "Zoho Inventory POs";

const SCHEMAS: Record<Source, { required: string[]; optional: string[]; description: string }> = {
  "SAP Sales Export": {
    required: ["sku_id", "sales_4w_avg", "sales_12w_avg"],
    optional: ["stock_on_hand"],
    description: "Weekly average units sold per SKU, 4-week and 12-week",
  },
  "Zoho Inventory POs": {
    required: ["sku_id", "open_po_qty"],
    optional: [],
    description: "Open and in-transit purchase order quantity per SKU",
  },
};

interface Result {
  fileName: string;
  ok: boolean;
  missing: string[];
  rowCount: number;
  unknown: number;
  patches: { skuId: string; stock?: number; sales4w?: number; sales12w?: number; openPO?: number }[];
}

export function IngestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const skus = useDemandStore((s) => s.skus);
  const applyIngest = useDemandStore((s) => s.applyIngest);
  const [results, setResults] = useState<Partial<Record<Source, Result>>>({});

  const handleFile = async (source: Source, file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      setResults((r) => ({ ...r, [source]: { fileName: file.name, ok: false, missing: ["CSV format (export the sheet as .csv)"], rowCount: 0, unknown: 0, patches: [] } }));
      return;
    }
    const check = checkSchema(await file.text(), SCHEMAS[source].required);
    const known = new Set(skus.map((s) => s.id));
    const num = (v: string | undefined) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? undefined : Math.max(0, Number(v)));

    const patches = check.ok
      ? check.rows
          .filter((r) => known.has(r.sku_id))
          .map((r) =>
            source === "SAP Sales Export"
              ? { skuId: r.sku_id, sales4w: num(r.sales_4w_avg), sales12w: num(r.sales_12w_avg), stock: num(r.stock_on_hand) }
              : { skuId: r.sku_id, openPO: num(r.open_po_qty) }
          )
      : [];
    setResults((r) => ({
      ...r,
      [source]: { fileName: file.name, ok: check.ok, missing: check.missing, rowCount: check.rows.length, unknown: check.rows.length - patches.length, patches },
    }));
  };

  const apply = (source: Source) => {
    const res = results[source];
    if (!res?.ok) return;
    const matched = applyIngest(source, res.fileName, res.patches);
    toast.success(`${source} loaded`, `${matched} SKUs updated. Recommendations recalculated.`);
    setResults((r) => ({ ...r, [source]: undefined }));
  };

  const template = (source: Source) => {
    const sample = skus.slice(0, 5);
    const rows =
      source === "SAP Sales Export"
        ? [["sku_id", "sales_4w_avg", "sales_12w_avg", "stock_on_hand"], ...sample.map((s) => [s.id, s.sales4w, s.sales12w, s.stock])]
        : [["sku_id", "open_po_qty"], ...sample.map((s) => [s.id, s.openPO])];
    downloadFile(`${source.toLowerCase().replace(/\s+/g, "-")}-template.csv`, toCsv(rows));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ingest source files"
      description="Drop the latest SAP and Zoho exports. Headers are verified before anything touches the workspace."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {(Object.keys(SCHEMAS) as Source[]).map((source) => (
          <DropZone
            key={source}
            source={source}
            schema={SCHEMAS[source]}
            result={results[source]}
            onFile={(f) => handleFile(source, f)}
            onApply={() => apply(source)}
            onTemplate={() => template(source)}
          />
        ))}
      </div>
    </Dialog>
  );
}

function DropZone({
  source,
  schema,
  result,
  onFile,
  onApply,
  onTemplate,
}: {
  source: Source;
  schema: (typeof SCHEMAS)[Source];
  result?: Result;
  onFile: (f: File) => void;
  onApply: () => void;
  onTemplate: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-100">{source}</p>
          <p className="text-xs text-zinc-500">{schema.description}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onTemplate}>
          <Download className="h-3.5 w-3.5" />
          Template
        </Button>
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          over ? "border-indigo-400 bg-indigo-500/10" : "border-zinc-700 bg-zinc-900/40 hover:border-zinc-600"
        )}
      >
        <UploadCloud className="h-5 w-5 text-zinc-500" />
        <p className="text-sm text-zinc-300">Drag a CSV here or click to browse</p>
        <p className="font-mono text-[11px] text-zinc-500">
          {schema.required.join(", ")}
          {schema.optional.length > 0 && <span className="text-zinc-600"> (+ {schema.optional.join(", ")})</span>}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {result && (
        <div
          className={cn(
            "mt-2 flex items-start gap-3 rounded-lg border px-3 py-2.5",
            result.ok ? "border-emerald-500/30 bg-emerald-500/[0.07]" : "border-rose-500/30 bg-rose-500/[0.07]"
          )}
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
          <div className="min-w-0 flex-1 text-sm">
            <p className="flex items-center gap-1.5 truncate font-medium text-zinc-100">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              {result.fileName}
            </p>
            {result.ok ? (
              <p className="text-xs text-zinc-400">
                Schema valid · {result.rowCount} rows · {result.patches.length} match known SKUs
                {result.unknown > 0 && <span className="text-amber-300"> · {result.unknown} unknown SKU IDs skipped</span>}
              </p>
            ) : (
              <p className="text-xs text-rose-300">Missing required: {result.missing.join(", ")}</p>
            )}
          </div>
          {result.ok && (
            <Button size="sm" variant="primary" disabled={result.patches.length === 0} onClick={onApply}>
              Apply
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
