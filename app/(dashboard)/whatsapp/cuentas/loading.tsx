import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function CuentasLoading() {
  return (
    <ListPageSkeleton
      title="Cuentas WhatsApp"
      description="Administra los números de WhatsApp Business conectados."
      rows={4}
    />
  );
}
