"use client";

import { Search } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors hover:border-zinc-700 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
        className
      )}
      {...props}
    />
  );
});

export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
      <Input className="pl-8" {...props} />
    </div>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 text-sm text-zinc-200 transition-colors hover:border-zinc-700 focus:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
        className
      )}
      {...props}
    />
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-zinc-800 pb-px", className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3 py-2 text-[13px] font-medium transition-colors",
              active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                  active ? "bg-indigo-500/20 text-indigo-300" : "bg-zinc-800 text-zinc-400"
                )}
              >
                {t.count}
              </span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-400" />}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
        checked ? "border-indigo-400/60 bg-indigo-500" : "border-zinc-700 bg-zinc-800"
      )}
    >
      <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

export function ProgressBar({ value, max, tone, className }: { value: number; max: number; tone: "rose" | "emerald" | "amber" | "zinc"; className?: string }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  const bar = { rose: "bg-rose-500", emerald: "bg-emerald-500", amber: "bg-amber-500", zinc: "bg-zinc-600" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-800", className)}>
      <div className={cn("h-full rounded-full transition-all duration-300", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ClientOnly({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return <>{mounted ? children : (fallback ?? <div className="h-64 animate-pulse rounded-xl bg-zinc-900/40" />)}</>;
}
