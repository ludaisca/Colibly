import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function ContactosLoading() {
  return (
    <ListPageSkeleton
      title="Contactos"
      description="Etiquetas, etapa y notas de cada contacto."
      rows={7}
    />
  );
}
