import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";
import { BRAND_NAME } from "@/lib/brand";

export default function ConfiguracionApiLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a configuración"
      title="API e integraciones"
      description={`Conecta ${BRAND_NAME} con tu ERP, tienda, Zapier/Make o tus propios sistemas.`}
      cardLines={[3, 3]}
    />
  );
}
