import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function CampanaNuevaLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a campañas"
      cardLines={[6]}
    />
  );
}
