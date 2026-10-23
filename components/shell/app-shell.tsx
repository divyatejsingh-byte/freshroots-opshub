"use client";

import { BarChart3, BellRing, Home, Leaf, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/toast";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Command Hub", icon: Home },
  { href: "/demand-planning", label: "Demand Planning", icon: BarChart3 },
  { href: "/suppliers", label: "Supplier Desk", icon: Truck },
  { href: "/notifications", label: "Digest & Dispatch", icon: BellRing },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1500px] items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_0_14px_rgba(99,102,241,.5)]">
              <Leaf className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              Freshroots <span className="text-zinc-500">OpsHub</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active ? "bg-zinc-800/80 text-zinc-50" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            <ThemeToggle />
            <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-500/20 text-[10px] font-semibold text-indigo-300">RK</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
      <Toaster />
    </div>
  );
}
