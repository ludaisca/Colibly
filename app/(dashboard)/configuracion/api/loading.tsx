import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function ConfiguracionApiLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a configuración"
      title="API e integraciones"
      description="Conecta SundayCRM con tu ERP, tienda, Zapier/Make o tus propios sistemas."
      cardLines={[3, 3]}
    />
  );
}
