import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function CampanaNuevaLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a campañas"
      maxWidth="max-w-4xl"
      cardLines={[6]}
    />
  );
}
