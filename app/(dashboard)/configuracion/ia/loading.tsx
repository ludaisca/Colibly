import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function ConfiguracionIaLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a configuración"
      title="Configuración IA"
      description="Administra las API keys y preferencias de los proveedores de inteligencia artificial."
      cardLines={[3, 4, 3]}
    />
  );
}
