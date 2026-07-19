import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function UsuariosLoading() {
  return (
    <ListPageSkeleton
      title="Usuarios"
      description="Gestión de usuarios y roles del sistema."
      rows={5}
    />
  );
}
