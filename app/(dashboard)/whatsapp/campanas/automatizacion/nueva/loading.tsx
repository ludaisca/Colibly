import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function AutomatizacionNuevaLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver a campañas"
      maxWidth="max-w-3xl"
      cardLines={[5]}
    />
  );
}
