import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function ContactosLoading() {
  return (
    <ListPageSkeleton
      title="Contactos"
      description="Etiquetas, estado de lead y notas por contacto."
      rows={7}
    />
  );
}
