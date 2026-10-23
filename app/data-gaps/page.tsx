import { DataGaps } from "@/components/data/data-gaps";
import { ClientOnly } from "@/components/ui/controls";

export default function DataGapsPage() {
  return (
    <ClientOnly>
      <DataGaps />
    </ClientOnly>
  );
}
