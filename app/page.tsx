import { Hub } from "@/components/shell/hub";
import { ClientOnly } from "@/components/ui/controls";

export default function HomePage() {
  return (
    <ClientOnly>
      <Hub />
    </ClientOnly>
  );
}
