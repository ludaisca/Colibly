import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function AutomatizacionDetailLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a campañas"
      maxWidth="max-w-3xl"
      cardLines={[3, 4]}
    />
  );
}
