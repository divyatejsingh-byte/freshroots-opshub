"use client";

import { Leaf, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/controls";
import { safeNext } from "@/lib/auth";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (res.ok) {
        // A full navigation so the new cookie is sent with the very first request
        window.location.assign(safeNext(new URLSearchParams(window.location.search).get("next")));
        return;
      }
      setError(res.status === 401 ? "Wrong password. Try again." : "Sign-in is not available right now.");
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto mt-[12vh] max-w-sm">
      <div className="glow-card p-7">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_0_18px_rgba(99,102,241,.5)]">
          <Leaf className="h-5 w-5 text-white" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-50">Freshroots OpsHub</h1>
        <p className="mt-1 text-sm text-zinc-500">Enter the team password to continue.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Lock className="h-3 w-3" />
              Password
            </span>
            <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
