"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "info" | "warning";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

const useToastStore = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; dismiss: (id: number) => void }>(
  (set) => ({
    items: [],
    push: (t) => {
      const id = Date.now() + Math.random();
      set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }));
      setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 4200);
    },
    dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  })
);

export const toast = {
  success: (title: string, body?: string) => useToastStore.getState().push({ kind: "success", title, body }),
  info: (title: string, body?: string) => useToastStore.getState().push({ kind: "info", title, body }),
  warning: (title: string, body?: string) => useToastStore.getState().push({ kind: "warning", title, body }),
};

const icons = { success: CheckCircle2, info: Info, warning: AlertTriangle };
const tones = { success: "text-emerald-400", info: "text-indigo-400", warning: "text-amber-400" };

export function Toaster() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => {
        const Icon = icons[t.kind];
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex animate-pop-in items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/95 p-3 text-left shadow-xl backdrop-blur"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tones[t.kind])} />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-100">{t.title}</span>
              {t.body && <span className="mt-0.5 block text-xs text-zinc-400">{t.body}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
