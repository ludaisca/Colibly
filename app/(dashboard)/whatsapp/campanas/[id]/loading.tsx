import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function CampanaDetailLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a campañas"
      cardLines={[2, 5]}
    />
  );
}
