import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function UsuariosLoading() {
  return (
    <ListPageSkeleton
      title="Usuarios"
      description="Tu equipo y sus roles en este espacio."
      rows={5}
    />
  );
}
