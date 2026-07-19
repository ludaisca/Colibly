import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function PlantillasLoading() {
  return (
    <ListPageSkeleton
      title="Plantillas"
      description="Gestiona las plantillas de mensaje de tus cuentas WhatsApp."
      rows={6}
    />
  );
}
