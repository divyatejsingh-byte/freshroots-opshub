import { DemandStudio } from "@/components/demand/studio";
import { ClientOnly } from "@/components/ui/controls";

export default function DemandPlanningPage() {
  return (
    <ClientOnly>
      <DemandStudio />
    </ClientOnly>
  );
}
