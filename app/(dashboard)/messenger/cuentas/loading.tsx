import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function MessengerCuentasLoading() {
  return (
    <ListPageSkeleton
      title="Cuentas Messenger"
      description="Administra las Páginas de Facebook conectadas para mensajería de Messenger."
      rows={4}
    />
  );
}
