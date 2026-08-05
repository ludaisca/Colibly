import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function InstagramCuentasLoading() {
  return (
    <ListPageSkeleton
      title="Cuentas Instagram"
      description="Administra las cuentas profesionales de Instagram conectadas para mensajería directa."
      rows={4}
    />
  );
}
