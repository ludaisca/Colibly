import { ListPageSkeleton } from "@/app/components/ui/list-page-skeleton";

export default function CampanasLoading() {
  return (
    <ListPageSkeleton
      title="Campañas"
      description="Envía mensajes masivos usando plantillas de WhatsApp, manualmente o disparados en automático desde una hoja de Google Sheets."
      rows={5}
    />
  );
}
