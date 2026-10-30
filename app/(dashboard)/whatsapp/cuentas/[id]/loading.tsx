import { DetailPageSkeleton } from "@/app/components/ui/detail-page-skeleton";

export default function CuentaDetailLoading() {
  return (
    <DetailPageSkeleton
      backLabel="Volver"
      cardLines={[4, 3, 2]}
    />
  );
}
