import { cn } from "@/lib/utils";

export type Tone = "neutral" | "indigo" | "emerald" | "amber" | "rose" | "violet";

const tones: Record<Tone, string> = {
  neutral: "border-zinc-700/70 bg-zinc-800/60 text-zinc-300",
  indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
