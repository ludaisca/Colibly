import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function ConfiguracionIaLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a configuración"
      title="Inteligencia artificial"
      description="La IA viene incluida en tu plan: no necesitas API keys."
      cardLines={[3, 4, 3]}
    />
  );
}
