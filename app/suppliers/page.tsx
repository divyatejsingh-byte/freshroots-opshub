import { SupplierDesk } from "@/components/suppliers/desk";
import { ClientOnly } from "@/components/ui/controls";

export default function SuppliersPage() {
  return (
    <ClientOnly>
      <SupplierDesk />
    </ClientOnly>
  );
}
