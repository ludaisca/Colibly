import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function ConfiguracionLoading() {
  return (
    <DetailPageSkeleton
      title="Configuración"
      description="Administra tu cuenta y preferencias."
      cardLines={[2, 3, 2, 3, 2, 3, 2]}
    />
  );
}
