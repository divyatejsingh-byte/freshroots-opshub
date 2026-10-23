import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "./badge";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glow-card", className)} {...props} />;
}

const toneText: Record<Tone, string> = {
  neutral: "text-zinc-100",
  indigo: "text-indigo-300",
  emerald: "text-emerald-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  violet: "text-violet-300",
};

const toneIcon: Record<Tone, string> = {
  neutral: "bg-zinc-800 text-zinc-400",
  indigo: "bg-indigo-500/15 text-indigo-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  rose: "bg-rose-500/15 text-rose-300",
  violet: "bg-violet-500/15 text-violet-300",
};

export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 transition-colors hover:border-zinc-700", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", toneIcon[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums tracking-tight", toneText[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </Card>
  );
}
