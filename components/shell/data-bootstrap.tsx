"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { useDemandStore } from "@/lib/store";

/** On first load, swaps the bundled CSV data for Supabase data when the server has it configured */
export function DataBootstrap() {
  const hydrateRemote = useDemandStore((s) => s.hydrateRemote);
  useEffect(() => {
    hydrateRemote()
      .then((r) => {
        if (r.error) toast.warning("Supabase unavailable, using bundled files", r.error);
      })
      .catch(() => toast.warning("Supabase unavailable, using bundled files"));
  }, [hydrateRemote]);
  return null;
}
